from __future__ import annotations

import hashlib
import json
import os
import re
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from pathlib import Path
from typing import Any, Self
from urllib.parse import urlparse

import scrapy
from scrapy import Request
from scrapy.crawler import Crawler
from scrapy.http import Response, TextResponse
from scrapy.settings import BaseSettings

from sellerintel.adapters.base import is_blocked_response, retry_after_seconds
from sellerintel.adapters.official_site import (
    build_official_site_crawl_plan,
    canonicalize_official_url,
    contact_records_for_page,
    deterministic_uuidv7,
    enrich_official_page,
    seller_record_for_domain,
    source_record_for_page,
)
from sellerintel.clients.cooldown import CooldownClient, cooldown_endpoint_from_ingestion
from sellerintel.config.features import assert_startup_gates, load_runtime_config
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.schemas.ingestion import (
    UUIDV7_PATTERN,
    ContactRecord,
    CrawlRunRecord,
    IngestionBatch,
    SellerRecord,
    SourceRecord,
    SourceRegistryRecord,
)
from sellerintel.security.contact_crypto import ContactCipher

MAX_CONTACTS_PER_PAGE_BATCH = 17
CONTACT_TYPES = frozenset({"email", "phone", "whatsapp", "wechat"})
RUNTIME_SETTING_KEYS = (
    "RUNNER_MODE",
    "LIVE_CRAWL_ENABLED",
    "PAID_SERVICES_ALLOWED",
    "MAX_EXTERNAL_MONTHLY_SPEND_AUD",
    "ALLOW_EXTRA_SCRAPY_UNITS",
    "ALLOW_PAID_GITHUB_ACTIONS_MINUTES",
    "ALLOW_PAID_ADDONS",
    "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED",
    "SCRAPY_CLOUD_DEPLOY_ENABLED",
    "SCRAPY_CLOUD_MAX_UNITS",
    "ZYTE_API_ENABLED",
    "ZYTE_API_DAILY_REQUEST_BUDGET",
    "ZYTE_API_MONTHLY_BUDGET_USD",
    "GITHUB_ACTIONS_CRAWLER_ENABLED",
    "CREDIT_RUNNER_ENABLED",
    "ENABLE_AMAZON",
    "ENABLE_OFFICIAL_WEBSITE",
    "ENABLE_LOCAL_PLAYWRIGHT",
    "GLOBAL_CRAWL_KILL_SWITCH",
    "CONTACT_ENCRYPTION_KEYS",
    "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION",
    "INGESTION_ENDPOINT_URL",
    "INGESTION_HMAC_SECRET",
    "SOURCE_COOLDOWN_CHECK_URL",
)


@dataclass(frozen=True, slots=True)
class OfficialSellerTarget:
    seller_id: str
    seller_name: str
    seed_url: str


