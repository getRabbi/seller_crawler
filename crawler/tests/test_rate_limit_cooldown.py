from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from scrapy.crawler import Crawler
from scrapy.http import HtmlResponse, Request
from scrapy.settings import Settings
from sellerintel.adapters.base import retry_after_seconds
from sellerintel.clients.cooldown import CooldownClient, CooldownDecision, CooldownHttpResponse
from sellerintel.spiders.website_contacts import OfficialWebsiteSpider


@dataclass(frozen=True)
class SyntheticResponse:
    url: str
    status: int
    text: str
    headers: Mapping[str, str]


class CooldownTransport:
    def __init__(self, response: CooldownHttpResponse) -> None:
        self.response = response
        self.headers: Mapping[str, str] = {}

    def get(
        self,
        _url: str,
        *,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> CooldownHttpResponse:
        assert timeout_seconds > 0
        self.headers = headers
        return self.response


class DeniedCooldownClient:
    def check(self, _domain: str) -> CooldownDecision:
        return CooldownDecision(False, "2026-08-18T00:00:00Z")


def test_retry_after_seconds_honors_delta_and_http_date() -> None:
    now = datetime(2026, 8, 17, tzinfo=UTC)
    delta = SyntheticResponse("https://example.test", 429, "", {"Retry-After": "120"})
    dated = SyntheticResponse(
        "https://example.test",
        429,
        "",
        {"retry-after": "Mon, 17 Aug 2026 00:05:00 GMT"},
    )

    assert retry_after_seconds(delta, now=now) == 120
    assert retry_after_seconds(dated, now=now) == 300


def test_429_stops_domain_and_emits_persistent_cooldown_batch() -> None:
    spider = fixture_spider()
    request = Request(
        "https://approved.example/",
        meta={"observed_at": "2026-08-17T00:00:00Z"},
    )
    response = HtmlResponse(
        request=request,
        url=request.url,
        status=429,
        headers={"Retry-After": "120"},
        body=b"Too many requests",
        encoding="utf-8",
    )

    items = list(spider.parse_page(response))

    assert len(items) == 1
    batch = cast(dict[str, object], items[0])
    sources = cast(list[dict[str, object]], batch["sources"])
    source_registry = cast(list[dict[str, object]], batch["source_registry"])
    crawl_runs = cast(list[dict[str, object]], batch["crawl_runs"])
    assert sources[0]["status"] == "cooldown"
    assert sources[0]["next_allowed_at"] == "2026-08-17T00:02:00Z"
    assert source_registry[0]["blocked_until"] == "2026-08-17T00:02:00Z"
    assert crawl_runs[0]["status"] == "paused_by_policy"
    assert list(spider._schedule_next("approved.example")) == []


def test_preflight_prevents_request_while_domain_cooldown_is_active() -> None:
    spider = fixture_spider()
    spider._cooldown_client = DeniedCooldownClient()  # type: ignore[assignment]

    assert list(spider._initial_requests()) == []


def fixture_spider() -> OfficialWebsiteSpider:
    crawler = Crawler(
        OfficialWebsiteSpider,
        Settings({"SELLERINTEL_OBSERVED_AT": "2026-08-17T00:00:00Z"}),
    )
    return OfficialWebsiteSpider.from_crawler(
        crawler,
        seed_urls="https://approved.example/",
        crawl_run_id="018f2d5e-7b3c-7a1d-8f2e-523456789abc",
        fixture_dir=str(Path("crawler/tests/fixtures/official_site").resolve()),
    )


def test_cooldown_client_sends_required_signed_crawler_headers() -> None:
    transport = CooldownTransport(
        CooldownHttpResponse(200, b'{"allowed":true,"blocked_until":null}')
    )
    client = CooldownClient(
        "https://api.example.test/v1/crawl/authorize",
        "test-secret",
        transport,
    )

    decision = client.check(
        "example.test",
        timestamp="2026-08-17T00:00:00Z",
        nonce="deterministic-test-nonce",
    )

    assert decision.allowed is True
    assert transport.headers["User-Agent"] == "seller-intelligence-crawler/1.0"
    assert transport.headers["X-SI-Timestamp"] == "2026-08-17T00:00:00Z"
    assert transport.headers["X-SI-Nonce"] == "deterministic-test-nonce"
    assert transport.headers["X-SI-Signature"]
