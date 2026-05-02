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
- For relative dates such as "bu ay", "geçen ay", "son zamanlarda", "recent", "last month", or "last 30 days", anchor the period to the latest available order_date in the database, not to wall-clock CURRENT_DATE. Use a subquery like SELECT MAX(order_date) FROM orders when needed.
- For trend, anomaly, increase/decrease, comparison, or change questions, return inference-friendly aggregate columns: current_period_value, previous_period_value, absolute_change, percent_change, and the latest data date/month when possible.
- For rate/ratio questions, use conditional aggregation over all relevant rows; do not require every status to exist. Include total_count plus numerator counts and percentage columns.
- If a narrow date filter could produce no rows, prefer the latest available comparable period in the data instead of returning an empty current-calendar period.
- For logistics/shipping/delivery questions, prioritize the shipments table. Use shipment status, mode, warehouse, estimated_delivery, and last_updated. "Gecikmiş/delayed" means status is not DELIVERED and estimated_delivery is before CURDATE(); "teslim edilmemiş/not delivered" means shipment status is not DELIVERED.
- If the question is about shipment/delivery distribution, delays, or not-delivered orders, return shipment counts and rates grouped by a relevant logistics dimension such as shipment_status, shipment_mode, or warehouse. Do not use order_items.quantity unless the user explicitly asks for product quantities.
- For plural list/ranking requests, return multiple rows. If the user does not specify a count, use LIMIT 10; do not use LIMIT 1 unless the user explicitly asks for one item.
- For plural superlative requests such as "en dusuk", "en yuksek", "en cok", "en az", "top", or "bottom", do not use MIN/MAX alone. Return a ranked row list using ORDER BY the relevant metric and LIMIT N.
- For inventory/stock ranking questions, query products.stock_quantity and stores.name. Use aliases product_name, store_name, stock_quantity, unit_price; order low-stock requests by stock_quantity ASC.

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
    sql = _enforce_multi_row_limit(sql, question)
    return {"sql_query": sql}


