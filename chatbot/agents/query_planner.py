"""
LLM query planner.
Turns the user's natural-language analytics request into a structured plan.
The planner does not write SQL; it extracts intent, date windows, limits, scope,
metrics, dimensions, and sorting so SQL generation can stay generic.
"""
from __future__ import annotations

import json
import os
from typing import Any

from llm_provider import get_chat_model


PLANNER_MODEL = os.getenv(
    "PLANNER_MODEL",
    os.getenv("OPENAI_PLANNER_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini")),
)
_llm: Any = None

PLANNER_PROMPT = """You are a query planner for NovaMart's e-commerce analytics chatbot.
The user usually asks in Turkish. Do not write SQL.

Return one valid JSON object only. No markdown.

Session context:
- role: {role}
- user_id: {user_id}
- active_store_id: {active_store_id}
- allowed_store_ids: {allowed_store_ids}
- current_date: {current_date}

User question:
{question}

Plan schema:
{{
  "intent": "short semantic intent such as order_list, sales_ranking, inventory, shipment_status, trend, aggregate, unknown",
  "scope": "public_aggregate | current_user | allowed_stores | admin | unknown",
  "entities": ["orders", "order_items", "products", "stores", "shipments", "categories", "reviews", "users"],
  "metrics": ["units_sold", "revenue", "order_count", "stock_quantity", "delay_rate"],
  "dimensions": ["product", "store", "category", "status", "date"],
  "requested_store": {{
    "name": "store name explicitly mentioned by the user, or null",
    "resolved_ids": [],
    "allowed_ids": []
  }},
  "date_filter": {{
    "type": "none | exact_date | date_range | relative_days | current_day | yesterday | tomorrow | current_week | current_month | previous_month",
    "start_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null",
    "relative_days": null
  }},
  "limit": null,
  "sort": {{"field": null, "direction": "asc | desc | null"}},
  "needs_aggregation": false,
  "result_granularity": "single_value | list | ranking | trend | distribution | unknown",
  "language": "tr | en | other",
  "notes": "brief reasoning for ambiguous parts"
}}

Rules:
- Interpret dates from the user's words using current_date.
- If the user says bugun/bugün/today, set date_filter.type to current_day and set start_date/end_date to current_date.
- If the user writes an exact date, set exact_date and keep that date.
- If the user says son N gun/gün/days, set relative_days to N and calculate start_date/end_date from current_date.
- If the user asks for "top 5", "ilk 10", "5 tane", or similar, set limit to that number.
- If the user does not specify a limit, set limit to null. Do not invent one.
- For order_list requests, include orders, order_items, and products in entities when the schema supports product details.
- If the user explicitly names a store, seller, or magazasi/mağazası, copy that name into requested_store.name exactly as a store reference. Example: "Retail Austria magazasindan" -> "Retail Austria".
- If the user says only "magazam/my store/my stores" without a specific store name, requested_store.name must be null.
- Do not decide by fixed keyword tables; use the meaning of the question.
- Keep private requests scoped to current_user or allowed_stores when the wording implies "my/my store".
- General rankings, totals, trends, and distributions should normally be public_aggregate unless the user asks for private data.
"""


def query_planner_agent(state: dict) -> dict:
    response = _get_llm().invoke(
        PLANNER_PROMPT.format(
            question=state["question"],
            role=state.get("role", "INDIVIDUAL"),
            user_id=state.get("user_id", 0),
            active_store_id=state.get("active_store_id"),
            allowed_store_ids=state.get("allowed_store_ids", []),
            current_date=state.get("current_date", ""),
        )
    )
    return {"query_plan": _parse_plan(response.content or "", state)}


def _parse_plan(raw: str, state: dict) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    try:
        parsed = json.loads(text.strip())
    except json.JSONDecodeError:
        return _fallback_plan(state, "planner_json_parse_failed")
    if not isinstance(parsed, dict):
        return _fallback_plan(state, "planner_returned_non_object")
    return parsed


def _fallback_plan(state: dict, reason: str) -> dict[str, Any]:
    return {
        "intent": "unknown",
        "scope": "unknown",
        "entities": [],
        "metrics": [],
        "dimensions": [],
        "requested_store": {
            "name": None,
            "resolved_ids": [],
            "allowed_ids": [],
        },
        "date_filter": {
            "type": "none",
            "start_date": None,
            "end_date": None,
            "relative_days": None,
        },
        "limit": None,
        "sort": {"field": None, "direction": None},
        "needs_aggregation": False,
        "result_granularity": "unknown",
        "language": "tr",
        "notes": reason,
    }


def _get_llm() -> Any:
    global _llm
    if _llm is None:
        _llm = get_chat_model(PLANNER_MODEL, temperature=0)
    return _llm