class OfficialWebsiteSpider(scrapy.Spider):
    name = "official_website"
    handle_httpstatus_all = True

    custom_settings = {
        "DOWNLOADER_MIDDLEWARES": {
            "sellerintel.middlewares.FixtureOfficialSiteMiddleware": 50,
            "sellerintel.middlewares.PublicNetworkGuardMiddleware": 950,
        },
        "DEPTH_LIMIT": 0,
        "DNS_RESOLVER": "sellerintel.security.dns.PublicCachingResolver",
        "ROBOTSTXT_OBEY": True,
    }

    def __init__(
        self,
        *,
        seed_urls: str,
        crawl_run_id: str,
        page_budget: str | int = 8,
        max_depth: str | int = 2,
        fixture_dir: str = "",
        default_region: str = "",
        seller_name: str = "",
        seller_targets: str = "",
        contact_types: str = "",
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.crawl_run_id = crawl_run_id
        self.page_budget = _bounded_int(page_budget, name="page_budget", minimum=1, maximum=25)
        self.max_depth = _bounded_int(max_depth, name="max_depth", minimum=0, maximum=3)
        self.fixture_dir = Path(fixture_dir).resolve() if fixture_dir else None
        self.default_region = default_region or None
        self.explicit_seller_name = seller_name.strip()
        self.seed_urls = _parse_seed_urls(seed_urls)
        self.contact_types = _parse_contact_types(contact_types)
        self._seller_targets = _parse_seller_targets(seller_targets, self.seed_urls)
        self._seed_by_domain = {_domain(url): url for url in self.seed_urls}
        self.allowed_domains = sorted({_domain(url) for url in self.seed_urls})
        self._queues: dict[str, list[tuple[str, int]]] = {
            domain: [] for domain in self.allowed_domains
        }
        self._seen: dict[str, set[str]] = {domain: set() for domain in self.allowed_domains}
        self._pages_scheduled: dict[str, int] = {domain: 0 for domain in self.allowed_domains}
        self._blocked_domains: set[str] = set()
        self._company_names: dict[str, str] = {}
        self._contact_cipher: ContactCipher | None = None
        self._cooldown_client: CooldownClient | None = None
        self._observed_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

        if self.fixture_dir is not None and not self.fixture_dir.is_dir():
            raise ValueError("fixture_dir must be an existing directory")

    @classmethod
    def from_crawler(
        cls,
        crawler: Crawler,
        *args: Any,
        **kwargs: Any,
    ) -> Self:
        spider = super().from_crawler(crawler, *args, **kwargs)
        spider._validate_runtime(crawler.settings)
        return spider

    def _validate_runtime(self, settings: BaseSettings) -> None:
        configured_observed_at = settings.get("SELLERINTEL_OBSERVED_AT")
        if isinstance(configured_observed_at, str) and configured_observed_at.strip():
            self._observed_at = configured_observed_at.strip()
        runtime_values = dict(os.environ)
        for key in RUNTIME_SETTING_KEYS:
            value = settings.get(key)
            if value is not None:
                runtime_values[key] = _setting_value(value)
        runtime_config = assert_startup_gates(load_runtime_config(runtime_values))
        if not runtime_config.feature_flags.get("ENABLE_OFFICIAL_WEBSITE", False):
            raise ValueError("ENABLE_OFFICIAL_WEBSITE=true is required")
        if runtime_config.feature_flags.get("GLOBAL_CRAWL_KILL_SWITCH", False):
            raise ValueError("GLOBAL_CRAWL_KILL_SWITCH is active")

        if self.fixture_dir is None and not runtime_config.live_crawl_enabled:
            raise ValueError("LIVE_CRAWL_ENABLED=true is required outside fixture mode")
        if self.fixture_dir is None and runtime_config.runner_mode not in {
            "fallback_local",
            "zyte_student_active",
        }:
            raise ValueError("Live official-site crawl requires an explicitly selected runner")

        if self.fixture_dir is not None:
            self._contact_cipher = ContactCipher.for_fixture_tests()
            return

        self._contact_cipher = ContactCipher.from_environment(runtime_values)
        ingestion_endpoint = runtime_values.get("INGESTION_ENDPOINT_URL", "")
        cooldown_endpoint = runtime_values.get("SOURCE_COOLDOWN_CHECK_URL", "")
        if not cooldown_endpoint:
            cooldown_endpoint = cooldown_endpoint_from_ingestion(ingestion_endpoint)
        self._cooldown_client = CooldownClient(
            endpoint_url=cooldown_endpoint,
            hmac_secret=runtime_values.get("INGESTION_HMAC_SECRET", ""),
        )

    def start_requests(self) -> Iterable[Request]:
        return self._initial_requests()

    async def start(self) -> AsyncIterator[Request]:
        for request in self._initial_requests():
            yield request

    def _initial_requests(self) -> Iterable[Request]:
        for seed_url in self.seed_urls:
            domain = _domain(seed_url)
            if self._cooldown_client is not None:
                decision = self._cooldown_client.check(domain)
                if not decision.allowed:
                    self._blocked_domains.add(domain)
                    self._inc_stat("sellerintel/blocked_count")
                    self.logger.warning(
                        "Official-site domain remains in cooldown domain=%s blocked_until=%s",
                        domain,
                        decision.blocked_until,
                    )
                    continue
            self._seen[domain].add(seed_url)
            self._pages_scheduled[domain] = 1
            yield self._page_request(seed_url, depth=0)

    def parse_page(self, response: Response) -> Iterable[dict[str, object] | Request]:
        domain = _domain(response.url)
        if domain in self._blocked_domains:
            return

        if is_blocked_response(_ResponseAdapter(response)):
            yield from self._record_domain_block(response, domain)
            return

        if (
            response.status < 200
            or response.status >= 400
            or not isinstance(response, TextResponse)
        ):
            self._inc_stat("sellerintel/error_count")
            yield from self._schedule_next(domain)
            return

        observed_at = str(response.meta["observed_at"])
        enrichment = enrich_official_page(
            response.text,
            page_url=response.url,
            default_region=self.default_region,
            observed_at=observed_at,
        )
        target = self._seller_targets.get(domain)
        company_name = self._company_names.setdefault(
            domain,
            target.seller_name
            if target is not None
            else self.explicit_seller_name or _company_name(enrichment.page_title, domain),
        )
        seller = seller_record_for_domain(
            domain,
            company_name=company_name,
            observed_at=observed_at,
            seller_id=target.seller_id if target else None,
        )
        source = source_record_for_page(
            enrichment,
            seller_id=seller.id,
            http_status=response.status,
            robots_status="obey",
        )
        contacts = contact_records_for_page(
            enrichment,
            seller_id=seller.id,
            source_id=source.id,
            contact_cipher=self._required_contact_cipher(),
            allowed_contact_types=set(self.contact_types),
        )
        yield from self._page_batches(seller, source, contacts, response.url, observed_at)

        depth = int(response.meta.get("crawl_depth", 0))
        if depth < self.max_depth:
            plan = build_official_site_crawl_plan(
                response.url,
                html=response.text,
                page_budget=self.page_budget,
            )
            self._append_candidates(domain, plan.urls, depth + 1)

        if depth == 0:
            sitemap_url = canonicalize_official_url("/sitemap.xml", base_url=response.url)
            if sitemap_url is not None:
                yield Request(
                    sitemap_url,
                    callback=self.parse_sitemap,
                    errback=self.handle_request_error,
                    dont_filter=True,
                    meta={
                        "source_domain": domain,
                        "sellerintel_allowed_domain": domain,
                    },
                )
                return

        yield from self._schedule_next(domain)

    def parse_sitemap(self, response: Response) -> Iterable[dict[str, object] | Request]:
        domain = str(response.meta["source_domain"])
        if domain in self._blocked_domains:
            return
        if is_blocked_response(_ResponseAdapter(response)):
            yield from self._record_domain_block(response, domain)
            return
        if 200 <= response.status < 300 and isinstance(response, TextResponse):
            plan = build_official_site_crawl_plan(
                self._seed_by_domain[domain],
                sitemap_text=response.text,
                page_budget=self.page_budget,
            )
            self._append_candidates(domain, plan.urls, 1)
        yield from self._schedule_next(domain)

    def handle_request_error(self, failure: object) -> Iterable[Request]:
        request = getattr(failure, "request", None)
        domain = _domain(request.url) if request is not None else ""
        self._inc_stat("sellerintel/error_count")
        if domain:
            yield from self._schedule_next(domain)

    def _append_candidates(self, domain: str, urls: Iterable[str], depth: int) -> None:
        for url in urls:
            if _domain(url) != domain or url in self._seen[domain]:
                continue
            self._seen[domain].add(url)
            self._queues[domain].append((url, depth))

    def _schedule_next(self, domain: str) -> Iterable[Request]:
        if domain in self._blocked_domains:
            return
        while self._queues[domain] and self._pages_scheduled[domain] < self.page_budget:
            url, depth = self._queues[domain].pop(0)
            self._pages_scheduled[domain] += 1
            yield self._page_request(url, depth=depth)
            return

    def _page_request(self, url: str, *, depth: int) -> Request:
        return Request(
            url,
            callback=self.parse_page,
            errback=self.handle_request_error,
            meta={
                "crawl_depth": depth,
                "observed_at": self._observed_at,
                "sellerintel_allowed_domain": _domain(url),
            },
        )

    def _page_batches(
        self,
        seller: SellerRecord,
        source: SourceRecord,
        contacts: list[ContactRecord],
        page_url: str,
        observed_at: str,
    ) -> Iterable[dict[str, object]]:
        chunks = [
            contacts[index : index + MAX_CONTACTS_PER_PAGE_BATCH]
            for index in range(0, len(contacts), MAX_CONTACTS_PER_PAGE_BATCH)
        ] or [[]]
        base_number = int(hashlib.sha256(page_url.encode()).hexdigest()[:7], 16) * 100
        for index, chunk in enumerate(chunks):
            batch = IngestionBatch(
                schema_version=1,
                parser_version="official-site-v1",
                crawl_run_id=self.crawl_run_id,
                batch_number=base_number + index,
                generated_at=observed_at,
                sellers=[seller],
                contacts=chunk,
                sources=[source],
                crawl_runs=[
                    CrawlRunRecord(
                        id=self.crawl_run_id,
                        job_type="official_website",
                        started_at=observed_at,
                        status="running",
                    )
                ],
            )
            yield dict(batch.as_payload())

    def _record_domain_block(
        self,
        response: Response,
        domain: str,
    ) -> Iterable[dict[str, object]]:
        self._blocked_domains.add(domain)
        self._queues[domain].clear()
        self._inc_stat("sellerintel/blocked_count")
        observed_at = str(
            response.meta.get("observed_at")
            or self.crawler.settings.get("SELLERINTEL_OBSERVED_AT")
            or datetime.now(UTC).isoformat().replace("+00:00", "Z")
        )
        observed = _parse_datetime(observed_at)
        cooldown_seconds = (
            retry_after_seconds(_ResponseAdapter(response), now=observed)
            if response.status == 429
            else 86_400
        )
        blocked_until = (observed + timedelta(seconds=cooldown_seconds)).isoformat().replace(
            "+00:00", "Z"
        )
        canonical_url = canonicalize_official_url(response.url) or response.url
        source = SourceRecord(
            id=deterministic_uuidv7("source-url", canonical_url),
            source_url=canonical_url,
            canonical_url=canonical_url,
            source_domain=domain,
            source_type="official_site",
            robots_status="obey",
            terms_risk="low",
            http_status=response.status,
            detected_at=observed_at,
            last_seen_at=observed_at,
            first_seen_at=observed_at,
            last_fetched_at=observed_at,
            next_allowed_at=blocked_until,
            schema_version=1,
            parser_version="official-site-v1",
            status="cooldown",
        )
        registry = SourceRegistryRecord(
            adapter_name=f"official_site:{domain}",
            source_family="official_site",
            enabled=True,
            risk_level="low",
            robots_policy="obey",
            terms_review_status="approved",
            daily_request_budget=self.page_budget,
            concurrency_per_domain=1,
            minimum_delay_seconds=2.5,
            blocked_until=blocked_until,
            parser_version="official-site-v1",
            last_failure_at=observed_at,
            operator_notes=f"HTTP {response.status} cooldown; crawler stopped for this domain.",
        )
        batch_number = int(hashlib.sha256(f"cooldown:{domain}".encode()).hexdigest()[:7], 16)
        batch = IngestionBatch(
            schema_version=1,
            parser_version="official-site-v1",
            crawl_run_id=self.crawl_run_id,
            batch_number=batch_number,
            generated_at=observed_at,
            sources=[source],
            source_registry=[registry],
            crawl_runs=[
                CrawlRunRecord(
                    id=self.crawl_run_id,
                    job_type="official_website",
                    started_at=observed_at,
                    status="paused_by_policy",
                    blocked_count=1,
                    notes=f"Domain cooldown persisted until {blocked_until}.",
                )
            ],
        )
        self.logger.warning(
            "Official-site adapter paused domain=%s status=%s blocked_until=%s",
            domain,
            response.status,
            blocked_until,
        )
        yield dict(batch.as_payload())

    def _required_contact_cipher(self) -> ContactCipher:
        if self._contact_cipher is None:
            raise RuntimeError("contact encryption was not initialized")
        return self._contact_cipher

    def _inc_stat(self, key: str) -> None:
        if self.crawler.stats is not None:
            self.crawler.stats.inc_value(key)


class _ResponseAdapter:
    def __init__(self, response: Response) -> None:
        self.url = response.url
        self.status = response.status
        self.text = response.text if isinstance(response, TextResponse) else ""
        self.headers: Mapping[str, str] = {
            str(key): str(value)
            for key, value in response.headers.to_unicode_dict().items()
        }


def _parse_seed_urls(value: str) -> tuple[str, ...]:
    seeds: list[str] = []
    for raw in value.replace("\n", ",").split(","):
        parsed = urlparse(raw.strip())
        if parsed.username or parsed.password:
            raise ValueError("Seed URLs cannot contain credentials")
        canonical = canonicalize_official_url(raw)
        if canonical is None:
            continue
        _assert_public_hostname(urlparse(canonical).hostname or "")
        if canonical not in seeds:
            seeds.append(canonical)
    if not seeds:
        raise ValueError("At least one explicit http or https seed URL is required")
    return tuple(seeds)


def _parse_contact_types(value: str) -> frozenset[str]:
    if not value.strip():
        return CONTACT_TYPES
    selected = frozenset(
        item.strip().lower() for item in value.replace("\n", ",").split(",") if item.strip()
    )
    if not selected or not selected.issubset(CONTACT_TYPES):
        raise ValueError("contact_types contains an unsupported contact type")
    return selected


def _parse_seller_targets(
    value: str,
    seed_urls: tuple[str, ...],
) -> dict[str, OfficialSellerTarget]:
    if not value.strip():
        return {}
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("seller_targets must be valid JSON") from error
    if not isinstance(decoded, list) or not 1 <= len(decoded) <= 20:
        raise ValueError("seller_targets must contain between 1 and 20 targets")

    approved_seeds = set(seed_urls)
    targets: dict[str, OfficialSellerTarget] = {}
    for item in decoded:
        if not isinstance(item, dict) or set(item) != {"seller_id", "seller_name", "seed_url"}:
            raise ValueError(
                "seller_targets entries must contain seller_id, seller_name, and seed_url"
            )
        seller_id = item.get("seller_id")
        seller_name = item.get("seller_name")
        raw_seed_url = item.get("seed_url")
        if not isinstance(seller_id, str) or re.fullmatch(UUIDV7_PATTERN, seller_id) is None:
            raise ValueError("seller_targets seller_id must be UUIDv7-compatible")
        if not isinstance(seller_name, str) or not 1 <= len(seller_name.strip()) <= 200:
            raise ValueError("seller_targets seller_name must be 1-200 characters")
        if not isinstance(raw_seed_url, str):
            raise ValueError("seller_targets seed_url must be a string")
        canonical_seed = canonicalize_official_url(raw_seed_url)
        if canonical_seed is None or canonical_seed not in approved_seeds:
            raise ValueError("seller_targets seed_url must exactly match an approved seed URL")
        domain = _domain(canonical_seed)
        if domain in targets:
            raise ValueError("seller_targets may link only one seller to each official domain")
        targets[domain] = OfficialSellerTarget(
            seller_id=seller_id,
            seller_name=seller_name.strip(),
            seed_url=canonical_seed,
        )
    return targets


def _setting_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _assert_public_hostname(hostname: str) -> None:
    normalized = hostname.strip("[]").casefold()
    if normalized == "localhost" or normalized.endswith(".local"):
        raise ValueError("Local and private seed hosts are forbidden")
    try:
        address = ip_address(normalized)
    except ValueError:
        return
    if not address.is_global:
        raise ValueError("Local and private seed hosts are forbidden")


def _domain(url: str) -> str:
    parsed = urlparse(url)
    domain = canonicalize_domain(parsed.hostname or "")
    if domain is None:
        raise ValueError("Seed URL must contain a canonical public domain")
    return domain


def _company_name(page_title: str, domain: str) -> str:
    for separator in (" | ", " - ", " – ", " — "):
        if separator in page_title:
            candidate = page_title.split(separator, 1)[0].strip()
            if candidate.casefold() not in {"home", "contact", "contact us"}:
                return candidate
    if page_title and page_title != "Untitled page":
        return page_title
    return domain.split(".", 1)[0].replace("-", " ").title()


def _bounded_int(value: str | int, *, name: str, minimum: int, maximum: int) -> int:
    parsed = int(value)
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def _parse_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("SELLERINTEL_OBSERVED_AT must be ISO-8601") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
