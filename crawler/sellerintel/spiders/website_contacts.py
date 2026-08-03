from __future__ import annotations

import hashlib
import os
from collections.abc import AsyncIterator, Iterable, Mapping
from ipaddress import ip_address
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import scrapy
from scrapy import Request
from scrapy.http import Response, TextResponse

from sellerintel.adapters.base import is_blocked_response
from sellerintel.adapters.official_site import (
    build_official_site_crawl_plan,
    canonicalize_official_url,
    contact_records_for_page,
    enrich_official_page,
    seller_record_for_domain,
    source_record_for_page,
)
from sellerintel.config.features import assert_startup_gates
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.schemas.ingestion import (
    ContactRecord,
    CrawlRunRecord,
    IngestionBatch,
    SellerRecord,
    SourceRecord,
)

MAX_CONTACTS_PER_PAGE_BATCH = 17


class OfficialWebsiteSpider(scrapy.Spider):
    name = "official_website"
    handle_httpstatus_all = True

    custom_settings = {
        "DOWNLOADER_MIDDLEWARES": {
            "sellerintel.middlewares.FixtureOfficialSiteMiddleware": 50,
        },
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
        self._seed_by_domain = {_domain(url): url for url in self.seed_urls}
        self.allowed_domains = sorted({_domain(url) for url in self.seed_urls})
        self._queues: dict[str, list[tuple[str, int]]] = {
            domain: [] for domain in self.allowed_domains
        }
        self._seen: dict[str, set[str]] = {domain: set() for domain in self.allowed_domains}
        self._pages_scheduled: dict[str, int] = {domain: 0 for domain in self.allowed_domains}
        self._blocked_domains: set[str] = set()
        self._company_names: dict[str, str] = {}

        runtime_config = assert_startup_gates()
        if not runtime_config.feature_flags.get("ENABLE_OFFICIAL_WEBSITE", False):
            raise ValueError("ENABLE_OFFICIAL_WEBSITE=true is required")
        if runtime_config.feature_flags.get("GLOBAL_CRAWL_KILL_SWITCH", False):
            raise ValueError("GLOBAL_CRAWL_KILL_SWITCH is active")

        if self.fixture_dir is None and not _env_bool("LIVE_CRAWL_ENABLED", False):
            raise ValueError("LIVE_CRAWL_ENABLED=true is required outside fixture mode")
        if self.fixture_dir is None and runtime_config.runner_mode not in {
            "fallback_local",
            "zyte_student_active",
        }:
            raise ValueError("Live official-site crawl requires an explicitly selected runner")
        if self.fixture_dir is not None and not self.fixture_dir.is_dir():
            raise ValueError("fixture_dir must be an existing directory")

    def start_requests(self) -> Iterable[Request]:
        return self._initial_requests()

    async def start(self) -> AsyncIterator[Request]:
        for request in self._initial_requests():
            yield request

    def _initial_requests(self) -> Iterable[Request]:
        for seed_url in self.seed_urls:
            domain = _domain(seed_url)
            self._seen[domain].add(seed_url)
            self._pages_scheduled[domain] = 1
            yield self._page_request(seed_url, depth=0)

    def parse_page(self, response: Response) -> Iterable[dict[str, object] | Request]:
        domain = _domain(response.url)
        if domain in self._blocked_domains:
            return

        if is_blocked_response(_ResponseAdapter(response)):
            self._blocked_domains.add(domain)
            self._queues[domain].clear()
            self._inc_stat("sellerintel/blocked_count")
            self.logger.warning(
                "Official-site adapter paused after an explicit block domain=%s",
                domain,
            )
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
        company_name = self._company_names.setdefault(
            domain,
            self.explicit_seller_name or _company_name(enrichment.page_title, domain),
        )
        seller = seller_record_for_domain(
            domain,
            company_name=company_name,
            observed_at=observed_at,
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
                    meta={"source_domain": domain},
                )
                return

        yield from self._schedule_next(domain)

    def parse_sitemap(self, response: Response) -> Iterable[Request]:
        domain = str(response.meta["source_domain"])
        if domain in self._blocked_domains:
            return
        if is_blocked_response(_ResponseAdapter(response)):
            self._blocked_domains.add(domain)
            self._queues[domain].clear()
            self._inc_stat("sellerintel/blocked_count")
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
                "observed_at": str(self.crawler.settings.get("SELLERINTEL_OBSERVED_AT")),
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


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.casefold() in {"1", "true", "yes", "on"}
