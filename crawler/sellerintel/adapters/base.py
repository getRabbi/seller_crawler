from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from ipaddress import ip_address
from typing import Protocol
from urllib.parse import urlparse

from sellerintel.config.sources import (
    RiskLevel,
    RobotsPolicy,
    SourcePolicy,
    TermsReviewStatus,
    TermsRisk,
)
from sellerintel.extractors.common import parse_contact_document
from sellerintel.extractors.models import ContactCandidate


class SourceAdapter(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def source_family(self) -> str: ...

    @property
    def risk_level(self) -> RiskLevel: ...

    @property
    def robots_policy(self) -> RobotsPolicy: ...

    @property
    def terms_risk(self) -> TermsRisk: ...

    @property
    def terms_review_status(self) -> TermsReviewStatus: ...

    @property
    def concurrency_per_domain(self) -> int: ...

    def is_allowed(self, url: str) -> bool: ...

    def explain_url_policy(self, url: str) -> AdapterDecision: ...

    def build_requests(self, seed: Seed) -> Iterable[AdapterRequest]: ...

    def parse_identity(self, response: AdapterResponse) -> list[IdentityCandidate]: ...

    def parse_contacts(self, response: AdapterResponse) -> list[ContactCandidate]: ...

    def cooldown_for(self, response: AdapterResponse) -> timedelta: ...


class AdapterResponse(Protocol):
    @property
    def url(self) -> str: ...

    @property
    def status(self) -> int: ...

    @property
    def text(self) -> str: ...

    @property
    def headers(self) -> Mapping[str, str]: ...


@dataclass(frozen=True, slots=True)
class Seed:
    url: str
    seller_id: str | None = None


@dataclass(frozen=True, slots=True)
class AdapterRequest:
    url: str
    adapter_name: str
    metadata: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class AdapterDecision:
    allowed: bool
    reason: str


@dataclass(frozen=True, slots=True)
class IdentityCandidate:
    source_url: str
    field_name: str
    value: str
    confidence: int


class PolicyBackedAdapter:
    def __init__(self, policy: SourcePolicy) -> None:
        self.policy = policy
        self.name = policy.adapter_name
        self.source_family = policy.source_family
        self.risk_level = policy.risk_level
        self.robots_policy = policy.robots_policy
        self.terms_risk = policy.terms_risk
        self.terms_review_status = policy.terms_review_status
        self.concurrency_per_domain = policy.concurrency_per_domain

    def is_allowed(self, url: str) -> bool:
        return self.explain_url_policy(url).allowed

    def explain_url_policy(self, url: str) -> AdapterDecision:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return AdapterDecision(False, "URL must use http or https.")
        if parsed.username or parsed.password:
            return AdapterDecision(False, "URL credentials are not allowed.")
        if parsed.hostname is None:
            return AdapterDecision(False, "URL must include a hostname.")
        if _is_private_test_host(parsed.hostname):
            return AdapterDecision(False, "Localhost and private test hosts are not source URLs.")
        if self.robots_policy == "deny":
            return AdapterDecision(False, "Adapter robots policy denies crawling.")
        if self.terms_risk == "restricted" or self.terms_review_status == "restricted":
            return AdapterDecision(False, "Adapter terms policy restricts crawling.")
        return AdapterDecision(True, "Allowed by adapter policy.")

    def build_requests(self, seed: Seed) -> Iterable[AdapterRequest]:
        if not self.is_allowed(seed.url):
            return ()
        return (
            AdapterRequest(
                url=seed.url,
                adapter_name=self.name,
                metadata={"seller_id": seed.seller_id or ""},
            ),
        )

    def parse_identity(self, response: AdapterResponse) -> list[IdentityCandidate]:
        _ = response
        return []

    def parse_contacts(self, response: AdapterResponse) -> list[ContactCandidate]:
        _ = response
        return []

    def cooldown_for(self, response: AdapterResponse) -> timedelta:
        if response.status == 429:
            return timedelta(seconds=retry_after_seconds(response))
        if is_blocked_response(response):
            return timedelta(seconds=self.policy.blocked_cooldown_seconds)
        return timedelta(seconds=self.policy.minimum_delay_seconds)


BLOCKED_MARKERS = (
    "access denied",
    "are you human",
    "explicit block",
    "unusual traffic",
    "verify you are human",
    "complete the security check",
    "attention required",
)

SHORT_BLOCKED_MARKERS = ("captcha", "challenge", "forbidden")
RAW_CHALLENGE_MARKERS = (
    "captcha",
    "cf-chl-",
    "challenge-platform",
    "hcaptcha",
)


def is_blocked_response(response: AdapterResponse) -> bool:
    if response.status in {401, 403, 407, 429, 451}:
        return True
    raw_text = response.text.casefold()
    visible_text = parse_contact_document(response.text).text.casefold()
    if any(marker in visible_text for marker in BLOCKED_MARKERS):
        return True
    if len(visible_text) <= 600 and any(
        marker in visible_text for marker in SHORT_BLOCKED_MARKERS
    ):
        return True
    return len(visible_text) <= 120 and any(
        marker in raw_text for marker in RAW_CHALLENGE_MARKERS
    )


def retry_after_seconds(
    response: AdapterResponse,
    *,
    now: datetime | None = None,
    default_seconds: int = 3_600,
    maximum_seconds: int = 604_800,
) -> int:
    if response.status not in {429, 503}:
        return default_seconds
    value = next(
        (
            header_value
            for name, header_value in response.headers.items()
            if name.casefold() == "retry-after"
        ),
        "",
    ).strip()
    if value.isdigit():
        return max(1, min(maximum_seconds, int(value)))
    if value:
        try:
            retry_at = parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=UTC)
            current = now or datetime.now(UTC)
            return max(1, min(maximum_seconds, int((retry_at - current).total_seconds())))
        except (TypeError, ValueError, OverflowError):
            pass
    return default_seconds


def _is_private_test_host(hostname: str) -> bool:
    normalized = hostname.strip("[]").lower()
    if normalized == "localhost":
        return True
    try:
        address = ip_address(normalized)
    except ValueError:
        return False
    return address.is_loopback or address.is_unspecified
