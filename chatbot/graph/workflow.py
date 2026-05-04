"""
LangGraph workflow for the NovaMart analytics chatbot.
"""
from __future__ import annotations

import json
import os
import unicodedata
from typing import Any

from langgraph.graph import END, StateGraph

from agents.analysis import analysis_agent
from agents.error_agent import error_agent
from agents.guardrails import guardrails_agent
from agents.query_planner import query_planner_agent
from agents.scope_guard import scope_guard_agent
from agents.sql_agent import execute_sql, sql_agent
from agents.state import AgentState
from agents.visualization import visualization_agent
from error_messages import is_security_block, message_for
from llm_provider import get_chat_model


EMPTY_RESULT_MODEL = os.getenv(
    "EMPTY_RESULT_MODEL",
    os.getenv("ANALYSIS_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini")),
)
_empty_result_llm: Any = None

EMPTY_RESULT_PROMPT = """You are NovaMart's Turkish e-commerce data assistant.
The SQL query executed safely but returned zero rows. Write one short Turkish sentence that explains the empty result in the exact context of the user's question.

Rules:
- Do not invent data.
- Do not classify the question by a fixed list of sample questions. Infer the missing result from the user's actual wording, query_plan intent, entities, metrics, dimensions, filters, and date_filter.
- Do not say "sipariş bulunamadı" unless the user actually asked about orders.
- For reviews/ratings, infer the exact review/rating condition from the question and query_plan. Do not force every review question into one specific rating.
- For inventory, products, shipments, customers, revenue, rankings, or trends, explain the missing result in that domain instead of using an order-related message.
- Mention "Mağazanızda" for CORPORATE, "Hesabınızda" for INDIVIDUAL, and "Sistemde" for ADMIN.
- If date_filter has an exact date/range, include it naturally.
- Keep it concise and user-friendly.
- Return only the sentence.

Role: {role}
Question: {question}
Query plan JSON: {query_plan}
"""


def after_guardrails(state: dict) -> str:
    if state.get("is_in_scope"):
        return "query_planner"
    return END


def after_execute_sql(state: dict) -> str:
    error = str(state.get("error", ""))
    if error:
        if error.startswith("ACCESS_DENIED") or is_security_block(error):
            return "final_error"
        if state.get("iteration_count", 0) < 3:
            return "error_agent"
        return "final_error"
    return "analysis_agent"


def after_scope_guard(state: dict) -> str:
    error = str(state.get("error", ""))
    if error.startswith("ACCESS_DENIED"):
        return "final_error"
    return "sql_agent"


def final_error_agent(state: dict) -> dict:
    error = str(state.get("error", "unknown error"))

    if error == "EMPTY_RESULT":
        return {
            "final_answer": _empty_result_message(state),
            "blocked_reason": error,
        }

    return {
        "final_answer": message_for(error),
        "blocked_reason": error,
    }


def _empty_result_message(state: dict) -> str:
    llm_message = _llm_empty_result_message(state)
    if llm_message:
        return llm_message

    role = str(state.get("role", "")).upper()
    query_plan = state.get("query_plan") or {}
    date_filter = query_plan.get("date_filter") if isinstance(query_plan, dict) else {}
    question = str(state.get("question", "")).lower()
    entities = _plan_values(query_plan, "entities")
    metrics = _plan_values(query_plan, "metrics")
    intent = str(query_plan.get("intent") if isinstance(query_plan, dict) else "").lower()
    date_text = ""

    if isinstance(date_filter, dict):
        start_date = date_filter.get("start_date")
        end_date = date_filter.get("end_date")
        if start_date and start_date == end_date:
            date_text = f" {start_date} tarihinde"
        elif start_date and end_date:
            date_text = f" {start_date} - {end_date} tarihleri arasında"

    owner = _empty_owner(role)
    subject = _empty_subject(question, intent, entities, metrics)
    return f"{owner}{date_text} {subject} bulunamadı."


