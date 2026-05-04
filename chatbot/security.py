"""
Security helpers for prompt and SQL validation.
"""
from __future__ import annotations

import html
import re
import unicodedata
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
    r"for\s+testing\s+purposes.*\b(admin|privilege|full\s+access)\b",
    r"\bassume\s+(that\s+)?i\s+have\s+(admin|administrator|root|full\s+data)\b",
    r"\bi\s+have\s+been\s+granted\s+full\s+data\s+access\b",
    r"\bas\s+we\s+(established|agreed|confirmed)\b.*\b(admin|access|permission|authorized)\b",
    r"\b(cto|ceo|admin)\b.*\b(granted|approved|authorized)\b.*\b(access|permission)\b",
    r"\brole\s*[:=]\s*(admin|administrator|root|system)\b",
    r"\bact\s+as\s+(an?\s+)?(admin|administrator|root|system)\b",
    r"\bpretend\s+(that\s+)?(i\s+am|you\s+are)\s+(an?\s+)?(admin|administrator|root|system)\b",
    r"\byetkim\s+var\s+varsay\b",
    r"\bbeni\s+(admin|y\u00f6netici)\s+olarak\s+kabul\s+et\b",
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
    r"\b(database|db)\s+schema\b",
    r"\bschema\s+(structure|details|dump)\b",
    r"\b(sql\s+dialect|table\s+names|column\s+names)\b",
    r"\binternal\s+(configuration|config|rules|context|policy)\b",
    r"\ball\s+(tables|columns|column\s+names|schema)\b",
    r"\bshow\s+(me\s+)?(the\s+)?(raw\s+sql|generated\s+sql|database\s+schema)\b",
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
    r"\bsleep\s*\(",
    r"\bbenchmark\s*\(",
    r"\bload_file\s*\(",
    r"\binto\s+outfile\b",
    r"\bversion\s*\(",
    r"\bdatabase\s*\(",
    r"\bcurrent_user\s*\(",
]

CODE_INJECTION_PATTERNS = [
    r"<\s*script\b",
    r"<\s*img\b[^>]*(onerror|onload)\s*=",
    r"<\s*svg\b[^>]*onload\s*=",
    r"\bon(error|load|mouseover|focus|click)\s*=",
    r"\bjavascript\s*:",
    r"\bdocument\s*\.\s*cookie\b",
    r"\blocalstorage\b",
    r"\bsessionstorage\b",
    r"\beval\s*\(",
    r"\bnew\s+function\s*\(",
    r"\batob\s*\(",
    r"\bfetch\s*\(",
    r"&#x?0*3c;?\s*script",
]

ENUMERATION_PATTERNS = [
    r"\b(ids?|store\s+ids?|order\s+ids?|user\s+ids?)\s+\d+\s*(through|to|-)\s*\d+\b",
    r"\bfor\s+\w+\s+in\s+range\s*\(",
    r"\brange\s*\(\s*\d+",
    r"\b(store|order|user)\s+id\s+\d+.*\b(store|order|user)\s+id\s+\d+",
    r"\bsku[-_\s]*\d+\s*(through|to|-)\s*sku[-_\s]*\d+\b",
    r"\b\d+\s*(ile|ve)\s+\d+\s+aras[Ä±i]ndaki\s+(id|sipari\u015f|ma\u011faza|kullan[Ä±i]c[Ä±i])",
]

WRITE_INTENT_PATTERNS = [
    r"\b(update|insert|delete|drop|alter|truncate|create)\b",
    r"\b(add|create)\s+(a\s+)?(new\s+)?admin\b",
    r"\b(set|change|modify|make)\b.*\b(role|is_admin|admin|password|password_hash|cost_price|supplier_margin)\b",
    r"\b(role\s*=\s*admin|is_admin\s*=\s*true)\b",
    r"\b(cost_price|supplier_margin|password_hash|refresh_token|api_key)\b",
    r"\b(g\u00fcncelle|sil|ekle|olu\u015ftur|de\u011fi\u015ftir)\b.*\b(rol|admin|y\u00f6netici|parola|maliyet|k\u00e2r|kar)\b",
]

SENSITIVE_COLUMNS = {
    "password",
    "password_hash",
    "api_key",
    "secret",
    "refresh_token",
    "email",
    "phone",
    "address_line",
    "tracking_number",
    "stripe_session_id",
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


def normalize_security_text(text: str) -> str:
    unescaped = html.unescape(text or "")
    normalized = unicodedata.normalize("NFKC", unescaped)
    normalized = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]", "", normalized)
    return normalized.lower()


def _contains_any(text: str, patterns: Iterable[str]) -> bool:
    normalized = normalize_security_text(text)
    return any(re.search(pattern, normalized, flags=re.IGNORECASE | re.DOTALL) for pattern in patterns)


def detect_prompt_attack(question: str) -> tuple[bool, str]:
    if _contains_any(question, CODE_INJECTION_PATTERNS):
        return True, "code_injection"
    if _contains_any(question, PROMPT_INJECTION_PATTERNS):
        return True, "prompt_injection"
    if _contains_any(question, PROMPT_LEAK_PATTERNS):
        return True, "prompt_leak_attempt"
    if _contains_any(question, ENUMERATION_PATTERNS):
        return True, "enumeration_attempt"
    if _contains_any(question, WRITE_INTENT_PATTERNS):
        return True, "write_operation_requested"
    if _contains_any(question, SQLI_PATTERNS):
        return True, "SQL_INJECTION"
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
