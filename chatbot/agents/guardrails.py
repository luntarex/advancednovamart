"""
Guardrails agent.
- Blocks prompt injection/prompt leakage attempts
- Classifies greeting / in-scope / out-of-scope
"""
from __future__ import annotations

import os
import unicodedata
from typing import Any

from llm_provider import get_chat_model
from security import detect_prompt_attack

GUARDRAIL_MODEL = os.getenv(
    "GUARDRAIL_MODEL",
    os.getenv("OPENAI_GUARDRAIL_MODEL", os.getenv("LLM_MODEL", "gemini-2.0-flash")),
)
_llm: Any = None

DOMAIN_HINTS = (
    "product", "order", "sale", "revenue", "customer", "shipment", "review",
    "category", "inventory", "stock", "store", "checkout", "analytics", "dashboard",
    "urun", "urunler", "siparis", "siparisim", "siparisler", "satis", "ciro",
    "satilan", "satan", "satici", "saticilar",
    "musteri", "sevkiyat", "yorum", "kategori", "stok", "magaza", "analitik",
    "gelir", "harcama", "harca", "harcadim", "alisveris", "odeme", "kargo",
    "teslimat", "fatura", "sepet", "iade", "indirim",
)
GREETINGS = (
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening", "selam", "merhaba",
)

CLASSIFY_PROMPT = """You are a strict classifier for an e-commerce analytics chatbot.
The user will mostly ask in Turkish. Treat Turkish e-commerce questions as in_scope.
Understand Turkish terms including sipariş, satış, ürün, müşteri, harcama, alışveriş, ödeme, kargo, teslimat, stok, kategori, sepet, iade, indirim.

Return exactly one of these labels:
- greeting
- in_scope
- out_of_scope

Question: {question}
"""

TURKISH_TRANSLATION = str.maketrans({
    "ç": "c",
    "Ç": "c",
    "ğ": "g",
    "Ğ": "g",
    "ı": "i",
    "I": "i",
    "İ": "i",
    "ö": "o",
    "Ö": "o",
    "ş": "s",
    "Ş": "s",
    "ü": "u",
    "Ü": "u",
})


def _normalize_text(value: str) -> str:
    translated = value.translate(TURKISH_TRANSLATION)
    ascii_text = unicodedata.normalize("NFKD", translated).encode("ascii", "ignore").decode("ascii")
    return ascii_text.strip().lower()


def _cheap_rule_classify(question: str) -> str | None:
    q = _normalize_text(question or "")
    if not q:
        return "out_of_scope"
    if any(token in q for token in GREETINGS) and len(q.split()) <= 8:
        return "greeting"
    if any(token in q for token in DOMAIN_HINTS):
        return "in_scope"
    return None


def _get_llm() -> Any:
    global _llm
    if _llm is None:
        _llm = get_chat_model(GUARDRAIL_MODEL, temperature=0)
    return _llm


def guardrails_agent(state: dict) -> dict:
    question = state["question"]

    is_attack, reason = detect_prompt_attack(question)
    if is_attack:
        return {
            "scope_type": "security_block",
            "is_in_scope": False,
            "is_security_violation": True,
            "blocked_reason": reason,
            "final_answer": (
                "Bu istek güvenlik politikalarına takıldı. "
                "Yalnızca rolünüze uygun e-ticaret analiz sorularını yanıtlayabilirim."
            ),
        }

    rule_result = _cheap_rule_classify(question)
    if rule_result is None:
        response = _get_llm().invoke(CLASSIFY_PROMPT.format(question=question))
        classification = (response.content or "").strip().lower()
    else:
        classification = rule_result

    if classification == "greeting":
        return {
            "scope_type": "greeting",
            "is_in_scope": False,
            "is_security_violation": False,
            "blocked_reason": "",
            "final_answer": (
                "Merhaba. NovaMart AI veri asistanı olarak satış, sipariş, stok, müşteri ve sevkiyat "
                "analizlerinde yardımcı olabilirim."
            ),
        }

    if classification == "in_scope":
        return {
            "scope_type": "in_scope",
            "is_in_scope": True,
            "is_security_violation": False,
            "blocked_reason": "",
        }

    return {
        "scope_type": "out_of_scope",
        "is_in_scope": False,
        "is_security_violation": False,
        "blocked_reason": "",
        "final_answer": (
            "Bu asistan yalnızca e-ticaret verileri için kullanılır. "
            "Örnek: 'Bu ay en çok satan 5 ürün nedir?'"
        ),
    }
