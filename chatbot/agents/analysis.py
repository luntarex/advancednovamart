"""
Analysis agent: turns raw query results into human-friendly answer.
"""
from __future__ import annotations

import os
import re
import json
from typing import Any
from llm_provider import get_chat_model

ANALYSIS_MODEL = os.getenv(
    "ANALYSIS_MODEL",
    os.getenv("OPENAI_ANALYSIS_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini")),
)
_llm: Any = None

ANALYSIS_PROMPT = """You are NovaMart's Turkish e-commerce data assistant.
The user will ask in Turkish by default. Answer in clear, natural Turkish unless the user explicitly asks for another language.

Question: {question}
SQL: {sql_query}
Result JSON: {query_result}
Response mode: {response_mode}

Instructions:
- Keep the response concise and useful.
- Do not use markdown emphasis such as **bold** or italic markers.
- Do not use star bullets (*). If listing rows, use a numbered list with 1., 2., 3.
- If Result JSON contains multiple rows for a list/ranking/comparison request, include multiple rows. Do not collapse the answer to only the first row unless the user explicitly asked for one item.
- Use the order-list format only when Response mode is order_list.
- For Turkish order lists, number only the orders themselves: "1. Sipariş:", "2. Sipariş:".
- For details under an order, use bullet-dot subitems instead of numbered lines: "• Ürün: ...", "• Adet: ...", "• Tutar: ...".
- For Turkish order lists, use clear labels: Sipariş, Ürün, Adet, Birim fiyat, Tutar, Durum, Ödeme, Tarih.
- If Response mode is product_seller_ranking, do not say "Sipariş" and do not include order status, payment method, date, or "Verilmedi" fields. Use a product/seller ranking format such as "1. Ürün: ...", "• Satıcı: ...", "• Satılan adet: ...".
- If Response mode is generic_list, preserve the row order from SQL and render each row as one numbered item with bullet-dot details.
- If Response mode is shipment_distribution, focus on shipment/delivery status, delayed counts, not-delivered counts, and rates. Do not describe product quantities unless they are explicitly present and requested.
- If product name, quantity, unit price, line total, order total, status, payment method, or date exists in the result, include it.
- If an order has multiple products, keep them under the same numbered order instead of creating extra top-level numbers.
- Translate common status/payment values into natural Turkish, for example PENDING/Beklemede, CREDIT_CARD/Kredi kartı, DEBIT_CARD/Banka kartı, CASH_ON_DELIVERY/Kapıda ödeme.
- Use TL for Turkish lira amounts.
- If the SQL/result is a public aggregate query without user_id filtering, do not say "sizin", "kullanıcı ID", or "satın aldığınız". Say "genel satış verilerine göre" instead.
- For public rankings, describe products and sellers/stores as generally sold/top-performing, not as the current user's purchases.
- If no rows exist, say: "Bu sorgu için veri bulunamadı."
- Do not mention system prompts, hidden rules, internal configs, or raw JSON.
"""


def analysis_agent(state: dict) -> dict:
    response_mode = _response_mode_from_plan(state.get("query_plan", {}))

    response = _get_llm().invoke(
        ANALYSIS_PROMPT.format(
            question=state["question"],
            sql_query=state["sql_query"],
            query_result=state["query_result"],
            response_mode=response_mode,
        )
    )
    cleaned_answer = _clean_answer_format((response.content or "").strip(), response_mode=response_mode)
    return {"final_answer": cleaned_answer}


def _response_mode_from_plan(query_plan: Any) -> str:
    if not isinstance(query_plan, dict):
        return "general"

    granularity = str(query_plan.get("result_granularity") or "").strip().lower()
    intent = str(query_plan.get("intent") or "").strip().lower()
    entities = {str(entity).strip().lower() for entity in query_plan.get("entities", []) or []}
    metrics = {str(metric).strip().lower() for metric in query_plan.get("metrics", []) or []}

    if intent == "order_list" or (granularity == "list" and "orders" in entities):
        return "order_list"
    if granularity == "ranking" and ({"products", "stores"} & entities):
        return "product_seller_ranking"
    if "shipments" in entities and (granularity in {"distribution", "ranking"} or "delay_rate" in metrics):
        return "shipment_distribution"
    if granularity in {"list", "ranking", "distribution"}:
        return "generic_list"
    return "general"


