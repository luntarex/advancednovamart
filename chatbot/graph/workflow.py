"""
Workflow — The Assembly Line.

This is where we wire all the agents together using LangGraph's StateGraph.
It defines: which agent runs first, what happens next, and how errors are handled.
"""
from langgraph.graph import StateGraph, END
from agents.state import AgentState
from agents.guardrails import guardrails_agent
from agents.sql_agent import sql_agent, execute_sql
from agents.error_agent import error_agent
from agents.analysis import analysis_agent
from agents.visualization import visualization_agent
from security import sanitize_text


# ──────────────────────────────────────────────────────────────────────
# CONDITIONAL EDGE FUNCTIONS
# These decide "where to go next" based on the current state
# ──────────────────────────────────────────────────────────────────────

def after_guardrails(state: dict) -> str:
    """
    After the guardrails agent:
    - If greeting or out_of_scope → END (we already have a final_answer)
    - If in_scope → go to SQL agent
    """
    if state.get("is_in_scope"):
        return "sql_agent"
    else:
        return END


def after_execute_sql(state: dict) -> str:
    """
    After executing SQL:
    - If there's an error AND we haven't retried 3 times → go to error agent
    - If there's an error AND we've retried 3 times → give up, go to END
    - If success → go to analysis agent
    """
    if state.get("error"):
        if state.get("iteration_count", 0) < 3:
            return "error_agent"
        else:
            # Give up after 3 retries
            return "final_error"
    else:
        return "analysis_agent"


def final_error_agent(state: dict) -> dict:
    return {
        "final_answer": (
            "Sorgu guvenlik veya dogrulama kontrollerinden gecemedi. "
            f"Detay: {sanitize_text(state.get('error', 'unknown error'))}"
        ),
    }


# ──────────────────────────────────────────────────────────────────────
# BUILD THE GRAPH
# ──────────────────────────────────────────────────────────────────────

def build_graph():
    """
    Constructs the LangGraph state machine.

    Visual flow:
        START → guardrails → [in_scope?] → sql_agent → execute_sql
                                                          ↓
                                                    [error?] → error_agent → execute_sql (retry)
                                                          ↓
                                                    analysis → visualization → END
    """
    # 1. Create the graph with our state schema
    graph = StateGraph(AgentState)

    # 2. Add all nodes (agents)
    graph.add_node("guardrails", guardrails_agent)
    graph.add_node("sql_agent", sql_agent)
    graph.add_node("execute_sql", execute_sql)
    graph.add_node("error_agent", error_agent)
    graph.add_node("analysis_agent", analysis_agent)
    graph.add_node("visualization_agent", visualization_agent)
    graph.add_node("final_error", final_error_agent)

    # 3. Set the entry point
    graph.set_entry_point("guardrails")

    # 4. Add conditional edges
    graph.add_conditional_edges("guardrails", after_guardrails)

    # 5. Add normal edges (A → always B)
    graph.add_edge("sql_agent", "execute_sql")

    # 6. After SQL execution, decide: error → retry, or success → analyze
    graph.add_conditional_edges("execute_sql", after_execute_sql)

    # 7. Error agent → retry SQL execution
    graph.add_edge("error_agent", "execute_sql")

    # 8. Analysis → Visualization → END
    graph.add_edge("analysis_agent", "visualization_agent")
    graph.add_edge("visualization_agent", END)
    graph.add_edge("final_error", END)

    # 9. Compile the graph (finalize it, make it runnable)
    return graph.compile()


# Create a single instance to reuse
workflow = build_graph()
