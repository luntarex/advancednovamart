"""
Scope guard for semantic access checks before SQL generation.
"""
from __future__ import annotations

from typing import Any

from db.connection import find_store_ids_by_name


def scope_guard_agent(state: dict) -> dict:
    role = str(state.get("role", "INDIVIDUAL")).upper()
    query_plan = state.get("query_plan") or {}
    if role != "CORPORATE" or not isinstance(query_plan, dict):
        return {}

    requested_store = query_plan.get("requested_store")
    if not isinstance(requested_store, dict):
        return {}

    store_name = str(requested_store.get("name") or "").strip()
    if not store_name:
        return {}

    resolved_ids = find_store_ids_by_name(store_name)
    allowed_ids = [int(value) for value in state.get("allowed_store_ids", [])]
    allowed_matches = [store_id for store_id in resolved_ids if store_id in allowed_ids]

    updated_plan: dict[str, Any] = {
        **query_plan,
        "requested_store": {
            **requested_store,
            "resolved_ids": resolved_ids,
            "allowed_ids": allowed_matches,
        },
    }

    if resolved_ids and not allowed_matches:
        return {
            "query_plan": updated_plan,
            "error": "ACCESS_DENIED_STORE",
            "blocked_reason": "ACCESS_DENIED_STORE",
        }

    return {"query_plan": updated_plan}
