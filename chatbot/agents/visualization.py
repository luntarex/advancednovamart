"""
Visualization Agent — The Chart Maker.

Decides if a chart would be helpful for the data,
and if so, generates Plotly Python code to render it.
"""
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

VIZ_PROMPT = """You are a data visualization expert. Based on the query results below,
decide if a chart would be helpful. If yes, generate Python Plotly code.

User question: "{question}"
Query results: {query_result}

RULES:
1. If the data has fewer than 2 rows, respond with "NO_CHART"
2. If a chart would be helpful, generate ONLY the Python code using Plotly
3. The code must use `plotly.graph_objects` or `plotly.express`
4. Store the figure in a variable called `fig`
5. Do NOT call `fig.show()` — the frontend will render it
6. Include `fig.to_json()` at the end to serialize the chart
7. Do NOT include any explanation, just the code

Respond with either "NO_CHART" or the Python code."""


def visualization_agent(state: dict) -> dict:
    """
    Generates Plotly visualization code if appropriate for the data.
    """
    query_result = state.get("query_result", "")

    # Skip visualization for empty results
    if not query_result or query_result == "[]":
        return {"visualization_code": ""}

    response = llm.invoke(VIZ_PROMPT.format(
        question=state["question"],
        query_result=query_result,
    ))

    code = response.content.strip()

    if code == "NO_CHART" or "NO_CHART" in code:
        return {"visualization_code": ""}

    # Clean up markdown fences
    if code.startswith("```"):
        code = code.split("\n", 1)[1] if "\n" in code else code[3:]
    if code.endswith("```"):
        code = code[:-3]

    return {"visualization_code": code.strip()}
