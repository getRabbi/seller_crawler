from __future__ import annotations

import re

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

WECHAT_LABELS = (
    "wechat",
    "wechat id",
    "\u5fae\u4fe1",
    "\u5fae\u4fe1\u53f7",
    "\u5ba2\u670d\u5fae\u4fe1",
    "\u5546\u52a1\u5fae\u4fe1",
)
WECHAT_ID_PATTERN = re.compile(
    r"(?:wechat(?:\s+id)?|[\u5fae\u4fe1\u53f7\u5ba2\u670d\u5546\u52a1]{2,6})"
    r"\s*[:\uff1a#-]?\s*(?P<id>[A-Za-z][A-Za-z0-9_-]{5,19})",
    re.IGNORECASE,
)
GENERIC_WECHAT_VALUES = {"wechat", "official", "customer", "service", "business"}


def extract_wechat_contacts(markup: str, *, source_url: str) -> list[ContactCandidate]:
    document = parse_contact_document(markup)
    results: dict[str, ContactCandidate] = {}

    for match in WECHAT_ID_PATTERN.finditer(document.text):
        raw_value = match.group("id")
        normalized = normalize_wechat_id(raw_value)
        if normalized is None:
            continue
        context = context_window(document.text, raw_value) or raw_value
        labeled = is_labeled_context(context, WECHAT_LABELS)
        if not labeled:
            continue
        masked = mask_wechat_id(normalized)
        components = base_confidence_components(
            source_url=source_url,
            context=context,
            labeled=True,
        )
        components.append(
            ConfidenceComponent(
                code="wechat_business_label",
                points=20,
                reason="Nearby label identifies a public WeChat business contact.",
            )
        )

        confidence = component_total(components)
        review_status = review_status_for(confidence)
        if review_status is None:
            continue

        candidate = ContactCandidate(
            schema_version=SCHEMA_VERSION,
            parser_version=PARSER_VERSION,
            contact_type="wechat",
            normalized_value=normalized,
            raw_value=raw_value,
            display_value_masked=masked,
            classification=classify(confidence, business_label=True),
            confidence=confidence,
            confidence_components=tuple(components),
            evidence_context=context.replace(raw_value, masked),
            source_url=source_url,
            review_status=review_status,
        )
        previous = results.get(normalized)
        if previous is None or candidate.confidence > previous.confidence:
            results[normalized] = candidate

    return sorted(results.values(), key=lambda candidate: candidate.normalized_value)


def normalize_wechat_id(value: str) -> str | None:
    normalized = value.strip().lower()
    if normalized in GENERIC_WECHAT_VALUES:
        return None
    if not re.fullmatch(r"[a-z][a-z0-9_-]{5,19}", normalized):
        return None
    return normalized


def mask_wechat_id(value: str) -> str:
    if len(value) <= 4:
        return f"{value[0]}***"
    return f"{value[:2]}***{value[-2:]}"
