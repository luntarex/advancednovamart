"""
LLM provider factory.
Supports:
- gemini
- openai
- ollama
"""
from __future__ import annotations

import os
from typing import Any


def get_chat_model(model: str, temperature: float = 0) -> Any:
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()

    if provider == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except Exception as exc:
            raise RuntimeError(
                "langchain-google-genai is not installed. Install requirements and retry."
            ) from exc

        return ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=os.getenv("GOOGLE_API_KEY", ""),
        )

    if provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except Exception as exc:
            raise RuntimeError(
                "langchain-ollama is not installed. Install requirements and retry."
            ) from exc

        return ChatOllama(
            model=model,
            temperature=temperature,
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )

    # default: OpenAI
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=model, temperature=temperature)
