from __future__ import annotations

import html
import re
from collections.abc import Iterable
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlparse

from sellerintel.extractors.models import ConfidenceComponent

BUSINESS_TERMS = (
    "business",
    "contact",
    "customer service",
    "export",
    "inquiry",
    "manufacturer",
    "oem",
    "odm",
    "sales",
    "service",
    "supplier",
    "support",
    "wholesale",
    "\u5546\u52a1",
    "\u5ba2\u670d",
    "\u8054\u7cfb",
    "\u9500\u552e",
)

CONTACT_PAGE_TERMS = (
    "contact",
    "contact-us",
    "contactus",
    "kontakt",
    "contato",
    "contacto",
    "\u8054\u7cfb",
)

DIRECTORY_TERMS = ("directory", "listing", "yellow-pages", "people-search", "profile")
PERSONAL_TERMS = (
    "personal profile",
    "resume",
    "curriculum vitae",
    "blog comment",
    "job seeker",
    "private",
)


@dataclass(frozen=True, slots=True)
class ContactDocument:
    text: str
    links: tuple[str, ...]


class ContactHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._script_type: str | None = None
        self._collect_json_ld = False
        self._chunks: list[str] = []
        self._links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name.lower(): value or "" for name, value in attrs}
        if tag in {"style", "noscript"}:
            self._skip_depth += 1
            return
        if tag == "script":
            self._skip_depth += 1
            self._script_type = attributes.get("type", "").lower()
            self._collect_json_ld = "ld+json" in self._script_type
            return

        href = attributes.get("href")
        if href:
            self._links.append(html.unescape(href))
            self._chunks.append(href)

        for name in ("alt", "aria-label", "title", "content"):
            value = attributes.get(name)
            if value:
                self._chunks.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
            if tag == "script":
                self._script_type = None
                self._collect_json_ld = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0 and not self._collect_json_ld:
            return
        if data.strip():
            self._chunks.append(data)

    def document(self) -> ContactDocument:
        return ContactDocument(
            text=normalize_space(" ".join(self._chunks)),
            links=tuple(self._links),
        )


def parse_contact_document(markup: str) -> ContactDocument:
    parser = ContactHTMLParser()
    parser.feed(markup)
    parser.close()
    return parser.document()


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def context_window(text: str, needle: str, *, radius: int = 90, mask: str | None = None) -> str:
    normalized_text = normalize_space(text)
    index = normalized_text.lower().find(needle.lower())
    if index < 0:
        return ""
    start = max(0, index - radius)
    end = min(len(normalized_text), index + len(needle) + radius)
    context = normalized_text[start:end].strip()
    if mask:
        context = re.sub(re.escape(needle), mask, context, flags=re.IGNORECASE)
    return context


def source_path(source_url: str) -> str:
    parsed = urlparse(source_url)
    return f"{parsed.netloc} {parsed.path}".lower()


def has_any(value: str, terms: Iterable[str]) -> bool:
    lowered = value.lower()
    return any(term.lower() in lowered for term in terms)


def base_confidence_components(
    *,
    source_url: str,
    context: str,
    labeled: bool,
) -> list[ConfidenceComponent]:
    components: list[ConfidenceComponent] = []
    path = source_path(source_url)
    combined = f"{path} {context}".lower()

    if has_any(path, CONTACT_PAGE_TERMS):
        components.append(
            ConfidenceComponent(
                code="official_contact_page",
                points=45,
                reason="Source URL looks like an official contact page.",
            )
        )
    if labeled:
        components.append(
            ConfidenceComponent(
                code="labeled_public_contact",
                points=15,
                reason="Nearby label identifies the value as a public contact.",
            )
        )
    if has_any(combined, BUSINESS_TERMS):
        components.append(
            ConfidenceComponent(
                code="business_intent_context",
                points=10,
                reason="Nearby context contains business intent.",
            )
        )
    if has_any(combined, ("supplier", "manufacturer", "wholesale")):
        components.append(
            ConfidenceComponent(
                code="public_supplier_profile",
                points=10,
                reason="Nearby context indicates a public supplier profile.",
            )
        )
    if has_any(combined, DIRECTORY_TERMS):
        components.append(
            ConfidenceComponent(
                code="directory_only_result",
                points=-30,
                reason="Directory-only context needs corroboration.",
            )
        )
    if has_any(combined, PERSONAL_TERMS):
        components.append(
            ConfidenceComponent(
                code="personal_profile_context",
                points=-50,
                reason="Nearby context looks personal rather than business.",
            )
        )

    return components


def component_total(components: Iterable[ConfidenceComponent]) -> int:
    return max(0, min(100, sum(component.points for component in components)))


def classify(confidence: int, *, business_label: bool) -> str:
    if confidence >= 80:
        return "business_verified"
    if business_label:
        return "business_public_manual_review"
    return "low_confidence_manual_review"


def is_labeled_context(context: str, labels: Iterable[str]) -> bool:
    return has_any(context, labels)
