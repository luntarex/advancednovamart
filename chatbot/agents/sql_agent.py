"""
SQL Agent — The Translator.

Takes a natural language question and converts it to a MySQL SELECT query.
Uses the actual database schema so it knows the correct table/column names.
"""
import json
from langchain_openai import ChatOpenAI
from db.connection import get_schema, execute_query

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

SQL_PROMPT = """You are a MySQL expert. Convert the user's question into a valid MySQL SELECT query.

DATABASE SCHEMA:
{schema}

RULES:
1. ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
2. Use proper JOIN syntax when combining tables.
3. Use aliases for readability.
4. Limit results to 50 rows maximum unless the user asks for a specific number.
5. Return ONLY the SQL query, nothing else. No markdown, no explanation.

User question: {question}"""


def sql_agent(state: dict) -> dict:
    """
    Generates a SQL query from the user's question.
    """
    question = state["question"]
    schema = get_schema()

    response = llm.invoke(SQL_PROMPT.format(schema=schema, question=question))
    sql = response.content.strip()

    # Clean up: remove markdown code fences if the LLM added them
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1] if "\n" in sql else sql[3:]
    if sql.endswith("```"):
        sql = sql[:-3]
    sql = sql.strip()

    return {"sql_query": sql}


def execute_sql(state: dict) -> dict:
    """
    Executes the SQL query against MySQL and returns the result.
    """
    sql = state["sql_query"]
    result = execute_query(sql)

    # Check if the result contains an error
    try:
        parsed = json.loads(result)
        if isinstance(parsed, dict) and "error" in parsed:
            return {
                "error": parsed["error"],
                "query_result": "",
                "iteration_count": state.get("iteration_count", 0) + 1,
            }
    except json.JSONDecodeError:
        pass

    return {
        "query_result": result,
        "error": "",
    }