def _llm_empty_result_message(state: dict) -> str:
    try:
        response = _get_empty_result_llm().invoke(
            EMPTY_RESULT_PROMPT.format(
                role=str(state.get("role", "INDIVIDUAL")).upper(),
                question=str(state.get("question", "")),
                query_plan=json.dumps(state.get("query_plan") or {}, ensure_ascii=False),
            )
        )
    except Exception:
        return ""

    content = str(response.content or "").strip()
    if not content:
        return ""
    return content.replace("**", "").replace("__", "").splitlines()[0].strip()


def _get_empty_result_llm() -> Any:
    global _empty_result_llm
    if _empty_result_llm is None:
        _empty_result_llm = get_chat_model(EMPTY_RESULT_MODEL, temperature=0)
    return _empty_result_llm


def _plan_values(query_plan: dict, key: str) -> set[str]:
    if not isinstance(query_plan, dict):
        return set()
    raw = query_plan.get(key) or []
    if not isinstance(raw, list):
        return set()
    return {str(value).strip().lower() for value in raw if str(value).strip()}


def _empty_owner(role: str) -> str:
    if role == "CORPORATE":
        return "Mağazanızda"
    if role == "INDIVIDUAL":
        return "Hesabınızda"
    return "Sistemde"


def _empty_subject(question: str, intent: str, entities: set[str], metrics: set[str]) -> str:
    normalized_question = _ascii_text(question)

    if "reviews" in entities or "yorum" in normalized_question or "yildiz" in normalized_question:
        return "sorduğunuz yorum veya puanlama kriterine uygun sonuç"

    if "products" in entities and (
        "inventory" in intent
        or "stock_quantity" in metrics
        or "stok" in normalized_question
        or "stock" in normalized_question
    ):
        return "sorduğunuz ürün veya stok kriterine uygun sonuç"

    if "shipments" in entities or "shipment" in intent or "sevkiyat" in normalized_question or "kargo" in normalized_question:
        return "sorduğunuz sevkiyat kriterine uygun sonuç"

    if "orders" in entities or "order" in intent or "siparis" in normalized_question:
        return "sorduğunuz sipariş kriterine uygun sonuç"

    if "customers" in entities or "users" in entities or "musteri" in normalized_question:
        return "sorduğunuz müşteri kriterine uygun sonuç"

    if "revenue" in metrics or "ciro" in normalized_question or "gelir" in normalized_question:
        return "sorduğunuz gelir veya ciro kriterine uygun sonuç"

    return "sorduğunuz kritere uygun sonuç"


def _ascii_text(value: str) -> str:
    translated = value.translate(str.maketrans({
        "ç": "c",
        "ğ": "g",
        "ı": "i",
        "İ": "i",
        "ö": "o",
        "ş": "s",
        "ü": "u",
    }))
    return unicodedata.normalize("NFKD", translated).encode("ascii", "ignore").decode("ascii").lower()


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("guardrails", guardrails_agent)
    graph.add_node("query_planner", query_planner_agent)
    graph.add_node("scope_guard", scope_guard_agent)
    graph.add_node("sql_agent", sql_agent)
    graph.add_node("execute_sql", execute_sql)
    graph.add_node("error_agent", error_agent)
    graph.add_node("analysis_agent", analysis_agent)
    graph.add_node("visualization_agent", visualization_agent)
    graph.add_node("final_error", final_error_agent)

    graph.set_entry_point("guardrails")
    graph.add_conditional_edges("guardrails", after_guardrails)
    graph.add_edge("query_planner", "scope_guard")
    graph.add_conditional_edges("scope_guard", after_scope_guard)
    graph.add_edge("sql_agent", "execute_sql")
    graph.add_conditional_edges("execute_sql", after_execute_sql)
    graph.add_edge("error_agent", "execute_sql")
    graph.add_edge("analysis_agent", "visualization_agent")
    graph.add_edge("visualization_agent", END)
    graph.add_edge("final_error", END)

    return graph.compile()


workflow = build_graph()
