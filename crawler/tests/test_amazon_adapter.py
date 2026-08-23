from __future__ import annotations

import json
from pathlib import Path

from scrapy.crawler import Crawler
from scrapy.http import HtmlResponse, Request
from scrapy.settings import Settings
from scrapy.statscollectors import MemoryStatsCollector
from sellerintel.adapters.amazon import (
    AmazonProductIdentity,
    AmazonSourceAdapter,
    build_search_url,
    parse_product_page,
    parse_search_page,
    parse_seller_page,
)
from sellerintel.spiders.marketplace_seller import AmazonDiscoverySpider

FIXTURES = Path(__file__).parent / "fixtures" / "amazon"
RUN_ID = "018f2d5e-7b3c-7a1d-8f2e-523456789abc"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_search_parser_emits_bounded_canonical_product_identity() -> None:
    products = parse_search_page(
        fixture("search.html"),
        "https://www.amazon.com/s?k=fixture",
        "amazon.com",
    )

    assert len(products) == 1
    assert products[0].marketplace == "amazon.com"
    assert products[0].asin == "B012345678"
    assert products[0].product_url == "https://www.amazon.com/dp/B012345678"
    assert products[0].title == "Stainless Steel Fixture Bottle"


def test_product_parser_preserves_product_to_seller_relationship() -> None:
    product = parse_product_page(
        fixture("product.html"),
        "https://www.amazon.com/dp/B012345678",
        "amazon.com",
    )

    assert product.asin == "B012345678"
    assert product.title == "Stainless Steel Fixture Bottle"
    assert product.brand == "FixtureBrand"
    assert product.category == "Pet Supplies"
    assert product.seller_display_name == "Fixture Store"
    assert product.merchant_token == "A1FIXTURE123"
    assert product.seller_profile_url == "https://www.amazon.com/sp?seller=A1FIXTURE123"


def test_seller_parser_uses_public_business_evidence_without_marketplace_country_guess() -> None:
    seller = parse_seller_page(
        fixture("seller.html"),
        "https://www.amazon.com/sp?seller=A1FIXTURE123",
        "amazon.com",
    )

    assert seller.merchant_token == "A1FIXTURE123"
    assert seller.display_name == "Fixture Store"
    assert seller.business_name == "Fixture Manufacturing Limited"
    assert seller.country_code == "BD"
    assert seller.public_location == "Dhaka Bangladesh"
    assert seller.storefront_url == "https://www.amazon.com/stores/FixtureBrand"
    assert seller.official_website_url == "https://fixture-manufacturing.example/"
    assert seller.manufacturer_score >= 30
    assert seller.trader_score == 0


def test_amazon_parsers_fail_safe_for_json_shaped_success_bodies() -> None:
    assert (
        parse_search_page(
            '{"status":"unavailable"}',
            "https://www.amazon.com/s?k=fixture",
            "amazon.com",
        )
        == ()
    )

    seller = parse_seller_page(
        '{"status":"unavailable"}',
        "https://www.amazon.com/sp?seller=A1FIXTURE123",
        "amazon.com",
    )
    assert seller.merchant_token == "A1FIXTURE123"
    assert seller.display_name is None
    assert seller.business_name is None
    assert seller.official_website_url is None


def test_adapter_restricts_hosts_and_never_parses_contacts() -> None:
    adapter = AmazonSourceAdapter()
    assert adapter.is_allowed("https://www.amazon.co.uk/sp?seller=A1FIXTURE123") is True
    assert adapter.is_allowed("https://example.com/sp?seller=A1FIXTURE123") is False
    response = html_response(
        "https://www.amazon.com/sp?seller=A1FIXTURE123",
        fixture("seller.html"),
    )
    assert adapter.parse_contacts(response) == []


def test_search_url_and_marketplace_page_limits_are_validated() -> None:
    assert build_search_url("amazon.de", "private label clothing", page=2) == (
        "https://www.amazon.de/s?k=private+label+clothing&page=2"
    )


def test_spider_emits_persistable_marketplace_product_and_seller_batches() -> None:
    spider = configured_spider(country_codes="BD")
    search_response = html_response(
        "https://www.amazon.com/s?k=stainless+steel+bottle",
        fixture("search.html"),
        meta={"query": "stainless steel bottle", "result_page": 1},
    )
    product_request = next(
        item for item in spider.parse_search(search_response) if isinstance(item, Request)
    )
    product_response = html_response(
        product_request.url,
        fixture("product.html"),
        meta={"query": "stainless steel bottle"},
    )
    seller_request = next(
        item for item in spider.parse_product(product_response) if isinstance(item, Request)
    )
    seller_response = html_response(
        seller_request.url,
        fixture("seller.html"),
        meta=seller_request.meta,
    )

    batches = list(spider.parse_seller(seller_response))

    assert len(batches) == 2
    product_batch = batches[0]
    seller_batch = batches[1]
    assert product_batch["product_links"][0]["product_name"] == "Stainless Steel Fixture Bottle"  # type: ignore[index]
    assert product_batch["marketplace_accounts"][0]["merchant_token"] == "A1FIXTURE123"  # type: ignore[index]
    assert seller_batch["sellers"][0]["country_code"] == "BD"  # type: ignore[index]
    assert seller_batch["sellers"][0]["official_domain"] == "fixture-manufacturing.example"  # type: ignore[index]
    assert seller_batch["sources"][0]["source_type"] == "amazon_seller"  # type: ignore[index]


