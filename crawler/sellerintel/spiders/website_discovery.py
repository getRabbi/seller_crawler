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
from sellerintel.adapters.official_site.discovery import (
    DISCOVERY_PARSER_VERSION,
    DomainVerification,
    verify_official_domain,
)
from sellerintel.adapters.official_site.enrichment import canonicalize_official_url
from sellerintel.adapters.official_site.records import (
    deterministic_uuidv7,
    seller_record_for_domain,
)
from sellerintel.clients.cooldown import CooldownClient, cooldown_endpoint_from_ingestion
from sellerintel.config.features import assert_startup_gates, load_runtime_config
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.schemas.ingestion import (
    UUIDV7_PATTERN,
    CrawlRunRecord,
    IngestionBatch,
    ReviewQueueRecord,
    SourceRecord,
    SourceRegistryRecord,
)

MAX_DISCOVERY_CANDIDATES = 25
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
    "ENABLE_OFFICIAL_WEBSITE",
    "GLOBAL_CRAWL_KILL_SWITCH",
    "INGESTION_ENDPOINT_URL",
    "INGESTION_HMAC_SECRET",
    "SOURCE_COOLDOWN_CHECK_URL",
)


@dataclass(frozen=True, slots=True)
class DomainCandidateTarget:
    seller_id: str
    seller_name: str
    seller_names: tuple[str, ...]
    seed_url: str
    candidate_basis: str

    @property
    def domain(self) -> str:
        return _domain(self.seed_url)


