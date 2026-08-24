from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ContactType = Literal["email", "phone", "whatsapp", "wechat", "contact_form"]
ReviewStatus = Literal["accepted", "manual_review"]

SCHEMA_VERSION = 1
PARSER_VERSION = "contact-extractor-v1"


@dataclass(frozen=True, slots=True)
class ConfidenceComponent:
    code: str
    points: int
    reason: str


@dataclass(frozen=True, slots=True)
class ContactCandidate:
    schema_version: int
    parser_version: str
    contact_type: ContactType
    normalized_value: str
    raw_value: str
    display_value_masked: str
    classification: str
    confidence: int
    confidence_components: tuple[ConfidenceComponent, ...]
    evidence_context: str
    source_url: str
    review_status: ReviewStatus


def review_status_for(confidence: int) -> ReviewStatus | None:
    if confidence >= 80:
        return "accepted"
    if confidence >= 55:
        return "manual_review"
    return None