def test_product_identity_counts_toward_target_and_json_seller_body_is_not_evidence() -> None:
    spider = configured_spider(target_sellers="1")
    product = parse_product_page(
        fixture("product.html"),
        "https://www.amazon.com/dp/B012345678",
        "amazon.com",
    )
    product_response = html_response(
        product.product_url,
        fixture("product.html"),
        meta={"query": "stainless steel bottle"},
    )

    product_outputs = list(spider.parse_product(product_response))
    assert len(product_outputs) == 2
    assert spider._target_reached() is True

    seller_request = next(item for item in product_outputs if isinstance(item, Request))
    seller_response = html_response(
        seller_request.url,
        '{"status":"unavailable"}',
        meta=seller_request.meta,
    )

    assert list(spider.parse_seller(seller_response)) == []
    assert spider.crawler.stats is not None
    assert spider.crawler.stats.get_value("sellerintel/parser_empty_count") == 1


def test_country_filter_uses_public_seller_evidence_and_rejects_non_matching_seller() -> None:
    spider = configured_spider(country_codes="US")
    product = parse_product_page(
        fixture("product.html"),
        "https://www.amazon.com/dp/B012345678",
        "amazon.com",
    )
    response = html_response(
        product.seller_profile_url or "",
        fixture("seller.html"),
        meta={"product": product_payload(product), "query": "fixture"},
    )

    assert list(spider.parse_seller(response)) == []


def test_429_stops_amazon_adapter_and_persists_retry_after_cooldown() -> None:
    spider = configured_spider()
    response = html_response(
        "https://www.amazon.com/s?k=fixture",
        fixture("blocked.html"),
        status=429,
        headers={"Retry-After": "120"},
        meta={"query": "fixture", "result_page": 1, "observed_at": "2026-08-17T00:00:00Z"},
    )

    batches = list(spider.parse_search(response))

    assert len(batches) == 1
    source = batches[0]["sources"][0]  # type: ignore[index]
    run = batches[0]["crawl_runs"][0]  # type: ignore[index]
    assert source["status"] == "cooldown"
    assert source["next_allowed_at"] == "2026-08-17T00:02:00Z"
    assert run["status"] == "paused_by_policy"
    assert spider._blocked is True


def configured_spider(**kwargs: str) -> AmazonDiscoverySpider:
    settings = Settings(
        {
            "SELLERINTEL_OBSERVED_AT": "2026-08-17T00:00:00Z",
            "RUNNER_MODE": "zyte_student_active",
            "LIVE_CRAWL_ENABLED": True,
            "PAID_SERVICES_ALLOWED": False,
            "MAX_EXTERNAL_MONTHLY_SPEND_AUD": 0,
            "ALLOW_EXTRA_SCRAPY_UNITS": False,
            "ALLOW_PAID_GITHUB_ACTIONS_MINUTES": False,
            "ALLOW_PAID_ADDONS": False,
            "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED": True,
            "SCRAPY_CLOUD_DEPLOY_ENABLED": True,
            "SCRAPY_CLOUD_MAX_UNITS": 1,
            "ZYTE_API_ENABLED": False,
            "ZYTE_API_DAILY_REQUEST_BUDGET": 0,
            "ZYTE_API_MONTHLY_BUDGET_USD": 0,
            "ENABLE_AMAZON": True,
            "ENABLE_OFFICIAL_WEBSITE": True,
            "ENABLE_SEARCH_DISCOVERY": False,
            "INGESTION_ENDPOINT_URL": "https://api-stg.scalemyprints.com/v1/ingest/batch",
            "SOURCE_COOLDOWN_CHECK_URL": "https://api-stg.scalemyprints.com/v1/crawl/authorize",
            "INGESTION_HMAC_SECRET": "fixture-hmac-secret",
        }
    )
    crawler = Crawler(AmazonDiscoverySpider, settings)
    crawler.stats = MemoryStatsCollector(crawler)
    return AmazonDiscoverySpider.from_crawler(
        crawler,
        keywords=json.dumps(["stainless steel bottle"]),
        marketplace="amazon.com",
        crawl_run_id=RUN_ID,
        **kwargs,
    )


def html_response(
    url: str,
    html: str,
    *,
    status: int = 200,
    headers: dict[str, str] | None = None,
    meta: dict[str, object] | None = None,
) -> HtmlResponse:
    request = Request(url, meta=meta or {})
    return HtmlResponse(
        url=url,
        request=request,
        body=html.encode(),
        encoding="utf-8",
        status=status,
        headers=headers,
    )


def product_payload(item: AmazonProductIdentity) -> dict[str, object]:
    return {
        "marketplace": item.marketplace,
        "asin": item.asin,
        "product_url": item.product_url,
        "title": item.title,
        "brand": item.brand,
        "seller_display_name": item.seller_display_name,
        "merchant_token": item.merchant_token,
        "seller_profile_url": item.seller_profile_url,
        "category": item.category,
    }