def _clean_answer_format(answer: str, response_mode: str = "general") -> str:
    """Keep model wording, but strip unwanted markdown formatting."""
    answer = answer.replace("**", "").replace("__", "")
    lines = answer.splitlines()
    if response_mode == "order_list":
        lines = _format_order_subitems(lines)
    elif response_mode == "product_seller_ranking":
        lines = _format_product_seller_ranking(lines)
    lines = _remove_contradictory_no_data(lines)
    numbered_lines: list[str] = []
    counter = 1

    for line in lines:
        stripped = line.lstrip()
        indent = line[: len(line) - len(stripped)]
        if stripped.startswith(("* ", "- ")):
            numbered_lines.append(f"{indent}{counter}. {stripped[2:].strip()}")
            counter += 1
        else:
            numbered_lines.append(line)
            if re.match(r"^\s*\d+\.\s+", line):
                counter += 1

    return "\n".join(numbered_lines).strip()


def _deterministic_answer(response_mode: str, query_result: str) -> str:
    rows = _parse_rows(query_result)
    if response_mode == "admin_order_growth":
        return _format_admin_order_growth(rows)
    if response_mode == "store_status_rates":
        return _format_store_status_rates(rows)
    if response_mode == "shipment_distribution":
        return _format_shipment_distribution(rows)
    if response_mode == "store_revenue_ranking":
        return _format_store_revenue_ranking(rows)
    if response_mode == "product_seller_ranking":
        return _format_product_seller_rows(rows)
    if response_mode == "generic_list":
        return _format_generic_rows(rows)
    return ""


