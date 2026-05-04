"""
User-facing chatbot messages for security and runtime outcomes.

The source stays ASCII via unicode escapes so Windows console encoding cannot
corrupt Turkish text in the repository.
"""
from __future__ import annotations


BLOCKED_REASON_MESSAGES = {
    "prompt_injection": (
        "\u26d4 Bu istek yasakl\u0131 bir prompt injection denemesi olarak engellendi.\n"
        "Sistem talimatlar\u0131n\u0131 de\u011fi\u015ftirmeye, rol\u00fc y\u00fckseltmeye veya g\u00fcvenlik kurallar\u0131n\u0131 "
        "devre d\u0131\u015f\u0131 b\u0131rakmaya y\u00f6nelik ifadeleri i\u015fleyemem.\n"
        "L\u00fctfen yaln\u0131zca rol\u00fcn\u00fcze uygun e-ticaret verileri hakk\u0131nda normal bir analiz sorusu sorun."
    ),
    "prompt_leak_attempt": (
        "\u26d4 Bu istek yasakl\u0131 bir sistem talimat\u0131 s\u0131zd\u0131rma denemesi olarak engellendi.\n"
        "Gizli promptlar\u0131, sistem kurallar\u0131n\u0131 veya i\u00e7 yap\u0131land\u0131rmay\u0131 payla\u015famam.\n"
        "Sat\u0131\u015f, sipari\u015f, stok, m\u00fc\u015fteri veya genel performans verileriyle ilgili bir analiz sorusu sorabilirsiniz."
    ),
    "code_injection": (
        "\u26d4 Bu istek HTML/JavaScript kodu veya XSS benzeri bir payload i\u00e7erdi\u011fi i\u00e7in engellendi.\n"
        "Chatbot yaln\u0131zca normal metinle yaz\u0131lm\u0131\u015f e-ticaret analiz sorular\u0131n\u0131 i\u015fleyebilir."
    ),
    "enumeration_attempt": (
        "\u26d4 Bu istek ID veya nesne tarama denemesi gibi g\u00f6r\u00fcnd\u00fc\u011f\u00fc i\u00e7in engellendi.\n"
        "Tek tek sipari\u015f, ma\u011faza veya kullan\u0131c\u0131 ID'lerini taramak yerine rol\u00fcn\u00fcze uygun net bir analiz sorusu sorun."
    ),
    "write_operation_requested": (
        "Bu chatbot veri de\u011fi\u015ftirme i\u015flemleri i\u00e7in kullan\u0131lamaz.\n"
        "G\u00fcvenlik nedeniyle yaln\u0131zca okuma ve analiz ama\u00e7l\u0131 sorulara yan\u0131t verebilirim."
    ),
    "ACCESS_DENIED_STORE": (
        "Bu ma\u011fazan\u0131n \u00f6zel verilerine eri\u015fim yetkiniz yok.\n"
        "Yetkili oldu\u011funuz ma\u011fazan\u0131n verilerini sorabilir veya herkesin g\u00f6rebilece\u011fi genel toplu verileri "
        "isteyebilirsiniz. \u00d6rne\u011fin: en \u00e7ok sat\u0131lan \u00fcr\u00fcnler, genel sat\u0131c\u0131 performans\u0131 veya kategori bazl\u0131 sat\u0131\u015flar."
    ),
    "ACCESS_DENIED_USER": (
        "Ba\u015fka bir kullan\u0131c\u0131n\u0131n \u00f6zel verilerine eri\u015femezsiniz.\n"
        "Kendi sipari\u015flerinizi, harcamalar\u0131n\u0131z\u0131 ve yorumlar\u0131n\u0131z\u0131 sorabilirsiniz. "
        "Genel analiz isterseniz ki\u015fi bazl\u0131 olmayan toplu sat\u0131\u015f verilerini sorabilirsiniz."
    ),
    "ACCESS_DENIED_PRIVATE_DATA": (
        "Bu istek \u00f6zel veri i\u00e7eriyor olabilir ve rol\u00fcn\u00fczle g\u00fcvenli \u015fekilde s\u0131n\u0131rland\u0131r\u0131lamad\u0131.\n"
        "Kendi verilerinizi sorarken bunu a\u00e7\u0131k\u00e7a belirtin. Genel veri istiyorsan\u0131z kullan\u0131c\u0131, sipari\u015f veya "
        "tekil ma\u011faza detay\u0131 i\u00e7ermeyen toplu analiz sorular\u0131 sorun."
    ),
    "SQL_EMPTY": (
        "Bu soru i\u00e7in g\u00fcvenli bir sorgu olu\u015fturulamad\u0131.\n"
        "Sorunuzu biraz daha net yaz\u0131p tekrar deneyin."
    ),
    "SQL_ONLY_SELECT": (
        "Bu istek veri okuma d\u0131\u015f\u0131nda bir i\u015flem gerektiriyor gibi g\u00f6r\u00fcn\u00fcyor.\n"
        "G\u00fcvenlik nedeniyle yaln\u0131zca veri okuma ve analiz sorgular\u0131na izin veriyorum."
    ),
    "SQL_INJECTION": (
        "\u26d4 Bu istek g\u00fcvenlik riski ta\u015f\u0131yan SQL injection benzeri ifadeler i\u00e7erdi\u011fi i\u00e7in engellendi.\n"
        "L\u00fctfen yaln\u0131zca normal bir e-ticaret analiz sorusu sorun."
    ),
    "SQL_SELECT_STAR": (
        "Bu sorgu gere\u011finden fazla veri okumaya \u00e7al\u0131\u015ft\u0131\u011f\u0131 i\u00e7in engellendi.\n"
        "Hangi bilgiyi g\u00f6rmek istedi\u011finizi daha belirgin yazarsan\u0131z sadece gerekli alanlarla yan\u0131tlayabilirim."
    ),
    "SQL_SYSTEM_SCHEMA": (
        "\u26d4 Sistem tablolar\u0131na veya veritaban\u0131 i\u00e7 yap\u0131s\u0131na eri\u015fim iste\u011fi engellendi.\n"
        "Yaln\u0131zca e-ticaret verileri \u00fczerinden analiz yapabilirim."
    ),
    "SQL_SENSITIVE_COLUMN": (
        "\u26d4 Hassas alanlara eri\u015fim iste\u011fi engellendi.\n"
        "\u015eifre, anahtar, gizli token veya benzeri g\u00fcvenlik alanlar\u0131n\u0131 payla\u015famam."
    ),
    "EMPTY_RESULT": (
        "Bu soru i\u00e7in mevcut verilerde anlaml\u0131 bir sonu\u00e7 bulunamad\u0131.\n"
        "Daha geni\u015f bir tarih aral\u0131\u011f\u0131, farkl\u0131 bir k\u0131r\u0131l\u0131m veya daha genel bir analiz sorusu ile tekrar deneyebilirsiniz."
    ),
    "rate_limit": (
        "\u00c7ok k\u0131sa s\u00fcrede fazla istek g\u00f6nderildi.\n"
        "L\u00fctfen biraz bekleyip tekrar deneyin."
    ),
    "runtime_error": (
        "Chatbot \u015fu anda iste\u011fi i\u015fleyemedi.\n"
        "Model servisi, internet ba\u011flant\u0131s\u0131 veya veritaban\u0131 ba\u011flant\u0131s\u0131 ge\u00e7ici olarak haz\u0131r olmayabilir."
    ),
    "spring_proxy_error": (
        "Chatbot servisine \u015fu anda ula\u015f\u0131lam\u0131yor.\n"
        "L\u00fctfen Python chatbot servisinin \u00e7al\u0131\u015ft\u0131\u011f\u0131ndan emin olup tekrar deneyin."
    ),
    "out_of_scope": (
        "Bu asistan yaln\u0131zca NovaMart e-ticaret verileri i\u00e7in kullan\u0131labilir.\n"
        "\u00d6rne\u011fin sat\u0131\u015f, sipari\u015f, stok, \u00fcr\u00fcn, sat\u0131c\u0131, sevkiyat veya genel performans verileri hakk\u0131nda soru sorabilirsiniz."
    ),
}


