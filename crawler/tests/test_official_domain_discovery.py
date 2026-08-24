from __future__ import annotations

import json
from ipaddress import ip_address
from pathlib import Path
from typing import cast

import pytest
from scrapy import Request
from scrapy.crawler import Crawler
from scrapy.exceptions import IgnoreRequest
from scrapy.http import HtmlResponse
from scrapy.settings import Settings
from sellerintel.adapters.official_site.discovery import verify_official_domain
from sellerintel.middlewares import PublicNetworkGuardMiddleware
from sellerintel.security.dns import _require_public_address
from sellerintel.spiders.website_discovery import OfficialDomainDiscoverySpider
from twisted.internet.error import DNSLookupError

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_SITE = ROOT / "crawler" / "tests" / "fixtures" / "official_site"
RUN_ID = "018f2d5e-7b3c-7a1d-8f2e-623456789abc"
SELLER_ID = "018f2d5e-7b3c-7a1d-8f2e-523456789abc"


def test_verification_requires_domain_and_prominent_identity_signals() -> None:
    accepted = verify_official_domain(
        """
        <html><head><title>Watersy Bottle | Official Website</title></head>
        <body><h1>Watersy Bottle</h1><a href='/contact'>Contact</a></body></html>
        """,
        seller_names=("Watersy Bottle",),
        candidate_url="https://watersybottle.com/",
    )
    body_only = verify_official_domain(
        "<html><title>Merchant directory</title><body>Watersy Bottle</body></html>",
        seller_names=("Watersy Bottle",),
        candidate_url="https://watersybottle.com/",
    )

    assert accepted.accepted is True
    assert accepted.score >= 80
    assert {"domain_identity_exact", "prominent_identity_exact"}.issubset(accepted.signals)
    assert body_only.accepted is False


def test_verification_rejects_parked_or_for_sale_domain() -> None:
    result = verify_official_domain(
        "<html><title>Konaten</title><body>This domain is for sale</body></html>",
        seller_names=("Konaten",),
        candidate_url="https://konaten.com/",
    )

    assert result.decision == "rejected"
    assert result.score == 0
    assert result.signals == ("parked_or_for_sale",)


def test_verification_does_not_treat_substring_as_prominent_identity() -> None:
    result = verify_official_domain(
        "<html><title>Underwater equipment</title>"
        "<body><a href='/contact'>Contact</a></body></html>",
        seller_names=("Water",),
        candidate_url="https://water.com/",
    )

    assert result.accepted is False
    assert "prominent_identity_exact" not in result.signals


def test_discovery_spider_emits_versioned_audit_and_canonical_seller_update() -> None:
    crawler = Crawler(OfficialDomainDiscoverySpider, Settings())
    spider = OfficialDomainDiscoverySpider.from_crawler(
        crawler,
        candidate_targets=json.dumps(
            [
                {
                    "seller_id": SELLER_ID,
                    "seller_name": "Acme Industrial",
                    "seller_names": ["Acme Industrial"],
                    "seed_url": "https://acme-industrial.testmail/",
                    "candidate_basis": "identity_exact_hyphenated",
                }
            ]
        ),
        crawl_run_id=RUN_ID,
        fixture_dir=str(FIXTURE_SITE),
    )
    request = Request(
        "https://acme-industrial.testmail/",
        meta={
            "candidate_domain": "acme-industrial.testmail",
            "observed_at": "2026-08-24T00:00:00Z",
            "sellerintel_allowed_domain": "acme-industrial.testmail",
        },
    )
    response = HtmlResponse(
        request.url,
        request=request,
        status=200,
        body=(FIXTURE_SITE / "index.html").read_bytes(),
        encoding="utf-8",
    )

    batch = list(spider.parse_candidate(response))[0]
    sellers = cast(list[dict[str, object]], batch["sellers"])
    sources = cast(list[dict[str, object]], batch["sources"])

    assert batch["parser_version"] == "official-domain-discovery-v1"
    assert sellers[0]["id"] == SELLER_ID
    assert sellers[0]["official_domain"] == "acme-industrial.testmail"
    assert sources[0]["seller_id"] == SELLER_ID
    assert sources[0]["status"] == "accepted"
    assert "Acme Industrial" not in str(sources[0]["evidence_snippet"])
    assert sources[0]["schema_version"] == 1


def test_discovery_rejects_private_candidates_and_network_guard_blocks_private_response() -> None:
    with pytest.raises(ValueError, match="private candidate hosts"):
        OfficialDomainDiscoverySpider(
            candidate_targets=json.dumps(
                [
                    {
                        "seller_id": SELLER_ID,
                        "seller_name": "Private Target",
                        "seller_names": ["Private Target"],
                        "seed_url": "https://127.0.0.1/",
                        "candidate_basis": "identity_exact_compact",
                    }
                ]
            ),
            crawl_run_id=RUN_ID,
            fixture_dir=str(FIXTURE_SITE),
        )

    request = Request(
        "https://public.example/",
        meta={"sellerintel_allowed_domain": "public.example"},
    )
    response = HtmlResponse(
        request.url,
        request=request,
        body=b"<html></html>",
        encoding="utf-8",
        ip_address=ip_address("127.0.0.1"),
    )
    with pytest.raises(IgnoreRequest, match="non-public"):
        PublicNetworkGuardMiddleware().process_response(request, response)

    with pytest.raises(DNSLookupError, match="was not public"):
        _require_public_address("127.0.0.1", "public.example")
    assert _require_public_address("93.184.216.34", "public.example") == "93.184.216.34"


def test_network_guard_blocks_cross_domain_response_and_redirect() -> None:
    guard = PublicNetworkGuardMiddleware()
    request = Request(
        "https://public.example/",
        meta={"sellerintel_allowed_domain": "public.example"},
    )
    pivot = HtmlResponse(
        "https://unrelated.example/",
        request=request,
        body=b"<html></html>",
        encoding="utf-8",
    )
    with pytest.raises(IgnoreRequest, match="cross-domain"):
        guard.process_response(request, pivot)

    redirect_request = Request(
        "https://public.example/",
        meta={"sellerintel_allowed_domain": "public.example"},
    )
    redirect = HtmlResponse(
        redirect_request.url,
        request=redirect_request,
        status=302,
        headers={"Location": "https://unrelated.example/"},
    )
    assert guard.process_response(redirect_request, redirect) is redirect
    assert redirect_request.meta["dont_redirect"] is True
