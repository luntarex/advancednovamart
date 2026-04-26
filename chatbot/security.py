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
    eq_pattern = re.compile(rf"\b{field}\b\s*=\s*(\d+)", re.IGNORECASE)
    in_pattern = re.compile(rf"\b{field}\b\s+in\s*\(([^)]+)\)", re.IGNORECASE)

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


def validate_scope(
    sql: str,
    role: str,
    user_id: int,
    allowed_store_ids: list[int],
) -> tuple[bool, str]:
    normalized_role = (role or "").upper()
    if normalized_role == "ADMIN":
        return True, ""

    if normalized_role == "CORPORATE":
        ids = parse_ids_from_scope_filter(sql, "store_id")
        if not ids:
            return False, "Corporate queries must include store_id scope filters."
        disallowed = [sid for sid in ids if sid not in allowed_store_ids]
        if disallowed:
            return False, "Cross-store access attempt blocked."
        return True, ""

    # INDIVIDUAL
    user_ids = parse_ids_from_scope_filter(sql, "user_id")
    if not user_ids:
        return False, "Individual queries must include user_id scope filters."
    if any(uid != user_id for uid in user_ids):
        return False, "Cross-user data access attempt blocked."
    return True, ""
