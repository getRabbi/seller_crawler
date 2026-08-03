from __future__ import annotations

from sellerintel.extractors.email import extract_emails
from sellerintel.extractors.models import ContactCandidate
from sellerintel.extractors.phone import extract_phone_numbers
from sellerintel.extractors.wechat import extract_wechat_contacts
from sellerintel.extractors.whatsapp import extract_whatsapp_contacts


def extract_contacts(
    markup: str,
    *,
    source_url: str,
    default_region: str | None = None,
) -> list[ContactCandidate]:
    candidates = [
        *extract_emails(markup, source_url=source_url),
        *extract_phone_numbers(markup, source_url=source_url, default_region=default_region),
        *extract_whatsapp_contacts(markup, source_url=source_url, default_region=default_region),
        *extract_wechat_contacts(markup, source_url=source_url),
    ]
    return sorted(
        _dedupe(candidates),
        key=lambda candidate: (candidate.contact_type, candidate.normalized_value),
    )


def _dedupe(candidates: list[ContactCandidate]) -> list[ContactCandidate]:
    best_by_key: dict[tuple[str, str], ContactCandidate] = {}
    for candidate in candidates:
        key = (candidate.contact_type, candidate.normalized_value)
        previous = best_by_key.get(key)
        if previous is None or candidate.confidence > previous.confidence:
            best_by_key[key] = candidate
    return list(best_by_key.values())