def _parse_rows(query_result: str) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(query_result or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [row for row in parsed if isinstance(row, dict)]


def _format_admin_order_growth(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Son 60 günlük mevcut verilere göre anormal sipariş artışı için yeterli hareket bulunamadı."

    window_end = rows[0].get("analysis_window_end")
    header = "Son sipariş verilerine göre son 30 gün ile önceki 30 günü karşılaştırdım."
    if window_end:
        header += f" Analiz bitiş tarihi: {str(window_end)[:10]}."

    lines = [header, "", "En belirgin sipariş artışı adayları:"]
    for index, row in enumerate(rows[:10], start=1):
        lines.extend([
            f"{index}. Kullanıcı #{row.get('user_id', 'Bilinmiyor')}",
            f"• Son 30 gün sipariş sayısı: {_format_number(row.get('recent_30d_order_count'))}",
            f"• Önceki 30 gün sipariş sayısı: {_format_number(row.get('previous_30d_order_count'))}",
            f"• Artış: {_format_signed_number(row.get('order_count_increase'))} sipariş ({_format_percent(row.get('increase_rate_percent'))})",
            f"• Yorum: {row.get('inference') or 'Veriye göre değerlendirme yapılamadı'}",
            "",
        ])
    return "\n".join(lines).strip()


def _format_store_status_rates(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Mevcut sipariş verilerinde mağaza bazında tamamlanan ve iptal edilen sipariş oranı hesaplanamadı."

    lines = ["Mağaza bazında tamamlanan ve iptal edilen sipariş oranları:"]
    for index, row in enumerate(rows[:20], start=1):
        lines.extend([
            f"{index}. {row.get('store_name') or 'Bilinmeyen mağaza'}",
            f"• Toplam sipariş: {_format_number(row.get('total_orders'))}",
            f"• Tamamlanan sipariş: {_format_number(row.get('completed_orders'))} ({_format_percent(row.get('completed_rate_percent'))})",
            f"• İptal edilen sipariş: {_format_number(row.get('cancelled_orders'))} ({_format_percent(row.get('cancelled_rate_percent'))})",
            "",
        ])
    return "\n".join(lines).strip()


def _format_shipment_distribution(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Mevcut sevkiyat verilerinde gecikmiş veya teslim edilmemiş sipariş dağılımı hesaplanamadı."

    total_not_delivered = sum(int(_to_float(row.get("not_delivered_shipments")) or 0) for row in rows)
    total_delayed = sum(int(_to_float(row.get("delayed_shipments")) or 0) for row in rows)

    if total_delayed > 0 and total_not_delivered > 0:
        header = "Gecikmiş ve teslim edilmemiş sevkiyatların dağılımı:"
    elif total_not_delivered > 0:
        header = "Teslim edilmemiş sevkiyatların dağılımı:"
    else:
        header = "Sevkiyat durum dağılımı:"

    lines = [header]
    for index, row in enumerate(rows[:20], start=1):
        status = _translate_common_value(str(row.get("shipment_status") or "Bilinmiyor"))
        mode = _translate_common_value(str(row.get("shipment_mode") or row.get("warehouse") or "Bilinmiyor"))
        lines.extend([
            f"{index}. {status} / {mode}",
            f"• Sevkiyat sayısı: {_format_number(row.get('total_shipments'))}",
            f"• Teslim edilmemiş: {_format_number(row.get('not_delivered_shipments'))} ({_format_percent(row.get('not_delivered_rate_percent'))})",
            f"• Gecikmiş: {_format_number(row.get('delayed_shipments'))} ({_format_percent(row.get('delayed_rate_percent'))})",
        ])
        if row.get("latest_estimated_delivery"):
            lines.append(f"• En geç tahmini teslimat: {str(row.get('latest_estimated_delivery'))[:10]}")
        lines.append("")

    if total_delayed == 0 and total_not_delivered > 0:
        lines.append("Not: Teslim edilmemiş sevkiyat var, ancak tahmini teslim tarihi geçmiş olarak işaretlenen sevkiyat görünmüyor.")

    return "\n".join(lines).strip()


def _format_store_revenue_ranking(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Mevcut sipariş verilerinde mağaza ciro sıralaması için veri bulunamadı."

    month = rows[0].get("latest_data_month")
    header = "En son mevcut sipariş ayına göre en yüksek cirolu mağazalar:"
    if month:
        header = f"En son mevcut sipariş ayına ({month}) göre en yüksek cirolu mağazalar:"

    lines = [header]
    for index, row in enumerate(rows, start=1):
        lines.extend([
            f"{index}. {row.get('store_name') or 'Bilinmeyen mağaza'}",
            f"• Ciro: {_format_tl(row.get('total_revenue'))}",
            f"• Sipariş sayısı: {_format_number(row.get('order_count'))}",
            "",
        ])
    return "\n".join(lines).strip()


def _format_product_seller_rows(rows: list[dict[str, Any]]) -> str:
    if not rows or not {"product_name", "seller_name", "units_sold"}.issubset(rows[0].keys()):
        return ""

    lines = ["Genel satış verilerine göre son dönemde en çok satılan ürünler ve satıcıları:"]
    for index, row in enumerate(rows[:10], start=1):
        lines.extend([
            f"{index}. Ürün: {row.get('product_name') or 'Bilinmeyen ürün'}",
            f"• Satıcı: {row.get('seller_name') or 'Bilinmeyen satıcı'}",
            f"• Satılan adet: {_format_number(row.get('units_sold'))}",
            f"• Toplam ciro: {_format_tl(row.get('total_revenue'))}",
            "",
        ])
    return "\n".join(lines).strip()


def _format_generic_rows(rows: list[dict[str, Any]]) -> str:
    """Render arbitrary safe list/ranking rows without letting the LLM drop rows."""
    if not rows:
        return ""

    lines: list[str] = []
    for index, row in enumerate(rows[:20], start=1):
        keys = [key for key in row.keys() if not _is_hidden_generic_key(key)]
        if not keys:
            continue

        primary_key = _choose_primary_key(keys)
        lines.append(
            f"{index}. {_humanize_key(primary_key)}: {_format_generic_value(primary_key, row.get(primary_key))}"
        )
        for key in keys:
            if key == primary_key:
                continue
            lines.append(f"• {_humanize_key(key)}: {_format_generic_value(key, row.get(key))}")
        lines.append("")

    return "\n".join(lines).strip()


GENERIC_LABELS = {
    "id": "ID",
    "order_id": "Sipariş ID",
    "user_id": "Kullanıcı",
    "product_id": "Ürün ID",
    "store_id": "Mağaza ID",
    "seller_id": "Satıcı ID",
    "product_name": "Ürün",
    "store_name": "Mağaza",
    "seller_name": "Satıcı",
    "category_name": "Kategori",
    "stock_quantity": "Stok",
    "unit_price": "Birim fiyat",
    "price": "Fiyat",
    "quantity": "Adet",
    "units_sold": "Satılan adet",
    "order_count": "Sipariş sayısı",
    "total_orders": "Toplam sipariş",
    "completed_orders": "Tamamlanan sipariş",
    "cancelled_orders": "İptal edilen sipariş",
    "total_revenue": "Ciro",
    "revenue": "Ciro",
    "grand_total": "Tutar",
    "total": "Toplam",
    "subtotal": "Ara toplam",
    "average_order_value": "Ortalama sipariş tutarı",
    "completed_rate_percent": "Tamamlanma oranı",
    "cancelled_rate_percent": "İptal oranı",
    "percent_change": "Değişim oranı",
    "absolute_change": "Değişim",
    "current_period_value": "Güncel dönem",
    "previous_period_value": "Önceki dönem",
    "latest_data_month": "Son veri ayı",
    "analysis_window_end": "Analiz bitiş tarihi",
    "status": "Durum",
    "payment_method": "Ödeme",
    "order_date": "Tarih",
    "shipment_status": "Sevkiyat durumu",
    "shipment_mode": "Sevkiyat yöntemi",
    "warehouse": "Depo",
    "total_shipments": "Sevkiyat sayısı",
    "not_delivered_shipments": "Teslim edilmemiş",
    "delayed_shipments": "Gecikmiş",
    "not_delivered_rate_percent": "Teslim edilmeme oranı",
    "delayed_rate_percent": "Gecikme oranı",
    "latest_estimated_delivery": "En geç tahmini teslimat",
    "last_updated": "Son güncelleme",
}


PRIMARY_GENERIC_KEYS = (
    "product_name",
    "store_name",
    "seller_name",
    "category_name",
    "user_id",
    "order_id",
    "id",
)


def _choose_primary_key(keys: list[str]) -> str:
    for preferred in PRIMARY_GENERIC_KEYS:
        if preferred in keys:
            return preferred
    return keys[0]


def _humanize_key(key: str) -> str:
    if key in GENERIC_LABELS:
        return GENERIC_LABELS[key]
    return key.replace("_", " ").strip().capitalize()


def _format_generic_value(key: str, value: Any) -> str:
    if value is None or value == "":
        return "Yok"

    normalized_key = key.lower()
    if normalized_key in {"user_id", "order_id", "product_id", "store_id", "seller_id", "id"}:
        return f"#{value}"
    if any(term in normalized_key for term in ("percent", "rate", "oran")):
        return _format_percent(value)
    if any(term in normalized_key for term in ("count", "quantity", "stock", "adet", "sayi")):
        return _format_number(value)
    if normalized_key in {"total_orders", "total_count", "order_count"}:
        return _format_number(value)
    if any(term in normalized_key for term in ("price", "revenue", "amount", "ciro", "gelir", "tutar")):
        return _format_tl(value)
    if normalized_key in {"total", "subtotal", "grand_total", "order_total"}:
        return _format_tl(value)
    if any(term in normalized_key for term in ("date", "tarih")):
        return str(value)[:10]

    return _translate_common_value(str(value))


def _translate_common_value(value: str) -> str:
    translations = {
        "PENDING": "Beklemede",
        "PROCESSING": "İşleniyor",
        "SHIPPED": "Kargoya verildi",
        "DELIVERED": "Teslim edildi",
        "IN_TRANSIT": "Yolda",
        "RETURNED": "İade edildi",
        "COMPLETED": "Tamamlandı",
        "CANCELLED": "İptal edildi",
        "CART": "Sepet",
        "CREDIT_CARD": "Kredi kartı",
        "DEBIT_CARD": "Banka kartı",
        "CASH_ON_DELIVERY": "Kapıda ödeme",
        "STANDARD": "Standart",
        "SHIP": "Deniz yolu",
        "FLIGHT": "Hava yolu",
        "ROAD": "Kara yolu",
    }
    return translations.get(value.upper(), value)


def _is_hidden_generic_key(key: str) -> bool:
    return key.lower() in {"password", "password_hash", "api_key", "secret", "refresh_token"}


def _format_number(value: Any) -> str:
    number = _to_float(value)
    if number is None:
        return "0"
    if number.is_integer():
        return str(int(number))
    return f"{number:.2f}".replace(".", ",")


def _format_signed_number(value: Any) -> str:
    number = _to_float(value)
    if number is None:
        return "+0"
    sign = "+" if number >= 0 else "-"
    absolute = abs(number)
    if absolute.is_integer():
        return f"{sign}{int(absolute)}"
    return f"{sign}{absolute:.2f}".replace(".", ",")


def _format_percent(value: Any) -> str:
    number = _to_float(value)
    if number is None:
        return "0%"
    return f"{number:.2f}%".replace(".", ",")


def _format_tl(value: Any) -> str:
    number = _to_float(value)
    if number is None:
        return "TL 0"
    return f"TL {number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


NO_DATA_RE = re.compile(r"bu\s+sorgu\s+i[çc]in\s+veri\s+bulunamad[ıi]", re.IGNORECASE)
DATA_LINE_RE = re.compile(r"^\s*(\d+\.\s+\S|[•*-]\s+\S)|\bTL\s*\d|\d+[\.,]\d+")


def _remove_contradictory_no_data(lines: list[str]) -> list[str]:
    has_data = any(DATA_LINE_RE.search(line) and not NO_DATA_RE.search(line) for line in lines)
    if not has_data:
        return lines
    return [line for line in lines if not NO_DATA_RE.search(line)]


ORDER_HEADER_RE = re.compile(r"^(\s*)\d+\.\s*(sipari[şs](?!\s+id\b).*)$", re.IGNORECASE)
NUMBERED_LINE_RE = re.compile(r"^(\s*)\d+\.\s+(.+)$")
ORDER_DETAIL_LABEL_RE = re.compile(
    r"^(sipari[şs]\s+id|ürün|urun|ürünler|urunler|adet|miktar|birim\s+fiyat|tutar|toplam|durum|ödeme|odeme|tarih)\b",
    re.IGNORECASE,
)
PRODUCT_SELLER_LABEL_RE = re.compile(
    r"^(ürün|urun|satıcı|satici|seller|mağaza|magaza|adet|miktar|satılan\s+adet|satilan\s+adet|units_sold|toplam\s+ciro|ciro|tutar|gelir)\b",
    re.IGNORECASE,
)
DROP_RANKING_DETAIL_RE = re.compile(
    r"^((durum|ödeme|odeme|tarih)\b.*|(birim\s+fiyat|tutar)\s*:\s*(verilmedi|belirtilmedi|yok)?\s*)$",
    re.IGNORECASE,
)


def _format_order_subitems(lines: list[str]) -> list[str]:
    """Number only top-level orders; render order details as bullet-dot rows."""
    formatted: list[str] = []
    in_order_block = False
    order_counter = 0

    for line in lines:
        stripped = line.lstrip()
        indent = line[: len(line) - len(stripped)]
        order_header = ORDER_HEADER_RE.match(line)

        if order_header and _looks_like_order_header(order_header.group(2)):
            order_counter += 1
            in_order_block = True
            formatted.append(f"{order_header.group(1)}{order_counter}. {order_header.group(2).strip()}")
            continue

        numbered_line = NUMBERED_LINE_RE.match(line)
        if in_order_block and numbered_line:
            body = numbered_line.group(2).strip()
            if ORDER_DETAIL_LABEL_RE.match(body):
                formatted.append(f"{numbered_line.group(1)}• {body}")
                continue

        if in_order_block and stripped.startswith(("* ", "- ")):
            formatted.append(f"{indent}• {stripped[2:].strip()}")
            continue

        if stripped:
            in_order_block = in_order_block and not _starts_non_order_section(stripped)
        formatted.append(line)

    return formatted


def _format_product_seller_ranking(lines: list[str]) -> list[str]:
    """Repair accidental order-style wording in public product/seller rankings."""
    formatted: list[str] = []
    pending_rank: int | None = None
    rank_counter = 0
    in_false_order = False

    for line in lines:
        stripped = line.lstrip()
        order_header = ORDER_HEADER_RE.match(line)
        if order_header and _looks_like_order_header(order_header.group(2)):
            rank_counter += 1
            pending_rank = rank_counter
            in_false_order = True
            continue

        numbered_line = NUMBERED_LINE_RE.match(line)
        if in_false_order and numbered_line:
            body = numbered_line.group(2).strip()
            normalized = body.lower()

            if DROP_RANKING_DETAIL_RE.match(body):
                continue

            if re.match(r"^(ürün|urun)\b", body, re.IGNORECASE):
                rank = pending_rank or 1
                formatted.append(f"{rank}. {body}")
                continue

            if re.match(r"^(adet|miktar)\b", body, re.IGNORECASE):
                value = body.split(":", 1)[1].strip() if ":" in body else body
                formatted.append(f"• Satılan adet: {value}")
                continue

            if PRODUCT_SELLER_LABEL_RE.match(body) and "verilmedi" not in normalized:
                formatted.append(f"• {body}")
                continue

            in_false_order = False
            pending_rank = None

        if in_false_order and stripped.startswith(("* ", "- ")):
            body = stripped[2:].strip()
            if not DROP_RANKING_DETAIL_RE.match(body):
                formatted.append(f"• {body}")
            continue

        in_false_order = False
        pending_rank = None
        formatted.append(line)

    return formatted


def _looks_like_order_header(text: str) -> bool:
    normalized = text.strip().lower()
    if re.match(r"^sipari[şs]\s+id\b", normalized, re.IGNORECASE):
        return False
    return bool(re.match(r"^sipari[şs](\s*#?\d+)?\s*:?\s*(#?\d+)?\s*$", normalized, re.IGNORECASE))


def _starts_non_order_section(text: str) -> bool:
    return bool(re.match(r"^(özet|ozet|not|toplam|genel)\b", text, re.IGNORECASE))


def _response_mode(question: str, sql_query: str) -> str:
    normalized_question = _normalize_turkish(question)
    normalized_sql = (sql_query or "").lower()

    if "recent_30d_order_count" in normalized_sql and "previous_30d_order_count" in normalized_sql:
        return "admin_order_growth"
    if "completed_rate_percent" in normalized_sql and "cancelled_rate_percent" in normalized_sql:
        return "store_status_rates"
    if "shipment_status" in normalized_sql and (
        "delayed_shipments" in normalized_sql or "not_delivered_shipments" in normalized_sql
    ):
        return "shipment_distribution"
    if "latest_data_month" in normalized_sql and "total_revenue" in normalized_sql and "store_name" in normalized_sql:
        return "store_revenue_ranking"
    if _asks_for_product_seller_ranking(normalized_question, normalized_sql):
        return "product_seller_ranking"
    if _asks_for_order_list(normalized_question, normalized_sql):
        return "order_list"
    if _asks_for_generic_list(normalized_question, normalized_sql):
        return "generic_list"
    return "general"


def _asks_for_product_seller_ranking(normalized_question: str, normalized_sql: str) -> bool:
    product_terms = ("urun", "urunler", "product")
    seller_terms = ("satici", "saticilar", "seller", "store", "magaza")
    ranking_terms = ("en cok", "top", "cok satilan", "satan", "satilan")
    has_ranking_word = any(term in normalized_question for term in ranking_terms)
    asks_product_or_seller = any(term in normalized_question for term in product_terms + seller_terms)
    sql_has_public_alias = "seller_name" in normalized_sql or "units_sold" in normalized_sql
    return (has_ranking_word and asks_product_or_seller) or sql_has_public_alias


def _asks_for_order_list(normalized_question: str, normalized_sql: str) -> bool:
    personal_terms = ("benim", "kendi", "siparisim", "siparislerim", "aldigim")
    order_terms = ("siparis", "order")
    sql_has_order_list_shape = " from orders " in normalized_sql and "user_id" in normalized_sql
    asks_personal_order = any(term in normalized_question for term in order_terms) and any(
        term in normalized_question for term in personal_terms
    )
    return asks_personal_order or sql_has_order_list_shape


def _asks_for_generic_list(normalized_question: str, normalized_sql: str) -> bool:
    if re.search(r"\blimit\s+1\b", normalized_sql):
        return False

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
    sql_looks_multi_row = bool(re.search(r"\blimit\s+([2-9]|[1-9]\d+)\b", normalized_sql))
    asks_multi_row = any(term in normalized_question for term in list_terms) or (
        any(term in normalized_question for term in plural_terms)
        and any(term in normalized_question for term in superlative_terms)
    )
    return asks_multi_row or sql_looks_multi_row


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
        _llm = get_chat_model(ANALYSIS_MODEL, temperature=0.1)
    return _llm
