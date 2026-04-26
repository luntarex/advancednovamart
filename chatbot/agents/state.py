"""
AgentState — The shared clipboard that all agents read and write to.

Think of this as a dictionary that travels through the pipeline.
Each agent reads what it needs and adds its contribution.
"""
from typing import TypedDict


class AgentState(TypedDict):
    """State shared across all agents in the graph."""

    # --- Input ---
    question: str           # The user's natural language question

    # --- Guardrails ---
    is_in_scope: bool       # True if the question is about our e-commerce data
    scope_type: str         # "greeting", "in_scope", or "out_of_scope"

    # --- SQL Generation ---
    sql_query: str          # The generated SQL query
    query_result: str       # The raw result from MySQL (as JSON string)

    # --- Error Handling ---
    error: str              # Error message if SQL execution fails
    iteration_count: int    # How many times we've retried (max 3)

    # --- Output ---
    final_answer: str       # Human-readable explanation of the results
    visualization_code: str  # Plotly code for charts (empty if no chart needed)
