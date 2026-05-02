"""
Error-fix agent for SQL retries.
"""
from __future__ import annotations

import os
from typing import Any
from llm_provider import get_chat_model
from db.connection import get_schema

ERROR_MODEL = os.getenv(
    "ERROR_MODEL",
    os.getenv("OPENAI_ERROR_MODEL", os.getenv("LLM_MODEL", "gemini-2.0-flash")),
)
_llm: Any = None

ERROR_FIX_PROMPT = """You are fixing a failed MySQL SELECT query.

Original question: {question}
Role: {role}
User ID: {user_id}
Allowed store IDs: {allowed_store_ids}

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
