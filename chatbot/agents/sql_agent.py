"""
SQL agent and execution node.
"""
from __future__ import annotations

import json
import os
from typing import Any

from db.connection import execute_query, get_schema
from llm_provider import get_chat_model
from security import validate_scope, validate_sql_shape


SQL_MODEL = os.getenv(
    "SQL_MODEL",
    os.getenv("OPENAI_SQL_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini")),
)
_llm: Any = None

SQL_PROMPT = """You are a senior MySQL analytics assistant for NovaMart.
The user will mostly ask in Turkish. Convert the request into one safe MySQL SELECT query.

DATABASE SCHEMA:
{schema}

SESSION CONTEXT:
- role: {role}
- user_id: {user_id}
- active_store_id: {active_store_id}
- allowed_store_ids: {allowed_store_ids}
- current_date: {current_date}
- max_result_limit: {max_result_limit}

QUERY PLAN JSON:
{query_plan}

ACCESS RULES:
1. Public aggregate data is allowed for every role. Public aggregate means grouped/summarized business data such as top sold products, top sellers/stores, category sales, total counts, or trends. It must not expose raw user, address, profile, or individual order details.
2. Private individual data must be scoped to the session user: use o.user_id = {user_id} or equivalent only when the plan scope is current_user.
3. Private corporate/store data must be scoped to allowed_store_ids only when the plan scope is allowed_stores. Never expose another single store's private details.
4. General rankings, totals, trends, and distributions should stay public aggregate unless the plan explicitly requests private user/store data.

MANDATORY SQL SAFETY RULES:
1. Output a single SELECT statement only.
2. Never output INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, UNION, comments, or multi statements.
3. Never use SELECT * . Always select explicit columns.
4. Never access sensitive columns: password, password_hash, api_key, secret, refresh_token, email, phone, address_line, tracking_number, stripe_session_id, internal_cost, supplier_margin, cost_price, is_admin.
5. For public aggregate queries, do not select user_id, owner_id, email, address_line, phone, tracking_number, stripe_session_id, raw order IDs, or customer profile rows.
6. Use the plan's limit when it is set. If the plan limit is null and the query can return multiple rows, use max_result_limit only as a safety cap.

QUERY QUALITY RULES:
- Follow QUERY PLAN JSON for intent, date_filter, metrics, dimensions, sort, limit, and scope.
- If QUERY PLAN JSON has requested_store.allowed_ids, filter store-scoped queries to those ids. If requested_store.name exists but allowed_ids is empty, do not silently use active_store_id or other allowed stores.
- For exact date/current_day/yesterday/tomorrow filters, keep the exact calculated date from the plan. Do not replace it with the latest database date.
- Exact day filters represent the whole calendar day. If the schema column is DATETIME/TIMESTAMP, do not compare it directly with `column = 'YYYY-MM-DD'`; use `DATE(column) = 'YYYY-MM-DD'` or a half-open range from that date to the next day.
- For relative_days or date_range filters, use the start_date/end_date from the plan when present.
- For broad analytics where the plan has no exact date, you may use the latest available order_date in the database if that avoids a meaningless empty current-calendar period.
- For order_list intent, always include product names when the schema has order_items and products. Join orders -> order_items -> products and select `GROUP_CONCAT(DISTINCT p.name SEPARATOR ', ') AS product_names`; keep one row per order with GROUP BY o.id. Do not omit product_names from order list queries.
- For rankings and distributions, return multiple rows and preserve useful aliases such as product_name, seller_name, store_name, units_sold, order_count, total_revenue, category_name, shipment_status, delayed_shipments, and rate columns.
- For delayed shipments, compare estimated_delivery to current_date from SESSION CONTEXT rather than MySQL CURRENT_DATE.
- If the schema does not support part of the plan, write the closest safe SELECT that answers the user's intent.

Question: {question}
Return only SQL.
"""


def sql_agent(state: dict) -> dict:
    schema = get_schema()
    query_plan = state.get("query_plan") or {}

    response = _get_llm().invoke(
        SQL_PROMPT.format(
            schema=schema,
            question=state["question"],
            role=state.get("role", "INDIVIDUAL"),
            user_id=state.get("user_id", 0),
            active_store_id=state.get("active_store_id"),
            allowed_store_ids=state.get("allowed_store_ids", []),
            current_date=state.get("current_date", ""),
            max_result_limit=_max_result_limit(),
            query_plan=json.dumps(query_plan, ensure_ascii=False),
        )
    )
    sql = _strip_sql_response(response.content or "")
    return {"sql_query": sql}


def _strip_sql_response(raw: str) -> str:
    sql = raw.strip()
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1] if "\n" in sql else sql[3:]
    if sql.endswith("```"):
        sql = sql[:-3]
    return sql.strip().rstrip(";")


def _max_result_limit() -> int:
    try:
        return max(1, int(os.getenv("CHATBOT_MAX_RESULT_LIMIT", "50")))
    except ValueError:
        return 50


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
            "blocked_reason": scope_msg,
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
    if result.strip() == "[]":
        return {
            "error": "EMPTY_RESULT",
            "query_result": result,
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    return {
        "query_result": result,
        "error": "",
    }
