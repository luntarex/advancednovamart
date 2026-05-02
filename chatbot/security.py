"""
Security helpers for prompt and SQL validation.
"""
from __future__ import annotations

import html
import re
from typing import Iterable


PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+previous\s+instructions",
    r"disregard\s+prior\s+role",
    r"system\s+override",
    r"\byou\s+are\s+now\s+operating\s+as\b",
    r"\buser\s+role\s*=\s*admin\b",
    r"\bcontext:\s*system\b",
    r"\braw\s+initialization\s+context\b",
]

PROMPT_LEAK_PATTERNS = [
    r"repeat\s+your\s+system\s+prompt",
    r"print\s+everything\s+above\s+this\s+line",
    r"what\s+instructions\s+were\s+you\s+given",
    r"list\s+all\s+column\s+names",
    r"what\s+tables\s+exist",
    r"what\s+is\s+your\s+configuration",
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
        return False, "Empty SQL query."
    if not compact.lower().startswith("select"):
        return False, "Only SELECT queries are allowed."
    if _contains_any(compact, SQLI_PATTERNS):
        return False, "Potential SQL injection pattern detected."
    if re.search(r"\bselect\s+\*", compact, re.IGNORECASE):
        return False, "SELECT * is not allowed."
    if re.search(r"\b(mysql|information_schema|pg_catalog|pg_shadow)\b", compact, re.IGNORECASE):
        return False, "System schema access is blocked."
    for column in SENSITIVE_COLUMNS:
        if re.search(rf"\b{re.escape(column)}\b", compact, re.IGNORECASE):
            return False, f"Sensitive column access blocked: {column}"
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
            return False, "Corporate private queries must include allowed store_id scope filters."
        disallowed = [sid for sid in ids if sid not in allowed_store_ids]
        if disallowed:
            return False, "Cross-store access attempt blocked."
        return True, ""

    # INDIVIDUAL
    user_ids = parse_ids_from_scope_filter(sql, "user_id")
    if not user_ids:
        return False, "Individual private queries must include user_id scope filters, or be public aggregate queries."
    if any(uid != user_id for uid in user_ids):
        return False, "Cross-user data access attempt blocked."
    return True, ""
