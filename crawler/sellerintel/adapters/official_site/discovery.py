from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlparse

from parsel import Selector

from sellerintel.normalization.domain import canonicalize_domain

DISCOVERY_PARSER_VERSION = "official-domain-discovery-v1"
AUTO_ACCEPT_SCORE = 80
REVIEW_SCORE = 55

_PARKED_TERMS = (
    "buy this domain",
    "domain is for sale",
    "domain for sale",
    "domain may be for sale",
    "domain parking",
    "parked free",
    "sedo domain parking",
    "hugedomains",
    "afternic",
    "parkingcrew",
)
_CONTACT_PATH_TERMS = ("contact", "support", "about", "wholesale", "distributor")


@dataclass(frozen=True, slots=True)
class DomainVerification:
    decision: str
    score: int
    signals: tuple[str, ...]
    matched_identity: str | None
    page_title: str

    @property
    def accepted(self) -> bool:
        return self.decision == "accepted"

    def compact_evidence(self, *, candidate_basis: str) -> str:
        return json.dumps(
            {
                "candidate_basis": candidate_basis,
                "decision": self.decision,
                "identity_match": self.matched_identity is not None,
                "score": self.score,
                "signals": list(self.signals),
            },
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )[:500]


def verify_official_domain(
    html: str,
    *,
    seller_names: tuple[str, ...],
    candidate_url: str,
) -> DomainVerification:
    """Conservatively verify a deterministic official-domain candidate.

    Automatic acceptance requires both an exact domain/identity match and a
    prominent on-page identity match. Generic body text alone is never enough.
    """

    selector = Selector(text=html, type="html")
    title = _clean_text(selector.css("title::text").get())[:200] or "Untitled page"
    prominent_values = [
        title,
        *selector.css("h1::text, h2::text").getall(),
        *selector.css(
            "meta[property='og:site_name']::attr(content), "
            "meta[property='og:title']::attr(content), "
            "meta[name='application-name']::attr(content)"
        ).getall(),
    ]
    json_ld_values = selector.css("script[type='application/ld+json']::text").getall()
    body_text = _clean_text(" ".join(selector.css("body ::text").getall()))[:100_000]
    body_key = _identity_key(body_text)
    lower_document = f"{title} {body_text}".casefold()

    if any(term in lower_document for term in _PARKED_TERMS):
        return DomainVerification(
            decision="rejected",
            score=0,
            signals=("parked_or_for_sale",),
            matched_identity=None,
            page_title=title,
        )

    domain = canonicalize_domain(urlparse(candidate_url).hostname or "") or ""
    domain_label = _domain_identity_label(domain)
    identities = tuple(
        (name.strip(), key)
        for name in seller_names
        if (key := _identity_key(name)) and len(key) >= 5
    )
    matched_domain = next(
        ((name, key) for name, key in identities if key == domain_label),
        None,
    )
    matched_prominent = next(
        (
            (name, key)
            for name, key in identities
            if any(
                _contains_identity(value, identity_name=name, identity_key=key)
                for value in [*prominent_values, *json_ld_values]
            )
        ),
        None,
    )

    score = 0
    signals: list[str] = []
    if matched_domain is not None:
        score += 35
        signals.append("domain_identity_exact")
    if matched_prominent is not None:
        score += 45
        signals.append("prominent_identity_exact")

    links = selector.css("a[href]::attr(href)").getall()
    if any(any(term in link.casefold() for term in _CONTACT_PATH_TERMS) for link in links):
        score += 10
        signals.append("business_path_present")

    if domain and re.search(rf"(?i)@[a-z0-9.-]*{re.escape(domain)}\b", html):
        score += 10
        signals.append("same_domain_email_present")

    if matched_domain is not None and matched_prominent is None:
        domain_name = matched_domain[1]
        if domain_name in body_key:
            score += 10
            signals.append("body_identity_mention")

    score = min(score, 100)
    matched_identity = (matched_prominent or matched_domain or (None, None))[0]
    if matched_domain is not None and matched_prominent is not None and score >= AUTO_ACCEPT_SCORE:
        decision = "accepted"
    elif score >= REVIEW_SCORE:
        decision = "review"
    else:
        decision = "rejected"
    return DomainVerification(
        decision=decision,
        score=score,
        signals=tuple(signals),
        matched_identity=matched_identity,
        page_title=title,
    )


def _identity_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return "".join(re.findall(r"[a-z0-9]+", normalized.casefold()))


def _contains_identity(value: str, *, identity_name: str, identity_key: str) -> bool:
    value_tokens = _identity_tokens(value)
    identity_tokens = _identity_tokens(identity_name)
    if not value_tokens or not identity_tokens:
        return False
    if identity_key in value_tokens:
        return True
    width = len(identity_tokens)
    return any(
        value_tokens[index : index + width] == identity_tokens
        for index in range(0, len(value_tokens) - width + 1)
    )


def _identity_tokens(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.findall(r"[a-z0-9]+", normalized.casefold())


def _domain_identity_label(domain: str) -> str:
    suffixes = (".co.uk", ".com.au")
    for suffix in suffixes:
        if domain.endswith(suffix):
            return _identity_key(domain[: -len(suffix)])
    return _identity_key(domain.split(".", 1)[0])


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()
