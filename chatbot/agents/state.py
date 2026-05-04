"""
Shared state schema for the LangGraph workflow.
"""
from typing import Any, TypedDict


class AgentState(TypedDict):
    """State shared across all agents in the graph."""

    # User input
    question: str
    session_id: str

    # Auth/scope context (sent by Spring Boot)
    user_id: int
    role: str
    active_store_id: int | None
    allowed_store_ids: list[int]
    current_date: str

    # Guardrails
    is_in_scope: bool
    scope_type: str
    blocked_reason: str
    is_security_violation: bool

    # SQL generation/execution
    query_plan: dict[str, Any]
    sql_query: str
    query_result: str
    error: str
    iteration_count: int

    # Output
    final_answer: str
    visualization_code: str
