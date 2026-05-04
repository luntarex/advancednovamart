"""
Error-fix agent for SQL retries.
"""
from __future__ import annotations

import os
import json
from typing import Any
from llm_provider import get_chat_model
from db.connection import get_schema

ERROR_MODEL = os.getenv(
    "ERROR_MODEL",
    os.getenv("OPENAI_ERROR_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini")),
)
_llm: Any = None

ERROR_FIX_PROMPT = """You are fixing a failed MySQL SELECT query for NovaMart.
The original question will usually be in Turkish. Understand Turkish e-commerce terms such as sipariş, ürün, satış, harcama, ödeme, kargo, teslimat, müşteri, stok, kategori, sepet, iade, and indirim.

Original question: {question}
Role: {role}
User ID: {user_id}
Allowed store IDs: {allowed_store_ids}
Current date: {current_date}
Query plan JSON:
{query_plan}

Failed SQL:
{sql_query}

Error:
{error}

Schema:
{schema}

Rules:
- Output one SELECT statement only
- No SELECT *
- No UNION/comments/multi statement
- Keep required role scope constraints
- For individual users, keep user_id = session user_id scope
- For Turkish order-list questions, include product names when the schema has order_items and products. Join orders -> order_items -> products and select `GROUP_CONCAT(DISTINCT p.name SEPARATOR ', ') AS product_names`; keep one row per order with GROUP BY order id.
- Follow Query plan JSON for intent, scope, date filters, limit, metrics, dimensions, and sorting.
- If Error is EMPTY_RESULT for an exact day/date request, keep the exact date and do not broaden it.
- For exact calendar dates written by the user, keep that exact date.
- Exact day filters represent the whole calendar day. If a failed query compares a DATETIME/TIMESTAMP column directly with `column = 'YYYY-MM-DD'`, rewrite it with `DATE(column) = 'YYYY-MM-DD'` or a half-open range from that date to the next day.
- For "bugün/bugun/today", use Current date above, not the latest available database date and not MySQL CURRENT_DATE.
- For "dün/dun/yesterday" and "yarın/yarin/tomorrow", calculate the date relative to Current date above.
- For EMPTY_RESULT caused by broad relative periods such as "bu ay", "geçen ay", "son zamanlarda", "recent", or "last 30 days", you may anchor the period to the latest available order_date in the database, but do not broaden an exact day/date request.
- For trend, anomaly, increase/decrease, comparison, or rate questions, use conditional aggregation and comparable recent/previous windows so the answer can infer from the latest available data.
- Prefer broader aggregate windows over exact empty filters, but never expose private rows outside the role scope.

Return only SQL.
"""


def error_agent(state: dict) -> dict:
    schema = get_schema()
    response = _get_llm().invoke(
        ERROR_FIX_PROMPT.format(
            question=state["question"],
            role=state.get("role", "INDIVIDUAL"),
            user_id=state.get("user_id", 0),
            allowed_store_ids=state.get("allowed_store_ids", []),
            current_date=state.get("current_date", ""),
            query_plan=json.dumps(state.get("query_plan", {}), ensure_ascii=False),
            sql_query=state["sql_query"],
            error=state["error"],
            schema=schema,
        )
    )

    fixed_sql = (response.content or "").strip()
    if fixed_sql.startswith("```"):
        fixed_sql = fixed_sql.split("\n", 1)[1] if "\n" in fixed_sql else fixed_sql[3:]
    if fixed_sql.endswith("```"):
        fixed_sql = fixed_sql[:-3]

    return {"sql_query": fixed_sql.strip().rstrip(";")}


def _get_llm() -> Any:
    global _llm
    if _llm is None:
        _llm = get_chat_model(ERROR_MODEL, temperature=0)
    return _llm
