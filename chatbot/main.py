"""
Main entry point — FastAPI server.

This is the Python web server that Spring Boot's ChatService calls.
It receives questions via HTTP and runs them through the LangGraph workflow.
"""
import os
from dotenv import load_dotenv

# Load .env BEFORE importing anything that uses environment variables
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph.workflow import workflow

# ──────────────────────────────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NovaMart AI Chatbot",
    description="Multi-Agent Text2SQL Chatbot powered by LangGraph",
    version="1.0.0",
)

# Allow requests from Spring Boot (port 8080) and Angular (port 4200)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:4200"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────
# Request / Response models
# ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None  # For future conversation history


class ChatResponse(BaseModel):
    answer: str
    visualization_code: str = ""
    sql_query: str = ""


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────

@app.post("/ask", response_model=ChatResponse)
async def ask(request: ChatRequest):
    """
    Main endpoint. Receives a question, runs it through the 5-agent pipeline,
    and returns the answer + optional visualization code.
    """
    # Initialize the state with the user's question
    initial_state = {
        "question": request.question,
        "sql_query": "",
        "query_result": "",
        "error": "",
        "final_answer": "",
        "visualization_code": "",
        "is_in_scope": False,
        "scope_type": "",
        "iteration_count": 0,
    }

    # Run the entire LangGraph workflow
    result = workflow.invoke(initial_state)

    return ChatResponse(
        answer=result.get("final_answer", "I couldn't process your question."),
        visualization_code=result.get("visualization_code", ""),
        sql_query=result.get("sql_query", ""),
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "novamart-chatbot"}


# ──────────────────────────────────────────────────────────────────────
# Run the server
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
