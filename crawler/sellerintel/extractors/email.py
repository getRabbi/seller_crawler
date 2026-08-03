from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

from sellerintel.extractors.common import (
    base_confidence_components,
    classify,
    component_total,
    context_window,
    is_labeled_context,
    normalize_space,
    parse_contact_document,
)
from sellerintel.extractors.models import (
    PARSER_VERSION,
    SCHEMA_VERSION,
    ConfidenceComponent,
    ContactCandidate,
    review_status_for,
)

EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24})(?![\w.-])",
    re.IGNORECASE,
)
OBFUSCATED_PATTERN = re.compile(
    r"(?P<local>[A-Z0-9._%+-]{1,64})\s*(?:\[?\s*at\s*\]?|\(\s*at\s*\))\s*"
    r"(?P<domain>[A-Z0-9.-]+)\s*(?:\[?\s*dot\s*\]?|\(\s*dot\s*\))\s*"
    r"(?P<tld>[A-Z]{2,24})",
    re.IGNORECASE,
)

EMAIL_LABELS = (
    "email",
    "e-mail",
    "correo",
    "courriel",
    "contact",
    "kontakt",
    "sales",
    "export",
    "wholesale",
    "support",
    "service",
    "\u90ae\u7bb1",
    "\u7535\u5b50\u90ae\u4ef6",
)
PREFERRED_LOCAL_PARTS = {
    "business",
    "contact",
    "export",
    "info",
    "marketing",
    "sales",
    "service",
    "support",
    "ventas",
    "wholesale",
}
FREE_MAIL_DOMAINS = {
    "gmail.com",
    "hotmail.com",
    "icloud.com",
    "outlook.com",
    "qq.com",
    "yahoo.com",
}
PLACEHOLDER_EMAILS = {
    "email@example.com",
    "info@example.com",
    "name@example.com",
    "test@example.com",
    "user@example.com",
    "user@domain.com",
}


def extract_emails(markup: str, *, source_url: str) -> list[ContactCandidate]:
    document = parse_contact_document(markup)
    raw_candidates = _email_values_from_links(document.links)
    raw_candidates.extend(match.group(1) for match in EMAIL_PATTERN.finditer(document.text))
    raw_candidates.extend(
        _deobfuscate(match) for match in OBFUSCATED_PATTERN.finditer(document.text)
    )

    results: dict[str, ContactCandidate] = {}
    for raw_value in raw_candidates:
        normalized = normalize_email(raw_value)
        if not normalized or _is_obvious_false_positive(normalized):
            continue
        context = _context_for_email(document.text, raw_value, normalized)
        masked = mask_email(normalized)
        masked_context = context.replace(raw_value, masked).replace(normalized, masked)
        labeled = is_labeled_context(context, EMAIL_LABELS)
        components = base_confidence_components(
            source_url=source_url,
            context=context,
            labeled=labeled,
        )
        local_part, domain = normalized.split("@", maxsplit=1)
        if local_part in PREFERRED_LOCAL_PARTS:
            components.append(
                ConfidenceComponent(
                    code="preferred_business_mailbox",
                    points=15,
                    reason="Mailbox local part is commonly used for public business contact.",
                )
            )
        if domain in FREE_MAIL_DOMAINS:
            components.append(
                ConfidenceComponent(
                    code="free_mail_domain",
                    points=-20,
                    reason="Free-mail domains require corroboration.",
                )
            )

        confidence = component_total(components)
        review_status = review_status_for(confidence)
        if review_status is None:
            continue

        candidate = ContactCandidate(
            schema_version=SCHEMA_VERSION,
            parser_version=PARSER_VERSION,
            contact_type="email",
            normalized_value=normalized,
            raw_value=raw_value,
            display_value_masked=masked,
            classification=classify(confidence, business_label=labeled),
            confidence=confidence,
            confidence_components=tuple(components),
            evidence_context=masked_context,
            source_url=source_url,
            review_status=review_status,
        )
        previous = results.get(normalized)
        if previous is None or candidate.confidence > previous.confidence:
            results[normalized] = candidate

    return sorted(results.values(), key=lambda candidate: candidate.normalized_value)


def normalize_email(value: str) -> str | None:
    normalized = normalize_space(unquote(value)).strip(".,;:<>[](){}\"'").lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        return None
    local_part, domain = normalized.rsplit("@", maxsplit=1)
    if ".." in local_part or ".." in domain or domain.startswith("-") or domain.endswith("-"):
        return None
    return normalized


def mask_email(value: str) -> str:
    local_part, domain = value.split("@", maxsplit=1)
    masked_local = local_part[0] + "***" if len(local_part) <= 2 else f"{local_part[:2]}***"
    return f"{masked_local}@{domain}"


def _email_values_from_links(links: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for link in links:
        parsed = urlparse(link)
        if parsed.scheme.lower() == "mailto":
            values.append(parsed.path)
    return values


def _deobfuscate(match: re.Match[str]) -> str:
    return f"{match.group('local')}@{match.group('domain')}.{match.group('tld')}"


def _context_for_email(text: str, raw_value: str, normalized: str) -> str:
    return context_window(text, raw_value) or context_window(text, normalized) or normalized


def _is_obvious_false_positive(value: str) -> bool:
    local_part, domain = value.split("@", maxsplit=1)
    if value in PLACEHOLDER_EMAILS:
        return True
    if local_part in {"noreply", "no-reply", "donotreply", "do-not-reply"}:
        return True
    return domain.endswith((".example", ".invalid", ".test", ".localhost"))
