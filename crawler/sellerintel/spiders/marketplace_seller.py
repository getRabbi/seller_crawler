from __future__ import annotations

import hashlib
import json
import os
from collections.abc import AsyncIterator, Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any, Self, cast

import scrapy
from scrapy import Request
from scrapy.crawler import Crawler
from scrapy.http import Response, TextResponse
from scrapy.settings import BaseSettings

from sellerintel.adapters.amazon import (
    AMAZON_PARSER_VERSION,
    AmazonProductIdentity,
    AmazonSourceAdapter,
    build_search_url,
    marketplace_for,
    parse_product_page,
    parse_search_page,
    parse_seller_page,
)
from sellerintel.adapters.amazon.records import (
    amazon_source_record,
    marketplace_account_for_identity,
    marketplace_account_for_product,
    product_link_record,
    seller_alias_record,
    seller_record_for_identity,
    seller_record_for_product,
)
from sellerintel.adapters.base import is_blocked_response, retry_after_seconds
from sellerintel.clients.cooldown import CooldownClient, cooldown_endpoint_from_ingestion
from sellerintel.config.features import assert_startup_gates, load_runtime_config
from sellerintel.normalization.text import normalize_search_text
from sellerintel.schemas.ingestion import (
    CrawlRunRecord,
    IngestionBatch,
    SourceRegistryRecord,
)
from sellerintel.spool.checksums import sha256_hex

MAX_KEYWORDS = 5
MAX_AMAZON_RESULT_PAGES = 3
MAX_TARGET_SELLERS = 100
MAX_PRODUCTS_PER_SEARCH_PAGE = 24
AMAZON_BLOCK_COOLDOWN_SECONDS = 604_800
AMAZON_RUNTIME_SETTING_KEYS = (
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
    "ENABLE_SEARCH_DISCOVERY",
    "GLOBAL_CRAWL_KILL_SWITCH",
    "INGESTION_ENDPOINT_URL",
    "INGESTION_HMAC_SECRET",
    "SOURCE_COOLDOWN_CHECK_URL",
)


