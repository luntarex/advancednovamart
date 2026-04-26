"""
Analysis Agent — The Explainer.

Takes raw database query results and converts them into
a human-readable natural language answer.
"""
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

ANALYSIS_PROMPT = """You are a data analyst for an e-commerce platform called NovaMart.

The user asked: "{question}"

The SQL query "{sql_query}" returned these results:
{query_result}

Write a clear, concise natural language answer explaining the results.
- Use bullet points for lists
- Include specific numbers and percentages where relevant
- If the result is empty, say "No data was found for this query."
- Keep it under 200 words"""


def analysis_agent(state: dict) -> dict:
    """
    Converts raw query results into a human-readable explanation.
    """
    response = llm.invoke(ANALYSIS_PROMPT.format(
        question=state["question"],
        sql_query=state["sql_query"],
        query_result=state["query_result"],
    ))

    return {"final_answer": response.content.strip()}
