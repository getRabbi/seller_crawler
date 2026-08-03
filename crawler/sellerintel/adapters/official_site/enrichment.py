from __future__ import annotations

import posixpath
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse, urlunparse

from sellerintel.extractors import ContactCandidate, extract_contacts
from sellerintel.extractors.common import parse_contact_document
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.spool.checksums import sha256_hex

ALLOWED_STATIC_PATHS = (
    "/",
    "/about",
    "/about-us",
    "/contact",
    "/contact-us",
    "/support",
    "/wholesale",
    "/distributor",
    "/privacy",
    "/terms",
)
SITEMAP_BUSINESS_TERMS = (
    "about",
    "business",
    "company",
    "contact",
    "distributor",
    "export",
    "sales",
    "support",
    "wholesale",
)
BLOCKED_PATH_TERMS = (
    "account",
    "cart",
    "checkout",
    "login",
    "signin",
    "wp-admin",
)


@dataclass(frozen=True, slots=True)
class OfficialSiteCrawlPlan:
    seed_url: str
    source_domain: str
    urls: tuple[str, ...]
    page_budget: int


@dataclass(frozen=True, slots=True)
class EvidenceEnvelope:
    canonical_url: str
    source_domain: str
    content_hash: str
    object_key: str
    upload_status: str


@dataclass(frozen=True, slots=True)
class OfficialPageEnrichment:
    canonical_url: str
    source_domain: str
    content_hash: str
    evidence: EvidenceEnvelope
    contacts: tuple[ContactCandidate, ...]


def build_official_site_crawl_plan(
    seed_url: str,
    *,
    html: str | None = None,
    sitemap_text: str | None = None,
    page_budget: int = 8,
) -> OfficialSiteCrawlPlan:
    if page_budget < 1:
        raise ValueError("page_budget must be at least 1")

    canonical_seed = canonicalize_official_url(seed_url)
    if canonical_seed is None:
        raise ValueError("seed_url must be an absolute http or https URL")
    source_domain = _domain_for_url(canonical_seed)
    origin = _origin_for_url(canonical_seed)
    candidates: list[tuple[str, bool]] = [(canonical_seed, False)]
    candidates.extend((f"{origin}{path}", False) for path in ALLOWED_STATIC_PATHS if path != "/")

    if html:
        document = parse_contact_document(html)
        candidates.extend((link, False) for link in document.links)
    if sitemap_text:
        candidates.extend((url, True) for url in _urls_from_sitemap(sitemap_text))

    urls: list[str] = []
    seen: set[str] = set()
    for candidate, sitemap_discovered in candidates:
        canonical = canonicalize_official_url(candidate, base_url=canonical_seed)
        if canonical is None or canonical in seen:
            continue
        if not _is_same_domain(canonical_seed, canonical):
            continue
        if not is_allowed_official_url(canonical, sitemap_discovered=sitemap_discovered):
            continue
        seen.add(canonical)
        urls.append(canonical)
        if len(urls) >= page_budget:
            break

    return OfficialSiteCrawlPlan(
        seed_url=canonical_seed,
        source_domain=source_domain,
        urls=tuple(urls),
        page_budget=page_budget,
    )


def enrich_official_page(
    html: str,
    *,
    page_url: str,
    default_region: str | None = None,
) -> OfficialPageEnrichment:
    canonical_url = canonicalize_official_url(page_url)
    if canonical_url is None:
        raise ValueError("page_url must be an absolute http or https URL")
    source_domain = _domain_for_url(canonical_url)
    payload = html.encode()
    content_hash = sha256_hex(payload)
    evidence = EvidenceEnvelope(
        canonical_url=canonical_url,
        source_domain=source_domain,
        content_hash=content_hash,
        object_key=f"evidence/official_site/{source_domain}/{content_hash}.html",
        upload_status="not_uploaded_local_phase",
    )
    contacts = extract_contacts(html, source_url=canonical_url, default_region=default_region)

    return OfficialPageEnrichment(
        canonical_url=canonical_url,
        source_domain=source_domain,
        content_hash=content_hash,
        evidence=evidence,
        contacts=tuple(contacts),
    )


def canonicalize_official_url(url: str, *, base_url: str | None = None) -> str | None:
    joined = urljoin(base_url or "", url.strip())
    parsed = urlparse(joined)
    if parsed.scheme.lower() not in {"http", "https"} or parsed.hostname is None:
        return None
    domain = canonicalize_domain(parsed.hostname)
    if domain is None:
        return None
    path = posixpath.normpath(parsed.path or "/")
    if not path.startswith("/"):
        path = f"/{path}"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((parsed.scheme.lower(), domain, path, "", "", ""))


def is_allowed_official_url(url: str, *, sitemap_discovered: bool = False) -> bool:
    parsed = urlparse(url)
    path = parsed.path.casefold() or "/"
    if any(term in path for term in BLOCKED_PATH_TERMS):
        return False
    if path in ALLOWED_STATIC_PATHS:
        return True
    return sitemap_discovered and any(term in path for term in SITEMAP_BUSINESS_TERMS)


def _urls_from_sitemap(sitemap_text: str) -> list[str]:
    loc_values = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sitemap_text, flags=re.I)
    if loc_values:
        return loc_values
    return re.findall(r"https?://[^\s<>'\"]+", sitemap_text)


def _is_same_domain(seed_url: str, candidate_url: str) -> bool:
    return _domain_for_url(seed_url) == _domain_for_url(candidate_url)


def _domain_for_url(url: str) -> str:
    parsed = urlparse(url)
    domain = canonicalize_domain(parsed.hostname or "")
    if domain is None:
        raise ValueError("URL must include a canonicalizable domain")
    return domain


def _origin_for_url(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, _domain_for_url(url), "", "", "", ""))
