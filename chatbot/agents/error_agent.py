"""
Error Agent — The Mechanic.

When SQL execution fails, this agent reads the error message
and tries to fix the query. It retries up to 3 times.
"""
from langchain_openai import ChatOpenAI
from db.connection import get_schema

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

ERROR_FIX_PROMPT = """You are a MySQL debugging expert. The following SQL query failed.

ORIGINAL QUESTION: {question}

FAILED SQL QUERY:
{sql_query}

ERROR MESSAGE:
{error}

DATABASE SCHEMA:
{schema}

Fix the SQL query so it runs without errors. Return ONLY the corrected SQL query, nothing else."""


def error_agent(state: dict) -> dict:
    """
    Attempts to fix a broken SQL query based on the error message.
    """
    schema = get_schema()

    response = llm.invoke(ERROR_FIX_PROMPT.format(
        question=state["question"],
        sql_query=state["sql_query"],
        error=state["error"],
        schema=schema,
    ))

    fixed_sql = response.content.strip()

    # Clean up markdown fences
    if fixed_sql.startswith("```"):
        fixed_sql = fixed_sql.split("\n", 1)[1] if "\n" in fixed_sql else fixed_sql[3:]
    if fixed_sql.endswith("```"):
        fixed_sql = fixed_sql[:-3]
    fixed_sql = fixed_sql.strip()

    return {"sql_query": fixed_sql}