def message_for(reason: str, fallback: str | None = None) -> str:
    key = (reason or "").strip()
    if key in BLOCKED_REASON_MESSAGES:
        return BLOCKED_REASON_MESSAGES[key]
    return fallback or (
        "Bu istek g\u00fcvenlik veya do\u011frulama kontrollerinden ge\u00e7emedi.\n"
        "Sorunuzu daha net ve rol\u00fcn\u00fcze uygun \u015fekilde yeniden yazmay\u0131 deneyin."
    )


SECURITY_BLOCK_REASONS = {
    "prompt_injection",
    "prompt_leak_attempt",
    "code_injection",
    "enumeration_attempt",
    "write_operation_requested",
    "SQL_INJECTION",
    "SQL_ONLY_SELECT",
    "SQL_SYSTEM_SCHEMA",
    "SQL_SENSITIVE_COLUMN",
}

ACCESS_DENIED_REASONS = {
    "ACCESS_DENIED_STORE",
    "ACCESS_DENIED_USER",
    "ACCESS_DENIED_PRIVATE_DATA",
}


def is_security_block(reason: str) -> bool:
    return (reason or "").strip() in SECURITY_BLOCK_REASONS


def is_access_denied(reason: str) -> bool:
    return (reason or "").strip() in ACCESS_DENIED_REASONS