class AmazonDiscoverySpider(scrapy.Spider):
    name = "amazon_discovery"
    job_type = "amazon_discovery"
    parser_version = AMAZON_PARSER_VERSION
    completion_batch_number = 2_147_483_645
    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "COOKIES_ENABLED": False,
        "CONCURRENT_REQUESTS": 2,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "DOWNLOAD_DELAY": 8.0,
        "HTTPERROR_ALLOW_ALL": True,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 8.0,
        "AUTOTHROTTLE_MAX_DELAY": 60.0,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 0.25,
        "RETRY_TIMES": 1,
        "RETRY_HTTP_CODES": [408, 500, 502, 503, 504, 522, 524],
        "DOWNLOAD_TIMEOUT": 30,
    }

    def __init__(
        self,
        *,
        keywords: str,
        marketplace: str,
        crawl_run_id: str,
        target_sellers: str | int = 10,
        max_result_pages: str | int = 1,
        country_codes: str = "",
        category: str = "",
        brand_keyword: str = "",
        seller_name_keyword: str = "",
        require_public_location: str | bool = False,
        require_official_website: str | bool = False,
        manufacturer_likelihood: str = "any",
        trader_likelihood: str = "any",
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.crawl_run_id = crawl_run_id
        self.keywords = _parse_keywords(keywords)
        self.marketplace = marketplace_for(marketplace)
        self.target_sellers = _bounded_int(
            target_sellers,
            "target_sellers",
            minimum=1,
            maximum=MAX_TARGET_SELLERS,
        )
        self.max_result_pages = _bounded_int(
            max_result_pages,
            "max_result_pages",
            minimum=1,
            maximum=MAX_AMAZON_RESULT_PAGES,
        )
        self.country_codes = _parse_country_codes(country_codes)
        self.category = normalize_search_text(category)
        self.brand_keyword = normalize_search_text(brand_keyword)
        self.seller_name_keyword = normalize_search_text(seller_name_keyword)
        self.require_public_location = _bool_value(require_public_location)
        self.require_official_website = _bool_value(require_official_website)
        self.manufacturer_likelihood = _likelihood(manufacturer_likelihood)
        self.trader_likelihood = _likelihood(trader_likelihood)
        self.allowed_domains = [self.marketplace.domain]
        self._adapter = AmazonSourceAdapter()
        self._seen_products: set[str] = set()
        self._seen_merchants: set[str] = set()
        self._accepted_merchants: set[str] = set()
        self._blocked = False
        self._cooldown_client: CooldownClient | None = None

    @classmethod
    def from_crawler(cls, crawler: Crawler, *args: Any, **kwargs: Any) -> Self:
        spider = super().from_crawler(crawler, *args, **kwargs)
        spider._validate_runtime(crawler.settings)
        return spider

    def _validate_runtime(self, settings: BaseSettings) -> None:
        values = dict(os.environ)
        for key in AMAZON_RUNTIME_SETTING_KEYS:
            value = settings.get(key)
            if value is not None:
                values[key] = _setting_value(value)
        config = assert_startup_gates(load_runtime_config(values))
        if not config.feature_flags.get("ENABLE_AMAZON", False):
            raise ValueError("ENABLE_AMAZON=true is required")
        if config.feature_flags.get("GLOBAL_CRAWL_KILL_SWITCH", False):
            raise ValueError("GLOBAL_CRAWL_KILL_SWITCH is active")
        if not config.live_crawl_enabled:
            raise ValueError("LIVE_CRAWL_ENABLED=true is required")
        if config.runner_mode != "zyte_student_active":
            raise ValueError("Amazon discovery requires the selected Zyte Student runner")
        endpoint = values.get("INGESTION_ENDPOINT_URL", "")
        cooldown_endpoint = values.get(
            "SOURCE_COOLDOWN_CHECK_URL",
            "",
        ) or cooldown_endpoint_from_ingestion(endpoint)
        self._cooldown_client = CooldownClient(
            endpoint_url=cooldown_endpoint,
            hmac_secret=values.get("INGESTION_HMAC_SECRET", ""),
        )

    def start_requests(self) -> Iterable[Request]:
        return self._initial_requests()

    async def start(self) -> AsyncIterator[Request]:
        for request in self._initial_requests():
            yield request

    def _initial_requests(self) -> Iterable[Request]:
        if self._cooldown_client is not None:
            decision = self._cooldown_client.check(self.marketplace.code)
            if not decision.allowed:
                self._blocked = True
                self._inc_stat("sellerintel/blocked_count")
                self.logger.warning(
                    "Amazon marketplace remains in cooldown marketplace=%s blocked_until=%s",
                    self.marketplace.code,
                    decision.blocked_until,
                )
                return
        for query in self.keywords:
            yield self._search_request(query, page=1)

    def parse_search(self, response: Response) -> Iterable[dict[str, object] | Request]:
        if self._blocked:
            return
        if is_blocked_response(_ResponseAdapter(response)):
            yield self._block_batch(response, source_type="amazon_search")
            return
        if not _successful_text(response):
            self._inc_stat("sellerintel/error_count")
            return
        query = str(response.meta["query"])
        page = int(response.meta["result_page"])
        products = parse_search_page(response.text, response.url, self.marketplace.code)
        if not products:
            self._inc_stat("sellerintel/parser_empty_count")
        remaining_target = max(0, self.target_sellers - len(self._accepted_merchants))
        for product in products[: min(MAX_PRODUCTS_PER_SEARCH_PAGE, remaining_target)]:
            if product.asin in self._seen_products or self._target_reached():
                continue
            self._seen_products.add(product.asin)
            yield Request(
                product.product_url,
                callback=self.parse_product,
                errback=self.handle_request_error,
                meta={"query": query, "search_url": response.url},
            )
        if page < self.max_result_pages and not self._target_reached():
            yield self._search_request(query, page=page + 1)

    def parse_product(self, response: Response) -> Iterable[dict[str, object] | Request]:
        if self._blocked:
            return
        if is_blocked_response(_ResponseAdapter(response)):
            yield self._block_batch(response, source_type="amazon_product")
            return
        if not _successful_text(response):
            self._inc_stat("sellerintel/error_count")
            return
        try:
            product = parse_product_page(response.text, response.url, self.marketplace.code)
        except ValueError:
            self._inc_stat("sellerintel/parser_empty_count")
            return
        if not self._product_filters_match(product) or not product.seller_profile_url:
            return
        merchant_key = product.merchant_token or product.seller_profile_url
        if merchant_key in self._seen_merchants or self._target_reached():
            return
        self._seen_merchants.add(merchant_key)
        observed_at = self._observed_at(response)
        if not self._requires_seller_evidence():
            yield self._product_batch(product, response, observed_at)
            self._accepted_merchants.add(merchant_key)
            self._inc_stat("sellerintel/sellers_found")
        yield Request(
            product.seller_profile_url,
            callback=self.parse_seller,
            errback=self.handle_request_error,
            meta={
                "product": _product_payload(product),
                "query": str(response.meta.get("query", "")),
                "observed_at": observed_at,
                "product_content_hash": sha256_hex(response.text.encode()),
            },
        )

    def parse_seller(self, response: Response) -> Iterable[dict[str, object]]:
        if self._blocked:
            return
        if is_blocked_response(_ResponseAdapter(response)):
            yield self._block_batch(response, source_type="amazon_seller")
            return
        if not _successful_text(response):
            self._inc_stat("sellerintel/error_count")
            return
        product = _product_from_payload(cast(Mapping[str, object], response.meta["product"]))
        seller = parse_seller_page(response.text, response.url, self.marketplace.code)
        if not self._seller_filters_match(seller):
            return
        if not any(
            (
                seller.display_name,
                seller.business_name,
                seller.storefront_url,
                seller.public_location,
                seller.official_website_url,
            )
        ):
            self._inc_stat("sellerintel/parser_empty_count")
            return
        observed_at = self._observed_at(response)
        if self._requires_seller_evidence():
            yield self._product_batch(
                product,
                response,
                observed_at,
                content_hash_override=str(response.meta.get("product_content_hash", "")) or None,
            )
        seller_record = seller_record_for_identity(seller, observed_at=observed_at)
        source = amazon_source_record(
            url=response.url,
            seller_id=seller_record.id,
            source_type="amazon_seller",
            http_status=response.status,
            page_title=seller.display_name,
            evidence_snippet=_seller_evidence(seller),
            html=response.text,
            observed_at=observed_at,
        )
        aliases = []
        if (
            seller.display_name
            and normalize_search_text(seller.display_name) != seller_record.normalized_name
        ):
            aliases.append(
                seller_alias_record(
                    seller.display_name,
                    seller_id=seller_record.id,
                    source_id=source.id,
                    observed_at=observed_at,
                )
            )
        batch_number = _batch_number(f"seller:{seller.profile_url}")
        batch = IngestionBatch(
            schema_version=1,
            parser_version=AMAZON_PARSER_VERSION,
            crawl_run_id=self.crawl_run_id,
            batch_number=batch_number,
            generated_at=observed_at,
            sellers=[seller_record],
            marketplace_accounts=[
                marketplace_account_for_identity(
                    seller,
                    seller_id=seller_record.id,
                    observed_at=observed_at,
                )
            ],
            seller_aliases=aliases,
            sources=[source],
            crawl_runs=[self._running_record(observed_at)],
        )
        merchant_key = seller.merchant_token or seller.profile_url
        if merchant_key not in self._accepted_merchants:
            self._accepted_merchants.add(merchant_key)
            self._inc_stat("sellerintel/sellers_found")
        if seller.official_website_url:
            self._inc_stat("sellerintel/official_domains_found")
        yield dict(batch.as_payload())

    def handle_request_error(self, failure: object) -> None:
        _ = failure
        self._inc_stat("sellerintel/error_count")

    def _product_batch(
        self,
        product: AmazonProductIdentity,
        response: Response,
        observed_at: str,
        *,
        content_hash_override: str | None = None,
    ) -> dict[str, object]:
        seller = seller_record_for_product(product, observed_at=observed_at)
        source_url = product.product_url
        source = amazon_source_record(
            url=source_url,
            seller_id=seller.id,
            source_type="amazon_product",
            http_status=200,
            page_title=product.title,
            evidence_snippet=_product_evidence(product, str(response.meta.get("query", ""))),
            html=response.text,
            content_hash_override=content_hash_override,
            observed_at=observed_at,
        )
        batch = IngestionBatch(
            schema_version=1,
            parser_version=AMAZON_PARSER_VERSION,
            crawl_run_id=self.crawl_run_id,
            batch_number=_batch_number(f"product:{product.marketplace}:{product.asin}"),
            generated_at=observed_at,
            sellers=[seller],
            marketplace_accounts=[
                marketplace_account_for_product(
                    product,
                    seller_id=seller.id,
                    observed_at=observed_at,
                )
            ],
            product_links=[
                product_link_record(
                    product,
                    seller_id=seller.id,
                    source_id=source.id,
                    observed_at=observed_at,
                )
            ],
            sources=[source],
            crawl_runs=[self._running_record(observed_at)],
        )
        return dict(batch.as_payload())

    def _block_batch(self, response: Response, *, source_type: str) -> dict[str, object]:
        self._blocked = True
        self._inc_stat("sellerintel/blocked_count")
        observed_at = self._observed_at(response)
        observed = _parse_datetime(observed_at)
        cooldown_seconds = (
            retry_after_seconds(_ResponseAdapter(response), now=observed)
            if response.status == 429
            else AMAZON_BLOCK_COOLDOWN_SECONDS
        )
        blocked_until = (observed + timedelta(seconds=cooldown_seconds)).isoformat().replace(
            "+00:00", "Z"
        )
        source = amazon_source_record(
            url=response.url,
            seller_id=None,
            source_type=source_type,
            http_status=response.status,
            page_title=None,
            evidence_snippet=(
                f"Amazon public source stopped after HTTP {response.status} or block marker."
            ),
            html="",
            observed_at=observed_at,
            status="cooldown",
            next_allowed_at=blocked_until,
        )
        registry = SourceRegistryRecord(
            adapter_name=f"amazon:{self.marketplace.code}",
            source_family="marketplace",
            enabled=True,
            risk_level="high",
            robots_policy="obey",
            terms_review_status="approved",
            daily_request_budget=self.max_result_pages,
            concurrency_per_domain=1,
            minimum_delay_seconds=8.0,
            blocked_until=blocked_until,
            parser_version=AMAZON_PARSER_VERSION,
            last_failure_at=observed_at,
            operator_notes=(
                f"Source stopped cleanly after HTTP {response.status} or public block marker."
            ),
        )
        if self.crawler.engine:
            self.crawler.engine.close_spider(self, reason="amazon_source_blocked")
        return dict(
            IngestionBatch(
                schema_version=1,
                parser_version=AMAZON_PARSER_VERSION,
                crawl_run_id=self.crawl_run_id,
                batch_number=_batch_number(f"cooldown:{self.marketplace.code}"),
                generated_at=observed_at,
                sources=[source],
                source_registry=[registry],
                crawl_runs=[
                    CrawlRunRecord(
                        id=self.crawl_run_id,
                        job_type=self.job_type,
                        started_at=observed_at,
                        status="paused_by_policy",
                        blocked_count=1,
                        notes=f"Amazon marketplace cooldown persisted until {blocked_until}.",
                    )
                ],
            ).as_payload()
        )

    def _search_request(self, query: str, *, page: int) -> Request:
        return Request(
            build_search_url(self.marketplace.code, query, page=page),
            callback=self.parse_search,
            errback=self.handle_request_error,
            meta={"query": query, "result_page": page},
        )

    def _product_filters_match(self, product: AmazonProductIdentity) -> bool:
        product_category = normalize_search_text(product.category or product.title or "")
        if self.category and self.category not in product_category:
            return False
        if self.brand_keyword and self.brand_keyword not in normalize_search_text(
            product.brand or ""
        ):
            return False
        seller_name = normalize_search_text(product.seller_display_name or "")
        return not self.seller_name_keyword or self.seller_name_keyword in seller_name

    def _seller_filters_match(self, seller: object) -> bool:
        identity = cast(Any, seller)
        if self.country_codes and identity.country_code not in self.country_codes:
            return False
        if self.require_public_location and not identity.public_location:
            return False
        if self.require_official_website and not identity.official_website_url:
            return False
        if self.seller_name_keyword:
            names = normalize_search_text(
                f"{identity.display_name or ''} {identity.business_name or ''}"
            )
            if self.seller_name_keyword not in names:
                return False
        if self.manufacturer_likelihood == "likely" and identity.manufacturer_score < 30:
            return False
        return not (
            self.trader_likelihood == "likely" and identity.trader_score < 30
        )

    def _requires_seller_evidence(self) -> bool:
        return bool(
            self.country_codes
            or self.require_public_location
            or self.require_official_website
            or self.manufacturer_likelihood == "likely"
            or self.trader_likelihood == "likely"
        )

    def _target_reached(self) -> bool:
        return len(self._accepted_merchants) >= self.target_sellers

    def _running_record(self, observed_at: str) -> CrawlRunRecord:
        return CrawlRunRecord(
            id=self.crawl_run_id,
            job_type=self.job_type,
            started_at=observed_at,
            status="running",
            candidates_found=len(self._accepted_merchants),
            notes=(
                f"Amazon public identity discovery marketplace={self.marketplace.code} "
                f"query_count={len(self.keywords)} target={self.target_sellers}"
            ),
        )

    def _observed_at(self, response: Response) -> str:
        value = response.meta.get("observed_at") or self.crawler.settings.get(
            "SELLERINTEL_OBSERVED_AT"
        )
        return str(value or datetime.now(UTC).isoformat().replace("+00:00", "Z"))

    def _inc_stat(self, key: str) -> None:
        if self.crawler.stats is not None:
            self.crawler.stats.inc_value(key)


class _ResponseAdapter:
    def __init__(self, response: Response) -> None:
        self.url = response.url
        self.status = response.status
        self.text = response.text if isinstance(response, TextResponse) else ""
        self.headers: Mapping[str, str] = {
            str(key): str(value) for key, value in response.headers.to_unicode_dict().items()
        }


def _parse_keywords(value: str) -> tuple[str, ...]:
    raw_values: list[str]
    try:
        decoded = json.loads(value)
        raw_values = decoded if isinstance(decoded, list) else [value]
    except json.JSONDecodeError:
        raw_values = value.replace("\n", ",").split(",")
    keywords: list[str] = []
    for raw in raw_values:
        if not isinstance(raw, str):
            raise ValueError("keywords must contain strings")
        cleaned = " ".join(raw.split())
        if not 2 <= len(cleaned) <= 100:
            raise ValueError("each keyword must contain 2 to 100 characters")
        if cleaned not in keywords:
            keywords.append(cleaned)
    if not 1 <= len(keywords) <= MAX_KEYWORDS:
        raise ValueError(f"keywords must contain 1 to {MAX_KEYWORDS} unique queries")
    return tuple(keywords)


def _parse_country_codes(value: str) -> frozenset[str]:
    codes = {item.strip().upper() for item in value.replace("\n", ",").split(",") if item.strip()}
    if any(len(code) != 2 or not code.isalpha() for code in codes):
        raise ValueError("country_codes must contain ISO alpha-2 values")
    return frozenset(codes)


def _bool_value(value: str | bool) -> bool:
    return value if isinstance(value, bool) else value.casefold() in {"1", "true", "yes", "on"}


def _likelihood(value: str) -> str:
    normalized = value.strip().casefold() or "any"
    if normalized not in {"any", "likely"}:
        raise ValueError("likelihood filters must be any or likely")
    return normalized


def _bounded_int(value: str | int, name: str, *, minimum: int, maximum: int) -> int:
    parsed = int(value)
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def _successful_text(response: Response) -> bool:
    return 200 <= response.status < 300 and isinstance(response, TextResponse)


def _setting_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _batch_number(value: str) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:7], 16)


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _product_payload(product: AmazonProductIdentity) -> dict[str, object]:
    return {
        "marketplace": product.marketplace,
        "asin": product.asin,
        "product_url": product.product_url,
        "title": product.title,
        "brand": product.brand,
        "seller_display_name": product.seller_display_name,
        "merchant_token": product.merchant_token,
        "seller_profile_url": product.seller_profile_url,
        "category": product.category,
    }