def _deterministic_sql(question: str, state: dict) -> str:
    normalized = _normalize_turkish(question)
    role = str(state.get("role", "INDIVIDUAL")).upper()

    if role == "ADMIN" and _is_anomalous_order_growth_query(normalized):
        return (
            "SELECT ranked.user_id, ranked.recent_30d_order_count, ranked.previous_30d_order_count, "
            "ranked.order_count_increase, ranked.increase_rate_percent, ranked.analysis_window_end, "
            "CASE "
            "WHEN ranked.previous_30d_order_count = 0 AND ranked.recent_30d_order_count >= 2 THEN 'Yeni/ani artış' "
            "WHEN ranked.previous_30d_order_count > 0 AND ranked.recent_30d_order_count >= ranked.previous_30d_order_count * 2 THEN 'Normalin üzerinde artış' "
            "WHEN ranked.order_count_increase > 0 THEN 'Artış var' "
            "ELSE 'Belirgin artış yok' "
            "END AS inference "
            "FROM ("
            "SELECT o.user_id, "
            "SUM(CASE WHEN o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent_30d_order_count, "
            "SUM(CASE WHEN o.order_date < DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) THEN 1 ELSE 0 END) AS previous_30d_order_count, "
            "SUM(CASE WHEN o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) THEN 1 ELSE 0 END) - "
            "SUM(CASE WHEN o.order_date < DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) THEN 1 ELSE 0 END) AS order_count_increase, "
            "ROUND(CASE "
            "WHEN SUM(CASE WHEN o.order_date < DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) THEN 1 ELSE 0 END) = 0 "
            "THEN SUM(CASE WHEN o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) THEN 1 ELSE 0 END) * 100 "
            "ELSE ("
            "(SUM(CASE WHEN o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) THEN 1 ELSE 0 END) - "
            "SUM(CASE WHEN o.order_date < DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) THEN 1 ELSE 0 END)) * 100.0 / "
            "SUM(CASE WHEN o.order_date < DATE_SUB(latest.max_order_date, INTERVAL 30 DAY) "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) THEN 1 ELSE 0 END)"
            ") END, 2) AS increase_rate_percent, "
            "latest.max_order_date AS analysis_window_end "
            "FROM orders o "
            "JOIN (SELECT MAX(order_date) AS max_order_date FROM orders WHERE status <> 'CART') latest "
            "WHERE o.status <> 'CART' "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 60 DAY) "
            "GROUP BY o.user_id, latest.max_order_date"
            ") ranked "
            "WHERE ranked.recent_30d_order_count > 0 OR ranked.previous_30d_order_count > 0 "
            "ORDER BY ranked.order_count_increase DESC, ranked.increase_rate_percent DESC, ranked.recent_30d_order_count DESC "
            "LIMIT 20"
        )

    if _is_store_status_rate_query(normalized):
        return (
            "SELECT s.name AS store_name, "
            "COUNT(o.id) AS total_orders, "
            "SUM(CASE WHEN o.status = 'DELIVERED' THEN 1 ELSE 0 END) AS completed_orders, "
            "SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders, "
            "ROUND(SUM(CASE WHEN o.status = 'DELIVERED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(o.id), 0), 2) AS completed_rate_percent, "
            "ROUND(SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(o.id), 0), 2) AS cancelled_rate_percent "
            "FROM stores s "
            "LEFT JOIN orders o ON o.store_id = s.id AND o.status <> 'CART' "
            "GROUP BY s.id, s.name "
            "HAVING total_orders > 0 "
            "ORDER BY total_orders DESC, cancelled_rate_percent DESC "
            "LIMIT 50"
        )

    if _is_shipment_distribution_query(normalized):
        problem_filter = "AND sh.status <> 'DELIVERED' " if _is_shipment_issue_query(normalized) else ""
        return (
            "SELECT sh.status AS shipment_status, "
            "COALESCE(sh.mode, 'Bilinmiyor') AS shipment_mode, "
            "COUNT(sh.id) AS total_shipments, "
            "SUM(CASE WHEN sh.status <> 'DELIVERED' THEN 1 ELSE 0 END) AS not_delivered_shipments, "
            "SUM(CASE WHEN sh.status <> 'DELIVERED' AND sh.estimated_delivery < CURDATE() THEN 1 ELSE 0 END) AS delayed_shipments, "
            "ROUND(SUM(CASE WHEN sh.status <> 'DELIVERED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(sh.id), 0), 2) AS not_delivered_rate_percent, "
            "ROUND(SUM(CASE WHEN sh.status <> 'DELIVERED' AND sh.estimated_delivery < CURDATE() THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(sh.id), 0), 2) AS delayed_rate_percent, "
            "MAX(sh.estimated_delivery) AS latest_estimated_delivery "
            "FROM shipments sh "
            "JOIN orders o ON sh.order_id = o.id "
            "WHERE o.status <> 'CART' "
            f"{problem_filter}"
            "GROUP BY sh.status, sh.mode "
            "ORDER BY delayed_shipments DESC, not_delivered_shipments DESC, total_shipments DESC "
            "LIMIT 20"
        )

    if _is_top_store_revenue_query(normalized):
        return (
            "SELECT s.name AS store_name, SUM(o.grand_total) AS total_revenue, COUNT(o.id) AS order_count, "
            "DATE_FORMAT(latest.max_order_date, '%Y-%m') AS latest_data_month "
            "FROM orders o "
            "JOIN stores s ON o.store_id = s.id "
            "JOIN (SELECT MAX(order_date) AS max_order_date FROM orders WHERE status NOT IN ('CART', 'CANCELLED')) latest "
            "WHERE o.status NOT IN ('CART', 'CANCELLED') "
            "AND DATE_FORMAT(o.order_date, '%Y-%m') = DATE_FORMAT(latest.max_order_date, '%Y-%m') "
            "GROUP BY s.id, s.name, latest.max_order_date "
            "ORDER BY total_revenue DESC "
            "LIMIT 5"
        )

    if role == "ADMIN" and _is_inventory_ranking_query(normalized):
        limit = _requested_limit(normalized, default=10)
        return (
            "SELECT p.name AS product_name, s.name AS store_name, "
            "p.stock_quantity AS stock_quantity, p.unit_price AS unit_price "
            "FROM products p "
            "LEFT JOIN stores s ON p.store_id = s.id "
            "ORDER BY p.stock_quantity ASC, p.name ASC "
            f"LIMIT {limit}"
        )

    if _is_top_product_seller_query(normalized):
        return (
            "SELECT p.name AS product_name, s.name AS seller_name, "
            "SUM(oi.quantity) AS units_sold, "
            "SUM(oi.quantity * oi.price) AS total_revenue "
            "FROM order_items oi "
            "JOIN orders o ON oi.order_id = o.id "
            "JOIN products p ON oi.product_id = p.id "
            "LEFT JOIN stores s ON p.store_id = s.id "
            "JOIN (SELECT MAX(order_date) AS max_order_date FROM orders WHERE status NOT IN ('CART', 'CANCELLED')) latest "
            "WHERE o.status NOT IN ('CART', 'CANCELLED') "
            "AND o.order_date >= DATE_SUB(latest.max_order_date, INTERVAL 90 DAY) "
            "GROUP BY p.id, p.name, s.id, s.name "
            "ORDER BY units_sold DESC, total_revenue DESC "
            "LIMIT 10"
        )

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


