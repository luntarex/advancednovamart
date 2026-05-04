"""
LLM provider factory.
Supports:
- gemini
- openai
- ollama

Default order is OpenAI first, Ollama fallback. This keeps responses strong and
falls back to the local qwen2.5:7b model when OpenAI is unavailable.
"""
from __future__ import annotations

import os
import logging
from typing import Any


logger = logging.getLogger(__name__)


class FallbackChatModel:
    """Small wrapper that retries an LLM call with a secondary provider."""

    def __init__(
        self,
        primary: Any,
        fallback_provider: str,
        fallback_model: str,
        temperature: float,
    ) -> None:
        self._primary = primary
        self._fallback_provider = fallback_provider
        self._fallback_model = fallback_model
        self._temperature = temperature
        self._fallback: Any = None

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return self._primary.invoke(*args, **kwargs)
        except Exception as exc:
            logger.warning(
                "Primary LLM failed; retrying with %s/%s. Error: %s",
                self._fallback_provider,
                self._fallback_model,
                exc,
            )
            return self._get_fallback().invoke(*args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._primary, name)

    def _get_fallback(self) -> Any:
        if self._fallback is None:
            self._fallback = _create_chat_model(
                provider=self._fallback_provider,
                model=self._fallback_model,
                temperature=self._temperature,
            )
        return self._fallback


def get_chat_model(model: str, temperature: float = 0) -> Any:
    provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    primary_model = _resolve_model_for_provider(provider, requested_model=model)
    primary = _create_chat_model(provider=provider, model=primary_model, temperature=temperature)

    fallback_enabled = _is_truthy(os.getenv("LLM_ENABLE_FALLBACK", "true"))
    fallback_provider = os.getenv("LLM_FALLBACK_PROVIDER", "ollama").strip().lower()
    if not fallback_enabled or provider == fallback_provider:
        return primary

    fallback_model = os.getenv(
        "LLM_FALLBACK_MODEL",
        _resolve_model_for_provider(fallback_provider, requested_model=model),
    ).strip()
    if not fallback_model:
        return primary

    return FallbackChatModel(
        primary=primary,
        fallback_provider=fallback_provider,
        fallback_model=fallback_model,
        temperature=temperature,
    )


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _resolve_model_for_provider(provider: str, requested_model: str) -> str:
    provider = (provider or "").strip().lower()
    requested = (requested_model or "").strip()

    if provider == "ollama":
        return os.getenv("OLLAMA_MODEL", "").strip() or _ollama_safe_model(requested)

    if provider == "gemini":
        return (
            os.getenv("GEMINI_MODEL", "").strip()
            or os.getenv("GOOGLE_MODEL", "").strip()
            or _gemini_safe_model(requested)
        )

    if provider == "openai":
        return os.getenv("OPENAI_MODEL", "").strip() or requested or "gpt-4o-mini"

    return requested


def _ollama_safe_model(requested_model: str) -> str:
    if requested_model and not requested_model.lower().startswith(("gemini-", "gpt-")):
        return requested_model
    return "qwen2.5:7b"


def _gemini_safe_model(requested_model: str) -> str:
    if requested_model and requested_model.lower().startswith("gemini-"):
        return requested_model
    return "gemini-2.0-flash"


def _create_chat_model(provider: str, model: str, temperature: float) -> Any:
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
