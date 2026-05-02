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

SQL_PROMPT = """You are a senior MySQL analytics assistant for NovaMart.
The user will mostly ask in Turkish. Understand Turkish e-commerce questions naturally and convert them into one safe MySQL SELECT query.

Common Turkish meanings:
- sipariş/siparis = order
- satış/satis = sale
- satılan/satilan = sold
- satan/satıcı/satici = seller/store
- ürün/urun = product
- müşteri/musteri = customer
- harcama/harcadım = spending
- alışveriş/alisveris = shopping
- ödeme/odeme = payment
- kargo/teslimat = shipment/delivery
- sepet = cart
- iade = return/refund

DATABASE SCHEMA:
{schema}

SESSION CONTEXT:
- role: {role}
- user_id: {user_id}
- active_store_id: {active_store_id}
- allowed_store_ids: {allowed_store_ids}

ACCESS RULES:
1. Public aggregate data is allowed for every role. Public aggregate means grouped/summarized business data such as top sold products, top sellers/stores, category sales, total counts, or trends. It must not expose raw user, address, profile, or individual order details.
2. Private individual data must be scoped to the session user: use o.user_id = {user_id} or equivalent only when the user asks about their own orders, spending, reviews, cart, addresses, or personal activity.
3. Private corporate/store data must be scoped to allowed_store_ids only when the user asks about their own store operations. Never expose another single store's private details.
4. If the Turkish question asks generally for "en çok satılan ürünler", "en çok ürün satan satıcılar", "genel satışlar", or similar, DO NOT add user_id = {user_id}. Treat it as public aggregate.
5. Only use user_id scope when the wording clearly says "benim", "kendi", "siparişim", "harcadım", "aldığım", "yorumlarım", or otherwise asks for personal data.

MANDATORY SQL SAFETY RULES:
1. Output a single SELECT statement only.
2. Never output INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, UNION, comments, or multi statements.
3. Never use SELECT * . Always select explicit columns.
4. Never access sensitive columns (password, password_hash, api_key, secret, refresh_token, internal_cost, supplier_margin, cost_price, is_admin).
5. For public aggregate queries, do not select user_id, owner_id, email, address_line, phone, tracking_number, stripe_session_id, raw order IDs, or customer profile rows.
6. Use LIMIT 50 unless the user asked a lower number.

QUERY QUALITY RULES:
- For top sold products, join order_items oi, orders o, products p, and stores s when seller/store name is needed.
- For top sellers/satıcılar, use stores.name as seller_name and aggregate sold quantity/revenue/order count.
- Good public aggregate aliases: product_name, seller_name, units_sold, order_count, total_revenue, category_name.
- For order lists about the current user's own orders, include product details when available and keep user_id scope.
- For order lists, prefer one row per order. Use GROUP_CONCAT for product names/items when an order has multiple products.
- For "son", "son 5", "en son", "recent", or "last" orders, order by o.order_date DESC, o.id DESC.

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