class OfficialDomainDiscoverySpider(scrapy.Spider):
    """Verify bounded, deterministic official-domain candidates without search scraping."""

    name = "official_domain_discovery"
    parser_version = DISCOVERY_PARSER_VERSION
    job_type = "official_domain_discovery"

    custom_settings = {
        "DOWNLOADER_MIDDLEWARES": {
            "sellerintel.middlewares.FixtureOfficialSiteMiddleware": 50,
            "sellerintel.middlewares.PublicNetworkGuardMiddleware": 950,
        },
        "DEPTH_LIMIT": 0,
        "DNS_RESOLVER": "sellerintel.security.dns.PublicCachingResolver",
        "HTTPERROR_ALLOW_ALL": True,
        "ROBOTSTXT_OBEY": True,
        "RETRY_TIMES": 0,
    }

    def __init__(
        self,
        *,
        candidate_targets: str,
        crawl_run_id: str,
        fixture_dir: str = "",
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        if re.fullmatch(UUIDV7_PATTERN, crawl_run_id) is None:
            raise ValueError("crawl_run_id must be UUIDv7-compatible")
        self.crawl_run_id = crawl_run_id
        self.fixture_dir = Path(fixture_dir).resolve() if fixture_dir else None
        if self.fixture_dir is not None and not self.fixture_dir.is_dir():
            raise ValueError("fixture_dir must be an existing directory")
        self.targets = _parse_candidate_targets(candidate_targets)
        self._targets_by_domain = {target.domain: target for target in self.targets}
        self.allowed_domains = sorted(self._targets_by_domain)
        self._cooldown_client: CooldownClient | None = None
        self._observed_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

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
        config = assert_startup_gates(load_runtime_config(runtime_values))
        if not config.feature_flags.get("ENABLE_OFFICIAL_WEBSITE", False):
            raise ValueError("ENABLE_OFFICIAL_WEBSITE=true is required")
        if config.feature_flags.get("GLOBAL_CRAWL_KILL_SWITCH", False):
            raise ValueError("GLOBAL_CRAWL_KILL_SWITCH is active")
        if self.fixture_dir is None and not config.live_crawl_enabled:
            raise ValueError("LIVE_CRAWL_ENABLED=true is required outside fixture mode")
        if self.fixture_dir is None and config.runner_mode not in {
            "fallback_local",
            "zyte_student_active",
        }:
            raise ValueError("Live domain discovery requires an explicitly selected runner")
        if self.fixture_dir is not None:
            return
        ingestion_endpoint = runtime_values.get("INGESTION_ENDPOINT_URL", "")
        cooldown_endpoint = runtime_values.get("SOURCE_COOLDOWN_CHECK_URL", "")
        self._cooldown_client = CooldownClient(
            endpoint_url=cooldown_endpoint
            or cooldown_endpoint_from_ingestion(ingestion_endpoint),
            hmac_secret=runtime_values.get("INGESTION_HMAC_SECRET", ""),
        )

    def start_requests(self) -> Iterable[Request]:
        return self._initial_requests()

    async def start(self) -> AsyncIterator[Request]:
        for request in self._initial_requests():
            yield request

    def _initial_requests(self) -> Iterable[Request]:
        for target in self.targets:
            if self._cooldown_client is not None:
                decision = self._cooldown_client.check(target.domain)
                if not decision.allowed:
                    self._inc_stat("sellerintel/blocked_count")
                    self.logger.warning(
                        "Domain candidate remains in cooldown domain=%s blocked_until=%s",
                        target.domain,
                        decision.blocked_until,
                    )
                    continue
            yield Request(
                target.seed_url,
                callback=self.parse_candidate,
                errback=self.handle_request_error,
                dont_filter=True,
                meta={
                    "candidate_domain": target.domain,
                    "observed_at": self._observed_at,
                    "sellerintel_allowed_domain": target.domain,
                },
            )

    def parse_candidate(self, response: Response) -> Iterable[dict[str, object]]:
        requested_domain = str(response.meta["candidate_domain"])
        target = self._targets_by_domain[requested_domain]
        observed_at = str(response.meta["observed_at"])
        if is_blocked_response(_ResponseAdapter(response)):
            yield self._blocked_batch(target, response, observed_at)
            return

        if (
            response.status < 200
            or response.status >= 300
            or not isinstance(response, TextResponse)
        ):
            self._inc_stat("sellerintel/error_count")
            yield self._result_batch(
                target,
                observed_at=observed_at,
                http_status=response.status,
                canonical_url=target.seed_url,
                page_title=None,
                content_hash=None,
                verification=None,
                result_status="unavailable",
            )
            return

        verification = verify_official_domain(
            response.text,
            seller_names=target.seller_names,
            candidate_url=target.seed_url,
        )
        canonical_url = canonicalize_official_url(response.url) or target.seed_url
        self._inc_stat("sellerintel/domain_candidates_checked")
        if verification.accepted:
            self._inc_stat("sellerintel/domains_verified")
        yield self._result_batch(
            target,
            observed_at=observed_at,
            http_status=response.status,
            canonical_url=canonical_url,
            page_title=verification.page_title,
            content_hash=hashlib.sha256(response.body).hexdigest(),
            verification=verification,
            result_status=verification.decision,
        )

    def handle_request_error(self, failure: object) -> Iterable[dict[str, object]]:
        request = getattr(failure, "request", None)
        if request is None:
            return
        domain = str(request.meta.get("candidate_domain", ""))
        target = self._targets_by_domain.get(domain)
        if target is None:
            return
        failure_text = str(getattr(failure, "value", failure)).casefold()
        robots_denied = "robots.txt" in failure_text or "forbidden by robots" in failure_text
        if not robots_denied:
            self._inc_stat("sellerintel/error_count")
        yield self._result_batch(
            target,
            observed_at=str(request.meta.get("observed_at", self._observed_at)),
            http_status=0,
            canonical_url=target.seed_url,
            page_title=None,
            content_hash=None,
            verification=None,
            result_status="robots_denied" if robots_denied else "unavailable",
        )

    def _result_batch(
        self,
        target: DomainCandidateTarget,
        *,
        observed_at: str,
        http_status: int,
        canonical_url: str,
        page_title: str | None,
        content_hash: str | None,
        verification: DomainVerification | None,
        result_status: str,
    ) -> dict[str, object]:
        source_id = deterministic_uuidv7(
            "official-domain-candidate",
            f"{target.seller_id}:{target.seed_url}",
        )
        evidence = (
            verification.compact_evidence(candidate_basis=target.candidate_basis)
            if verification is not None
            else json.dumps(
                {
                    "candidate_basis": target.candidate_basis,
                    "decision": result_status,
                    "score": 0,
                    "signals": [],
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        source = SourceRecord(
            id=source_id,
            seller_id=target.seller_id,
            source_url=canonical_url,
            canonical_url=canonical_url,
            source_domain=_domain(canonical_url),
            source_type="official_domain_discovery",
            robots_status="denied" if result_status == "robots_denied" else "obey",
            terms_risk="low",
            http_status=http_status,
            page_title=page_title,
            evidence_snippet=evidence,
            content_hash=content_hash,
            detected_at=observed_at,
            last_seen_at=observed_at,
            first_seen_at=observed_at,
            last_fetched_at=observed_at if http_status > 0 else None,
            last_success_at=observed_at if 200 <= http_status < 300 else None,
            schema_version=1,
            parser_version=DISCOVERY_PARSER_VERSION,
            status=result_status,
        )
        sellers = []
        review_items = []
        if verification is not None and verification.accepted:
            sellers.append(
                seller_record_for_domain(
                    target.domain,
                    company_name=target.seller_name,
                    observed_at=observed_at,
                    seller_id=target.seller_id,
                    identity_confidence=verification.score,
                    parser_version=DISCOVERY_PARSER_VERSION,
                )
            )
        elif verification is not None and verification.decision == "review":
            review_items.append(
                ReviewQueueRecord(
                    id=deterministic_uuidv7(
                        "official-domain-review",
                        f"{target.seller_id}:{target.domain}",
                    ),
                    review_type="official_domain_candidate",
                    entity_id=target.seller_id,
                    priority=1,
                    payload_json=evidence,
                    reason=(
                        "Domain candidate needs operator identity review before contact crawling."
                    ),
                    created_at=observed_at,
                )
            )
        batch_number = int(
            hashlib.sha256(f"domain:{target.seller_id}:{target.domain}".encode()).hexdigest()[:7],
            16,
        )
        return dict(
            IngestionBatch(
                schema_version=1,
                parser_version=DISCOVERY_PARSER_VERSION,
                crawl_run_id=self.crawl_run_id,
                batch_number=batch_number,
                generated_at=observed_at,
                sellers=sellers,
                sources=[source],
                review_queue_items=review_items,
                crawl_runs=[
                    CrawlRunRecord(
                        id=self.crawl_run_id,
                        job_type=self.job_type,
                        started_at=observed_at,
                        status="running",
                        candidates_found=1,
                        records_updated=1 if sellers else 0,
                    )
                ],
            ).as_payload()
        )

    def _blocked_batch(
        self,
        target: DomainCandidateTarget,
        response: Response,
        observed_at: str,
    ) -> dict[str, object]:
        self._inc_stat("sellerintel/blocked_count")
        observed = _parse_datetime(observed_at)
        cooldown_seconds = (
            retry_after_seconds(_ResponseAdapter(response), now=observed)
            if response.status == 429
            else 86_400
        )
        blocked_until = (observed + timedelta(seconds=cooldown_seconds)).isoformat().replace(
            "+00:00", "Z"
        )
        batch = self._result_batch(
            target,
            observed_at=observed_at,
            http_status=response.status,
            canonical_url=target.seed_url,
            page_title=None,
            content_hash=None,
            verification=None,
            result_status="cooldown",
        )
        batch["source_registry"] = [
            SourceRegistryRecord(
                adapter_name=f"official_domain_discovery:{target.domain}",
                source_family="official_site",
                enabled=True,
                risk_level="low",
                robots_policy="obey",
                terms_review_status="approved",
                daily_request_budget=1,
                concurrency_per_domain=1,
                minimum_delay_seconds=2.5,
                blocked_until=blocked_until,
                parser_version=DISCOVERY_PARSER_VERSION,
                last_failure_at=observed_at,
                operator_notes=f"HTTP {response.status} cooldown; candidate adapter stopped.",
            ).model_dump(mode="json", exclude_none=True)
        ]
        batch["crawl_runs"] = [
            CrawlRunRecord(
                id=self.crawl_run_id,
                job_type=self.job_type,
                started_at=observed_at,
                status="paused_by_policy",
                blocked_count=1,
                notes=f"Domain candidate cooldown persisted until {blocked_until}.",
            ).model_dump(mode="json", exclude_none=True)
        ]
        return batch

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


def _parse_candidate_targets(value: str) -> tuple[DomainCandidateTarget, ...]:
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("candidate_targets must be valid JSON") from error
    if not isinstance(decoded, list) or not 1 <= len(decoded) <= MAX_DISCOVERY_CANDIDATES:
        raise ValueError(
            f"candidate_targets must contain between 1 and {MAX_DISCOVERY_CANDIDATES} entries"
        )
    targets: list[DomainCandidateTarget] = []
    domains: set[str] = set()
    required = {"seller_id", "seller_name", "seller_names", "seed_url", "candidate_basis"}
    for item in decoded:
        if not isinstance(item, dict) or set(item) != required:
            raise ValueError("candidate_targets entry fields are invalid")
        seller_id = item.get("seller_id")
        seller_name = item.get("seller_name")
        seller_names = item.get("seller_names")
        raw_url = item.get("seed_url")
        basis = item.get("candidate_basis")
        if not isinstance(seller_id, str) or re.fullmatch(UUIDV7_PATTERN, seller_id) is None:
            raise ValueError("candidate target seller_id must be UUIDv7-compatible")
        if not isinstance(seller_name, str) or not 1 <= len(seller_name.strip()) <= 200:
            raise ValueError("candidate target seller_name must be 1-200 characters")
        if (
            not isinstance(seller_names, list)
            or not 1 <= len(seller_names) <= 6
            or any(
                not isinstance(name, str) or not 1 <= len(name.strip()) <= 200
                for name in seller_names
            )
        ):
            raise ValueError("candidate target seller_names must contain 1-6 identities")
        if not isinstance(raw_url, str) or not isinstance(basis, str) or not basis.strip():
            raise ValueError("candidate target URL and basis are required")
        parsed = urlparse(raw_url)
        canonical = canonicalize_official_url(raw_url)
        if (
            canonical is None
            or parsed.scheme.casefold() != "https"
            or parsed.username
            or parsed.password
            or parsed.port
            or parsed.query
            or parsed.fragment
            or urlparse(canonical).path != "/"
        ):
            raise ValueError("candidate target must be a credential-free HTTPS origin")
        domain = _domain(canonical)
        _assert_public_hostname(domain)
        if domain in domains:
            raise ValueError("candidate target domains must be unique within a job")
        domains.add(domain)
        targets.append(
            DomainCandidateTarget(
                seller_id=seller_id,
                seller_name=seller_name.strip(),
                seller_names=tuple(dict.fromkeys(name.strip() for name in seller_names)),
                seed_url=canonical,
                candidate_basis=basis.strip()[:80],
            )
        )
    return tuple(targets)


def _assert_public_hostname(hostname: str) -> None:
    normalized = hostname.strip("[]").casefold()
    if normalized == "localhost" or normalized.endswith((".local", ".internal")):
        raise ValueError("Local and private candidate hosts are forbidden")
    try:
        address = ip_address(normalized)
    except ValueError:
        return
    if not address.is_global:
        raise ValueError("Local and private candidate hosts are forbidden")


def _domain(url: str) -> str:
    domain = canonicalize_domain(urlparse(url).hostname or "")
    if domain is None:
        raise ValueError("Candidate URL must contain a canonical public domain")
    return domain


def _setting_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _parse_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("SELLERINTEL_OBSERVED_AT must be ISO-8601") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
