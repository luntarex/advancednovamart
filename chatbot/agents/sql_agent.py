"""
SQL agent and execution node.
"""
from __future__ import annotations

import os
import re
from typing import Any
from llm_provider import get_chat_model
from db.connection import get_schema, execute_query
from security import validate_sql_shape, validate_scope

SQL_MODEL = os.getenv(
    "SQL_MODEL",
    os.getenv("OPENAI_SQL_MODEL", os.getenv("LLM_MODEL", "gemini-2.0-flash")),
)
_llm: Any = None

SQL_PROMPT = """You are a senior MySQL analytics assistant.
Convert the question into a single, safe SELECT query.

DATABASE SCHEMA:
{schema}

SESSION CONTEXT:
- role: {role}
- user_id: {user_id}
- active_store_id: {active_store_id}
- allowed_store_ids: {allowed_store_ids}

MANDATORY SECURITY RULES:
1. Output a single SELECT statement only.
2. Never output INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, UNION, comments, or multi statements.
3. Never use SELECT * . Always select explicit columns.
4. Never access sensitive columns (password, password_hash, api_key, secret, refresh_token, internal_cost, supplier_margin, cost_price, is_admin).
5. Role scope enforcement is mandatory:
   - ADMIN: no scope restriction.
   - CORPORATE: every relevant query must include store_id filter using only allowed_store_ids.
   - INDIVIDUAL: every relevant query must include user_id = session user_id.
6. Use LIMIT 50 unless user asked a lower number.

Question: {question}
Return only SQL.
"""


def sql_agent(state: dict) -> dict:
    question = state["question"]
    deterministic_sql = _deterministic_sql(question, state)
    if deterministic_sql:
        return {"sql_query": deterministic_sql}

    schema = get_schema()

    response = _get_llm().invoke(
        SQL_PROMPT.format(
            schema=schema,
            question=question,
            role=state.get("role", "INDIVIDUAL"),
            user_id=state.get("user_id", 0),
            active_store_id=state.get("active_store_id"),
            allowed_store_ids=state.get("allowed_store_ids", []),
        )
    )
    sql = (response.content or "").strip()

    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1] if "\n" in sql else sql[3:]
    if sql.endswith("```"):
        sql = sql[:-3]

    sql = sql.strip().rstrip(";")
    return {"sql_query": sql}


def _deterministic_sql(question: str, state: dict) -> str:
    normalized = question.lower()
    role = str(state.get("role", "INDIVIDUAL")).upper()

    if role == "INDIVIDUAL" and "order" in normalized and any(word in normalized for word in ("last", "recent")):
        limit_match = re.search(r"\b(\d{1,2})\b", normalized)
        limit = min(int(limit_match.group(1)), 50) if limit_match else 5
        user_id = int(state.get("user_id", 0))
        return (
            "SELECT o.id, o.status, o.grand_total, o.payment_method, o.order_date "
            "FROM orders o "
            f"WHERE o.user_id = {user_id} "
            "ORDER BY o.order_date DESC, o.id DESC "
            f"LIMIT {limit}"
        )

    return ""


def _get_llm() -> Any:
    global _llm
    if _llm is None:
        _llm = get_chat_model(SQL_MODEL, temperature=0)
    return _llm


def execute_sql(state: dict) -> dict:
    sql = (state.get("sql_query") or "").strip()

    valid_shape, shape_msg = validate_sql_shape(sql)
    if not valid_shape:
        return {
            "error": shape_msg,
            "query_result": "",
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    valid_scope, scope_msg = validate_scope(
        sql=sql,
        role=state.get("role", "INDIVIDUAL"),
        user_id=int(state.get("user_id", 0)),
        allowed_store_ids=state.get("allowed_store_ids", []),
    )
    if not valid_scope:
        return {
            "error": scope_msg,
            "query_result": "",
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    result, error = execute_query(sql)
    if error:
        return {
            "error": error,
            "query_result": "",
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    return {
        "query_result": result,
        "error": "",
    }