def _product_from_payload(payload: Mapping[str, object]) -> AmazonProductIdentity:
    return AmazonProductIdentity(
        marketplace=str(payload["marketplace"]),
        asin=str(payload["asin"]),
        product_url=str(payload["product_url"]),
        title=_optional_string(payload.get("title")),
        brand=_optional_string(payload.get("brand")),
        seller_display_name=_optional_string(payload.get("seller_display_name")),
        merchant_token=_optional_string(payload.get("merchant_token")),
        seller_profile_url=_optional_string(payload.get("seller_profile_url")),
        category=_optional_string(payload.get("category")),
    )


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _product_evidence(product: AmazonProductIdentity, query: str) -> str:
    fields = [
        f"query={query[:100]}",
        f"marketplace={product.marketplace}",
        f"asin={product.asin}",
        f"title={(product.title or '')[:180]}",
        f"brand={(product.brand or '')[:100]}",
        f"seller={(product.seller_display_name or '')[:120]}",
    ]
    return " | ".join(fields)


def _seller_evidence(seller: object) -> str:
    identity = cast(Any, seller)
    return " | ".join(
        (
            f"marketplace={identity.marketplace}",
            f"merchant_token={'present' if identity.merchant_token else 'missing'}",
            f"display_name={(identity.display_name or '')[:120]}",
            f"business_name={(identity.business_name or '')[:160]}",
            f"country={identity.country_code or 'unknown'}",
            f"public_location={'present' if identity.public_location else 'missing'}",
            f"official_website={'present' if identity.official_website_url else 'missing'}",
        )
    )
