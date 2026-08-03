from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

import phonenumbers
from phonenumbers import PhoneNumberFormat

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

PHONE_LABELS = (
    "phone",
    "telephone",
    "tel",
    "call",
    "mobile",
    "whatsapp",
    "telefono",
    "kontakt",
    "\u7535\u8bdd",
    "\u624b\u673a",
)
WHATSAPP_ONLY_LABELS = ("whatsapp", "wa.me", "api.whatsapp.com")
TEL_CLEAN_RE = re.compile(r"[^0-9+]")


def extract_phone_numbers(
    markup: str,
    *,
    source_url: str,
    default_region: str | None = None,
) -> list[ContactCandidate]:
    document = parse_contact_document(markup)
    raw_candidates = _phone_values_from_tel_links(document.links)
    raw_candidates.extend(
        match.raw_string
        for match in phonenumbers.PhoneNumberMatcher(document.text, default_region)
    )

    results: dict[str, ContactCandidate] = {}
    for raw_value in raw_candidates:
        normalized = normalize_phone(raw_value, default_region=default_region)
        if normalized is None:
            continue
        context = context_window(document.text, raw_value) or raw_value
        if _is_whatsapp_link_context(raw_value, context):
            continue
        masked = mask_phone(normalized)
        labeled = is_labeled_context(context, PHONE_LABELS)
        components = base_confidence_components(
            source_url=source_url,
            context=context,
            labeled=labeled,
        )
        if labeled:
            components.append(
                ConfidenceComponent(
                    code="business_phone_label",
                    points=15,
                    reason="Nearby label identifies a public business phone.",
                )
            )

        confidence = component_total(components)
        review_status = review_status_for(confidence)
        if review_status is None:
            continue

        candidate = ContactCandidate(
            schema_version=SCHEMA_VERSION,
            parser_version=PARSER_VERSION,
            contact_type="phone",
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


def normalize_phone(value: str, *, default_region: str | None = None) -> str | None:
    cleaned = TEL_CLEAN_RE.sub("", unquote(value))
    if len(cleaned) < 7:
        return None
    try:
        number = phonenumbers.parse(cleaned, default_region)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_possible_number(number) or not phonenumbers.is_valid_number(number):
        return None
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def mask_phone(value: str) -> str:
    digits = value.lstrip("+")
    if len(digits) <= 4:
        return "+***"
    return f"+{'*' * max(3, len(digits) - 4)}{digits[-4:]}"


def _phone_values_from_tel_links(links: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for link in links:
        parsed = urlparse(link)
        if parsed.scheme.lower() == "tel":
            values.append(parsed.path)
    return values


def _is_whatsapp_link_context(raw_value: str, context: str) -> bool:
    digits = TEL_CLEAN_RE.sub("", raw_value).lstrip("+")
    lowered = context.lower()
    return (
        is_labeled_context(context, WHATSAPP_ONLY_LABELS)
        and digits != ""
        and (f"phone={digits}" in lowered or f"wa.me/{digits}" in lowered)
    )
