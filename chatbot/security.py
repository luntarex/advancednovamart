"""
Security helpers for prompt and SQL validation.
"""
from __future__ import annotations

import html
import re
from typing import Iterable


PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+previous\s+instructions",
    r"ignore\s+all\s+previous\s+instructions",
    r"disregard\s+prior\s+role",
    r"forget\s+previous\s+instructions",
    r"bypass\s+(the\s+)?rules",
    r"remove\s+(the\s+)?(where\s+clause|scope|store_id|store\s+id)\s+filter",
    r"without\s+any\s+where\s+clause\s+filter",
    r"without\s+(a\s+)?(scope|store_id|store\s+id)\s+filter",
    r"disable\s+(the\s+)?(guardrails|security|rules)",
    r"system\s+override",
    r"developer\s+mode",
    r"admin\s+mode",
    r"\byou\s+are\s+now\s+operating\s+as\b",
    r"\byou\s+are\s+now\b.*\b(admin|root|system)\b",
    r"\buser\s+role\s*=\s*admin\b",
    r"\bcontext:\s*system\b",
    r"\braw\s+initialization\s+context\b",
    r"\u00f6nceki\s+talimatlar[ıi]\s+(g\u00f6rmezden\s+gel|unut|yok\s+say)",
    r"sistem\s+talimatlar[ıi]n[ıi]\s+(g\u00f6rmezden\s+gel|unut|yok\s+say)",
    r"kurallar[ıi]\s+(g\u00f6rmezden\s+gel|devre\s+d[ıi]\u015f[ıi]\s+b[ıi]rak|unut|yok\s+say)",
    r"(store_id|store\s+id|where|scope)\s+filtresini\s+kald[ıi]r",
    r"(store_id|store\s+id|where|scope)\s+filtresi\s+olmadan",
    r"filtreyi\s+kald[ıi]r",
    r"filtresini\s+kald[ıi]r",
    r"admin\s+moduna\s+ge\u00e7",
    r"art[ıi]k\s+(admin|y\u00f6netici|sistem)\s+(gibi\s+)?davran",
]

PROMPT_LEAK_PATTERNS = [
    r"repeat\s+your\s+system\s+prompt",
    r"show\s+(me\s+)?your\s+system\s+prompt",
    r"reveal\s+(the\s+)?(system\s+prompt|hidden\s+instructions|developer\s+message)",
    r"print\s+everything\s+above\s+this\s+line",
    r"what\s+instructions\s+were\s+you\s+given",
    r"list\s+all\s+column\s+names",
    r"what\s+tables\s+exist",
    r"what\s+is\s+your\s+configuration",
    r"sistem\s+promptunu(?:\s+\w+){0,3}\s+(g\u00f6ster|yaz|payla\u015f|s\u00f6yle)",
    r"gizli\s+(talimatlar[ıi]|kurallar[ıi])(?:\s+\w+){0,3}\s+(g\u00f6ster|yaz|payla\u015f|s\u00f6yle)",
    r"veritaban[ıi]\s+(tablolar[ıi]n[ıi]|kolonlar[ıi]n[ıi])(?:\s+\w+){0,3}\s+(g\u00f6ster|listele|payla\u015f)",
]

SQLI_PATTERNS = [
    r";\s*\w",  # multi statement
    r"--",
    r"/\*",
    r"\bunion\b",
    r"\bor\s+1\s*=\s*1\b",
    r"\bdrop\b",
    r"\binsert\b",
    r"\bupdate\b",
    r"\bdelete\b",
    r"\balter\b",
    r"\btruncate\b",
    r"\bcreate\b",
]

SENSITIVE_COLUMNS = {
    "password",
    "password_hash",
    "api_key",
    "secret",
    "refresh_token",
    "internal_cost",
    "supplier_margin",
    "cost_price",
    "is_admin",
}

PRIVATE_PUBLIC_AGGREGATE_TABLES = {
    "users",
    "customer_profiles",
    "addresses",
}

PRIVATE_PUBLIC_AGGREGATE_COLUMNS = {
    "user_id",
    "owner_id",
    "email",
    "address_line",
    "phone",
    "tracking_number",
    "stripe_session_id",
}


def _contains_any(text: str, patterns: Iterable[str]) -> bool:
    lowered = text.lower()
    return any(re.search(pattern, lowered) for pattern in patterns)


def detect_prompt_attack(question: str) -> tuple[bool, str]:
    if _contains_any(question, PROMPT_INJECTION_PATTERNS):
        return True, "prompt_injection"
    if _contains_any(question, PROMPT_LEAK_PATTERNS):
        return True, "prompt_leak_attempt"
    return False, ""


def sanitize_text(text: str) -> str:
    return html.escape(text or "", quote=True)


def parse_ids_from_scope_filter(sql: str, field: str) -> list[int]:
    """
    Extract ids from patterns like:
    - field = 12
    - field IN (1,2,3)
    """
    ids: list[int] = []
    escaped_field = re.escape(field)
    eq_pattern = re.compile(rf"\b{escaped_field}\b\s*=\s*(\d+)", re.IGNORECASE)
    in_pattern = re.compile(rf"\b{escaped_field}\b\s+in\s*\(([^)]+)\)", re.IGNORECASE)

    for match in eq_pattern.finditer(sql):
        ids.append(int(match.group(1)))

    for match in in_pattern.finditer(sql):
        numbers = re.findall(r"\d+", match.group(1))
        ids.extend(int(value) for value in numbers)

    return ids