def _is_top_product_seller_query(normalized_question: str) -> bool:
    ranking_terms = ("en cok", "top", "cok satilan", "satan", "satilan")
    product_terms = ("urun", "urunler", "product")
    seller_terms = ("satici", "saticilar", "seller", "store", "magaza")
    asks_ranking = any(term in normalized_question for term in ranking_terms)
    asks_products = any(term in normalized_question for term in product_terms)
    asks_sellers = any(term in normalized_question for term in seller_terms)
    asks_private_orders = any(term in normalized_question for term in ("siparisim", "siparislerim", "benim", "kendi"))
    return asks_ranking and asks_products and asks_sellers and not asks_private_orders


def _is_inventory_ranking_query(normalized_question: str) -> bool:
    product_terms = ("urun", "urunler", "product", "products")
    stock_terms = ("stok", "stock", "envanter", "inventory")
    low_terms = ("dusuk", "az", "kritik", "low", "lowest", "minimum", "en az")
    list_terms = ("listele", "goster", "sirala", "hangileri", "list", "show")
    return (
        any(term in normalized_question for term in product_terms)
        and any(term in normalized_question for term in stock_terms)
        and (any(term in normalized_question for term in low_terms) or any(term in normalized_question for term in list_terms))
    )


def _is_anomalous_order_growth_query(normalized_question: str) -> bool:
    anomaly_terms = ("anormal", "ani", "artis", "artisi", "spike", "suspicious")
    order_terms = ("siparis", "order")
    user_terms = ("kullanici", "kullanicilar", "user", "musteri")
    return (
        any(term in normalized_question for term in anomaly_terms)
        and any(term in normalized_question for term in order_terms)
        and any(term in normalized_question for term in user_terms)
    )


def _is_store_status_rate_query(normalized_question: str) -> bool:
    store_terms = ("magaza", "store", "satici")
    completed_terms = ("tamamlanan", "teslim", "delivered", "completed")
    cancelled_terms = ("iptal", "cancel")
    rate_terms = ("oran", "orani", "rate", "yuzde")
    return (
        any(term in normalized_question for term in store_terms)
        and any(term in normalized_question for term in completed_terms)
        and any(term in normalized_question for term in cancelled_terms)
        and any(term in normalized_question for term in rate_terms)
    )


def _is_shipment_distribution_query(normalized_question: str) -> bool:
    logistics_terms = (
        "sevkiyat",
        "teslimat",
        "kargo",
        "shipment",
        "shipping",
        "delivery",
        "delivered",
        "teslim",
    )
    issue_terms = (
        "gecik",
        "gecikmis",
        "geciken",
        "delay",
        "delayed",
        "teslim edilmemis",
        "teslim edilmeyen",
        "not delivered",
        "in transit",
        "bekleyen",
    )
    aggregate_terms = (
        "dagilim",
        "dagilimi",
        "oran",
        "orani",
        "durum",
        "durumu",
        "listele",
        "goster",
        "sayisi",
        "kac",
        "distribution",
        "rate",
        "status",
        "count",
        "show",
        "list",
    )
    has_logistics_context = any(term in normalized_question for term in logistics_terms)
    asks_issue_or_summary = any(term in normalized_question for term in issue_terms + aggregate_terms)
    return has_logistics_context and asks_issue_or_summary


