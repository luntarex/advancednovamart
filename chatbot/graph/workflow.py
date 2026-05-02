"""
LangGraph workflow for the NovaMart analytics chatbot.
"""
from langgraph.graph import END, StateGraph

from agents.analysis import analysis_agent
from agents.error_agent import error_agent
from agents.guardrails import guardrails_agent
from agents.sql_agent import execute_sql, sql_agent
from agents.state import AgentState
from agents.visualization import visualization_agent
from error_messages import is_security_block, message_for


def after_guardrails(state: dict) -> str:
    if state.get("is_in_scope"):
        return "sql_agent"
    return END


def after_execute_sql(state: dict) -> str:
    error = str(state.get("error", ""))
    if error:
        if error.startswith("ACCESS_DENIED") or is_security_block(error):
            return "final_error"
        if state.get("iteration_count", 0) < 3:
            return "error_agent"
        return "final_error"
    return "analysis_agent"


def final_error_agent(state: dict) -> dict:
    error = str(state.get("error", "unknown error"))

    return {
        "final_answer": message_for(error),
        "blocked_reason": error,
    }


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("guardrails", guardrails_agent)
    graph.add_node("sql_agent", sql_agent)
    graph.add_node("execute_sql", execute_sql)
    graph.add_node("error_agent", error_agent)
    graph.add_node("analysis_agent", analysis_agent)
    graph.add_node("visualization_agent", visualization_agent)
    graph.add_node("final_error", final_error_agent)

    graph.set_entry_point("guardrails")
    graph.add_conditional_edges("guardrails", after_guardrails)
    graph.add_edge("sql_agent", "execute_sql")
    graph.add_conditional_edges("execute_sql", after_execute_sql)
    graph.add_edge("error_agent", "execute_sql")
    graph.add_edge("analysis_agent", "visualization_agent")
    graph.add_edge("visualization_agent", END)
    graph.add_edge("final_error", END)

    return graph.compile()


workflow = build_graph()