def validate_sql_shape(sql: str) -> tuple[bool, str]:
    compact = sql.strip()
    if not compact:
        return False, "SQL_EMPTY"
    if not compact.lower().startswith("select"):
        return False, "SQL_ONLY_SELECT"
    if _contains_any(compact, SQLI_PATTERNS):
        return False, "SQL_INJECTION"
    if re.search(r"\bselect\s+\*", compact, re.IGNORECASE):
        return False, "SQL_SELECT_STAR"
    if re.search(r"\b(mysql|information_schema|pg_catalog|pg_shadow)\b", compact, re.IGNORECASE):
        return False, "SQL_SYSTEM_SCHEMA"
    for column in SENSITIVE_COLUMNS:
        if re.search(rf"\b{re.escape(column)}\b", compact, re.IGNORECASE):
            return False, "SQL_SENSITIVE_COLUMN"
    return True, ""


def _compact_sql(sql: str) -> str:
    return re.sub(r"\s+", " ", sql.strip().lower())


def _select_clause(compact_sql: str) -> str:
    match = re.search(r"\bselect\b(.+?)\bfrom\b", compact_sql, re.IGNORECASE)
    return match.group(1) if match else compact_sql


def _group_by_clause(compact_sql: str) -> str:
    match = re.search(
        r"\bgroup\s+by\b(.+?)(\border\s+by\b|\blimit\b|$)",
        compact_sql,
        re.IGNORECASE,
    )
    return match.group(1) if match else ""


def _has_single_store_filter(compact_sql: str) -> bool:
    return bool(
        re.search(r"\b(store_id|s\.id|stores\.id)\b\s*=\s*\d+", compact_sql, re.IGNORECASE)
        or re.search(r"\b(store_id|s\.id|stores\.id)\b\s+in\s*\(\s*\d+", compact_sql, re.IGNORECASE)
        or re.search(r"\b(s\.name|stores\.name)\b\s*(=|like)\s*['\"]", compact_sql, re.IGNORECASE)
    )


def _selects_raw_order_id(select_clause: str) -> bool:
    has_order_id_alias = re.search(r"\bas\s+order_id\b", select_clause, re.IGNORECASE)
    selects_o_id = re.search(r"\bo\.id\b", select_clause, re.IGNORECASE)
    selects_orders_id = re.search(r"\borders\.id\b", select_clause, re.IGNORECASE)
    counts_o_id = re.search(r"\bcount\s*\(\s*(distinct\s+)?o\.id\s*\)", select_clause, re.IGNORECASE)
    counts_orders_id = re.search(
        r"\bcount\s*\(\s*(distinct\s+)?orders\.id\s*\)",
        select_clause,
        re.IGNORECASE,
    )

    if has_order_id_alias:
        return True
    if selects_o_id and not counts_o_id:
        return True
    if selects_orders_id and not counts_orders_id:
        return True
    return False


def is_public_aggregate_query(sql: str) -> bool:
    """
    Public data is allowed only when it is aggregated and does not expose
    user/private store/order-level details.
    """
    compact = _compact_sql(sql)
    if not re.search(r"\b(count|sum|avg|min|max)\s*\(", compact, re.IGNORECASE):
        return False

    if any(re.search(rf"\b{table}\b", compact, re.IGNORECASE) for table in PRIVATE_PUBLIC_AGGREGATE_TABLES):
        return False

    if any(re.search(rf"\b{column}\b", compact, re.IGNORECASE) for column in PRIVATE_PUBLIC_AGGREGATE_COLUMNS):
        return False

    # Public seller/product rankings can group by store, but a query filtered to
    # one store is treated as private store detail unless role scope permits it.
    if _has_single_store_filter(compact):
        return False

    select_clause = _select_clause(compact)
    if _selects_raw_order_id(select_clause):
        return False

    group_by_clause = _group_by_clause(compact)
    if re.search(r"\b(o|orders)\.id\b", group_by_clause, re.IGNORECASE):
        return False

    return True


def validate_scope(
    sql: str,
    role: str,
    user_id: int,
    allowed_store_ids: list[int],
) -> tuple[bool, str]:
    normalized_role = (role or "").upper()
    if normalized_role == "ADMIN":
        return True, ""

    if is_public_aggregate_query(sql):
        return True, ""

    if normalized_role == "CORPORATE":
        ids = (
            parse_ids_from_scope_filter(sql, "store_id")
            + parse_ids_from_scope_filter(sql, "s.id")
            + parse_ids_from_scope_filter(sql, "stores.id")
        )
        if not ids:
            return False, "ACCESS_DENIED_STORE"
        disallowed = [sid for sid in ids if sid not in allowed_store_ids]
        if disallowed:
            return False, "ACCESS_DENIED_STORE"
        return True, ""

    # INDIVIDUAL
    user_ids = parse_ids_from_scope_filter(sql, "user_id")
    if not user_ids:
        return False, "ACCESS_DENIED_PRIVATE_DATA"
    if any(uid != user_id for uid in user_ids):
        return False, "ACCESS_DENIED_USER"
    return True, ""