def _is_shipment_issue_query(normalized_question: str) -> bool:
    issue_terms = (
        "gecik",
        "gecikmis",
        "geciken",
        "delay",
        "delayed",
        "teslim edilmemis",
        "teslim edilmeyen",
        "not delivered",
        "in transit",
        "bekleyen",
        "problem",
        "aksama",
    )
    return any(term in normalized_question for term in issue_terms)


def _is_top_store_revenue_query(normalized_question: str) -> bool:
    store_terms = ("magaza", "store", "satici")
    revenue_terms = ("ciro", "gelir", "revenue")
    ranking_terms = ("en cok", "top", "sirala", "siralama")
    current_period_terms = ("bu ay", "aylik", "son ay")
    return (
        any(term in normalized_question for term in store_terms)
        and any(term in normalized_question for term in revenue_terms)
        and any(term in normalized_question for term in ranking_terms + current_period_terms)
    )


def _requested_limit(normalized_question: str, default: int = 10, maximum: int = 50) -> int:
    match = re.search(r"\b(\d{1,2})\b", normalized_question)
    if not match:
        return default
    return max(1, min(int(match.group(1)), maximum))


def _enforce_multi_row_limit(sql: str, question: str) -> str:
    """Prevent list/ranking questions from accidentally becoming one-row answers."""
    normalized = _normalize_turkish(question)
    if not _asks_for_multi_row_answer(normalized) or _asks_for_single_answer(normalized):
        return sql

    limit = _requested_limit(normalized, default=10)
    if re.search(r"\blimit\s+1\b", sql, flags=re.IGNORECASE):
        return re.sub(r"\blimit\s+1\b", f"LIMIT {limit}", sql, flags=re.IGNORECASE)
    if not re.search(r"\blimit\s+\d+\b", sql, flags=re.IGNORECASE):
        return f"{sql} LIMIT {limit}"
    return sql


def _asks_for_multi_row_answer(normalized_question: str) -> bool:
    list_terms = (
        "listele",
        "goster",
        "sirala",
        "siralama",
        "karsilastir",
        "dagilim",
        "hangileri",
        "kimler",
        "neler",
        "list",
        "show",
        "rank",
        "ranking",
        "compare",
    )
    plural_terms = (
        "urunleri",
        "urunler",
        "magazalari",
        "magazalar",
        "saticilari",
        "saticilar",
        "kullanicilari",
        "kullanicilar",
        "musterileri",
        "musteriler",
        "siparisleri",
        "siparisler",
        "kategorileri",
        "kategoriler",
        "products",
        "stores",
        "sellers",
        "users",
        "customers",
        "orders",
        "categories",
    )
    superlative_terms = (
        "en cok",
        "en az",
        "en dusuk",
        "en yuksek",
        "en iyi",
        "en kotu",
        "top",
        "bottom",
        "lowest",
        "highest",
    )
    has_list_language = any(term in normalized_question for term in list_terms)
    has_plural_subject = any(term in normalized_question for term in plural_terms)
    has_superlative = any(term in normalized_question for term in superlative_terms)
    return has_list_language or (has_plural_subject and has_superlative)


def _asks_for_single_answer(normalized_question: str) -> bool:
    single_terms = (
        "sadece 1",
        "yalnizca 1",
        "tek bir",
        "bir tane",
        "ilk 1",
        "top 1",
        "only one",
        "single",
    )
    return any(term in normalized_question for term in single_terms)


def _normalize_turkish(value: str) -> str:
    translation = str.maketrans({
        "ç": "c",
        "Ç": "c",
        "ğ": "g",
        "Ğ": "g",
        "ı": "i",
        "İ": "i",
        "ö": "o",
        "Ö": "o",
        "ş": "s",
        "Ş": "s",
        "ü": "u",
        "Ü": "u",
    })
    return re.sub(r"\s+", " ", (value or "").translate(translation).lower())


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
