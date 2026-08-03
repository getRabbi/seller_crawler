from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urlparse

from sellerintel.extractors.common import (
    base_confidence_components,
    classify,
    component_total,
    context_window,
    is_labeled_context,
    parse_contact_document,
)
from sellerintel.extractors.models import (
    PARSER_VERSION,
    SCHEMA_VERSION,
    ConfidenceComponent,
    ContactCandidate,
    review_status_for,
)
from sellerintel.extractors.phone import mask_phone, normalize_phone

WHATSAPP_LABELS = ("whatsapp", "wa.me", "api.whatsapp.com", "whatsapp number")


def extract_whatsapp_contacts(
    markup: str,
    *,
    source_url: str,
    default_region: str | None = None,
) -> list[ContactCandidate]:
    document = parse_contact_document(markup)
    raw_candidates = _whatsapp_values_from_links(document.links)
    raw_candidates.extend(_visible_whatsapp_numbers(document.text, default_region))

    results: dict[str, ContactCandidate] = {}
    for raw_value in raw_candidates:
        normalized = normalize_phone(raw_value, default_region=default_region)
        if normalized is None:
            continue
        context = context_window(document.text, raw_value) or raw_value
        masked = mask_phone(normalized)
        labeled = is_labeled_context(context, WHATSAPP_LABELS)
        components = base_confidence_components(
            source_url=source_url,
            context=context,
            labeled=labeled,
        )
        components.append(
            ConfidenceComponent(
                code="whatsapp_public_business_channel",
                points=20,
                reason="Source explicitly presents the number as a WhatsApp contact.",
            )
        )

        confidence = component_total(components)
        review_status = review_status_for(confidence)
        if review_status is None:
            continue

        candidate = ContactCandidate(
            schema_version=SCHEMA_VERSION,
            parser_version=PARSER_VERSION,
            contact_type="whatsapp",
            normalized_value=normalized,
            raw_value=raw_value,
            display_value_masked=masked,
            classification=classify(confidence, business_label=labeled),
            confidence=confidence,
            confidence_components=tuple(components),
            evidence_context=context.replace(raw_value, masked).replace(normalized, masked),
            source_url=source_url,
            review_status=review_status,
        )
        previous = results.get(normalized)
        if previous is None or candidate.confidence > previous.confidence:
            results[normalized] = candidate

    return sorted(results.values(), key=lambda candidate: candidate.normalized_value)


def _whatsapp_values_from_links(links: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for link in links:
        parsed = urlparse(unquote(link))
        scheme = parsed.scheme.lower()
        host = parsed.netloc.lower()
        if scheme == "whatsapp":
            values.append(parsed.path)
        elif host == "wa.me":
            values.append(parsed.path.strip("/"))
        elif host == "api.whatsapp.com" and parsed.path.startswith("/send"):
            phone_values = parse_qs(parsed.query).get("phone", [])
            values.extend(phone_values)
    return values


def _visible_whatsapp_numbers(text: str, default_region: str | None) -> list[str]:
    _ = default_region
    values: list[str] = []
    visible_pattern = r"whatsapp[^+0-9]{0,24}(?P<number>\+?[0-9][0-9 .()/-]{6,})"
    for match in re.finditer(visible_pattern, text, re.I):
        values.append(match.group("number"))
    return values
