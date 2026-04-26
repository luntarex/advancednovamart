"""
Guardrails Agent — The Bouncer.

Checks if the user's question is:
1. A greeting → respond with welcome message
2. In scope → related to e-commerce data → continue to SQL agent
3. Out of scope → not related → politely reject
"""
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

GUARDRAILS_PROMPT = """You are a classifier for an e-commerce analytics chatbot.

Classify the following user question into exactly one category:
- "greeting" — if the user is saying hello, hi, hey, good morning, etc.
- "in_scope" — if the question is about e-commerce data like products, orders, customers, sales, revenue, shipments, reviews, categories, stores, or any business analytics.
- "out_of_scope" — if the question is about weather, sports, politics, personal advice, or anything unrelated to e-commerce.

Respond with ONLY one word: greeting, in_scope, or out_of_scope

User question: {question}"""


def guardrails_agent(state: dict) -> dict:
    """
    Classifies the user's question and decides if we should continue.
    """
    question = state["question"]

    response = llm.invoke(GUARDRAILS_PROMPT.format(question=question))
    classification = response.content.strip().lower()

    if classification == "greeting":
        return {
            "scope_type": "greeting",
            "is_in_scope": False,
            "final_answer": "👋 Hello! I'm the NovaMart AI assistant. I can help you analyze your e-commerce data. Try asking me things like:\n\n• 'What are the top 5 products by revenue?'\n• 'Show me total sales by category'\n• 'How many orders were placed this month?'\n\nWhat would you like to know?",
        }
    elif classification == "in_scope":
        return {
            "scope_type": "in_scope",
            "is_in_scope": True,
        }
    else:
        return {
            "scope_type": "out_of_scope",
            "is_in_scope": False,
            "final_answer": "I'm sorry, I can only answer questions related to e-commerce data such as products, orders, sales, customers, and shipments. Could you please ask something related to our platform?",
        }
