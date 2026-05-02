"""
FastAPI entry point for the LangGraph chatbot service.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from graph.workflow import workflow
from security import sanitize_text

load_dotenv()

app = FastAPI(
    title="NovaMart AI Chatbot",
    description="Secure Multi-Agent Text2SQL chatbot powered by LangGraph",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:4200"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None
    user_id: int = 0
    role: str = "INDIVIDUAL"
    active_store_id: int | None = None
    allowed_store_ids: list[int] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    visualization_code: str = ""
    sql_query: str = ""
    blocked_reason: str = ""


RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
_request_buckets: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit_key(req: ChatRequest) -> str:
    if req.session_id:
        return f"session:{req.session_id}"
    return f"user:{req.user_id}"


def _is_rate_limited(key: str) -> bool:
    now = time.time()
    bucket = _request_buckets[key]
    while bucket and (now - bucket[0]) > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    bucket.append(now)
    return False


@app.post("/ask", response_model=ChatResponse)
async def ask(request: ChatRequest):
    key = _rate_limit_key(request)
    if _is_rate_limited(key):
        return ChatResponse(
            answer="Çok fazla istek algılandı. Lütfen bir süre sonra tekrar deneyin.",
            blocked_reason="rate_limit",
        )

    allowed_store_ids = request.allowed_store_ids
    if request.role.upper() == "CORPORATE" and not allowed_store_ids and request.active_store_id is not None:
        allowed_store_ids = [request.active_store_id]

    initial_state = {
        "question": request.question,
        "session_id": request.session_id or key,
        "user_id": request.user_id,
        "role": request.role.upper(),
        "active_store_id": request.active_store_id,
        "allowed_store_ids": allowed_store_ids,
        "sql_query": "",
        "query_result": "",
        "error": "",
        "final_answer": "",
        "visualization_code": "",
        "is_in_scope": False,
        "scope_type": "",
        "blocked_reason": "",
        "is_security_violation": False,
        "iteration_count": 0,
    }

    try:
        result = workflow.invoke(initial_state)
    except Exception:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        fallback_enabled = os.getenv("LLM_ENABLE_FALLBACK", "true").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        fallback_provider = os.getenv("LLM_FALLBACK_PROVIDER", "ollama").strip().lower()
        if provider == "ollama":
            hint = "Ollama'yı başlatın (ollama serve) ve modeli indirin (örnek: ollama pull qwen2.5:7b)."
        elif provider == "gemini" and fallback_enabled and fallback_provider == "ollama":
            hint = (
                "Gemini ve Ollama fallback ikisi de yanıt veremedi. GOOGLE_API_KEY'i kontrol edin; "
                "ayrıca Ollama'yı başlatın (ollama serve) ve modeli indirin (ollama pull qwen2.5:7b)."
            )
        elif provider == "gemini":
            hint = "GOOGLE_API_KEY, internet erişimi ve Gemini model adını kontrol edin."
        else:
            hint = "OPENAI_API_KEY, internet erişimi ve veritabanı ayarlarınızı kontrol edin."

        return ChatResponse(
            answer=f"Chatbot şu anda isteği işleyemedi. {hint}",
            blocked_reason="runtime_error",
        )

    answer = result.get("final_answer", "I could not process your question.")
    if result.get("error") and not answer:
        answer = f"Sorgu güvenli bir şekilde tamamlanamadı: {sanitize_text(result['error'])}"

    return ChatResponse(
        answer=answer,
        visualization_code=result.get("visualization_code", ""),
        sql_query=result.get("sql_query", ""),
        blocked_reason=result.get("blocked_reason", ""),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "novamart-chatbot"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
