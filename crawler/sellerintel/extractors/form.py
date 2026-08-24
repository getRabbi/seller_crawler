from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlparse, urlunparse

from sellerintel.extractors.models import (
    SCHEMA_VERSION,
    ConfidenceComponent,
    ContactCandidate,
)

PARSER_VERSION = "contact-form-extractor-v1"
CONTACT_PATH_TERMS = (
    "contact",
    "contact-us",
    "contactus",
    "customer-care",
    "customer-service",
    "help",
    "inquiry",
    "support",
)
BLOCKED_FORM_TERMS = (
    "account",
    "cart",
    "checkout",
    "login",
    "newsletter",
    "password",
    "recover",
    "search",
    "signin",
    "subscribe",
)
EMAIL_FIELD_TERMS = ("email", "e-mail", "mail")
MESSAGE_FIELD_TERMS = ("comment", "enquiry", "inquiry", "message", "question")


@dataclass(slots=True)
class _FormState:
    descriptor: str
    has_reply_field: bool = False
    has_message_field: bool = False
    has_submit_control: bool = False
    blocked: bool = False


class _ContactFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._form: _FormState | None = None
        self.forms: list[_FormState] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name.casefold(): (value or "").casefold() for name, value in attrs}
        if tag == "form":
            descriptor = " ".join(
                attributes.get(name, "")
                for name in ("action", "aria-label", "class", "id", "name")
            )
            self._form = _FormState(
                descriptor=descriptor,
                blocked=_contains_term(descriptor, BLOCKED_FORM_TERMS),
            )
            return
        if self._form is None:
            return

        descriptor = " ".join(
            attributes.get(name, "")
            for name in ("aria-label", "id", "name", "placeholder", "title")
        )
        if tag == "input":
            input_type = attributes.get("type", "text")
            if input_type == "password":
                self._form.blocked = True
            if input_type == "email" or _contains_term(descriptor, EMAIL_FIELD_TERMS):
                self._form.has_reply_field = True
            if _contains_term(descriptor, MESSAGE_FIELD_TERMS):
                self._form.has_message_field = True
            if input_type in {"submit", "image"}:
                self._form.has_submit_control = True
        elif tag == "textarea":
            self._form.has_message_field = True
        elif tag == "button" and attributes.get("type", "submit") == "submit":
            self._form.has_submit_control = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "form" and self._form is not None:
            self.forms.append(self._form)
            self._form = None

    def close(self) -> None:
        super().close()
        if self._form is not None:
            self.forms.append(self._form)
            self._form = None


def extract_contact_forms(markup: str, *, source_url: str) -> list[ContactCandidate]:
    canonical_url = _canonical_public_page_url(source_url)
    if canonical_url is None or not _is_contact_page(canonical_url):
        return []

    parser = _ContactFormParser()
    parser.feed(markup)
    parser.close()
    if not any(_is_public_contact_form(form) for form in parser.forms):
        return []

    display_value = _display_url(canonical_url)
    components = (
        ConfidenceComponent(
            code="official_contact_page",
            points=50,
            reason="Canonical official-site path identifies a contact or support page.",
        ),
        ConfidenceComponent(
            code="public_contact_form",
            points=35,
            reason="A public form has both a reply field and a message field.",
        ),
        ConfidenceComponent(
            code="operator_initiated_channel",
            points=15,
            reason="The form is exposed for a visitor to initiate a business inquiry.",
        ),
    )
    return [
        ContactCandidate(
            schema_version=SCHEMA_VERSION,
            parser_version=PARSER_VERSION,
            contact_type="contact_form",
            normalized_value=canonical_url,
            raw_value=canonical_url,
            display_value_masked=display_value,
            classification="business_public_contact_form",
            confidence=100,
            confidence_components=components,
            evidence_context=f"Public business contact form at {display_value}.",
            source_url=canonical_url,
            review_status="accepted",
        )
    ]


def _is_public_contact_form(form: _FormState) -> bool:
    return (
        not form.blocked
        and form.has_reply_field
        and form.has_message_field
        and form.has_submit_control
    )


def _is_contact_page(url: str) -> bool:
    path = urlparse(url).path.casefold()
    return _contains_term(path, CONTACT_PATH_TERMS)


def _canonical_public_page_url(value: str) -> str | None:
    parsed = urlparse(value.strip())
    if parsed.scheme.casefold() not in {"http", "https"} or not parsed.hostname:
        return None
    if parsed.username or parsed.password:
        return None
    hostname = parsed.hostname.casefold().removeprefix("www.").rstrip(".")
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urlunparse((parsed.scheme.casefold(), hostname, path, "", "", ""))


def _display_url(value: str) -> str:
    parsed = urlparse(value)
    parts = [part for part in parsed.path.split("/") if part]
    path = parsed.path if len(parts) <= 1 else f"/…/{parts[-1]}"
    return f"{parsed.hostname}{path}"


def _contains_term(value: str, terms: tuple[str, ...]) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    padded = f"-{normalized}-"
    return any(f"-{term}-" in padded for term in terms)
