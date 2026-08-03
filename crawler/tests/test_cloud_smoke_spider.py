from pathlib import Path

from scrapy.http import HtmlResponse, Request
from sellerintel.spiders.cloud_smoke import SoloNoNetworkSmokeSpider


def test_cloud_smoke_spider_uses_data_uri_only() -> None:
    spider = SoloNoNetworkSmokeSpider()
    assert spider.start_urls == [
        "data:text/html,%3Ctitle%3ESolo%20v1%20smoke%3C/title%3E"
    ]
    request = Request(spider.start_urls[0])
    response = HtmlResponse(
        url=spider.start_urls[0],
        body=b"<title>Solo v1 smoke</title>",
        encoding="utf-8",
        request=request,
    )

    assert spider.parse(response) == {
        "smoke": "ok",
        "network": "none",
        "units": 1,
        "title": "Solo v1 smoke",
    }


def test_scrapy_cloud_manifest_uses_official_stack_and_requirements() -> None:
    crawler_root = Path(__file__).resolve().parents[1]
    manifest = (crawler_root / "scrapinghub.yml").read_text(encoding="utf-8")

    assert "scrapy:2.14-20260217" in manifest
    assert "file: requirements.txt" in manifest
    assert "zyte-api" not in manifest.lower()


def test_scrapy_cloud_workflow_is_manual_and_zero_charge_locked() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    workflow = (
        repository_root / ".github" / "workflows" / "deploy-scrapy-cloud.yml"
    ).read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "schedule:" not in workflow
    assert 'SCRAPY_CLOUD_MAX_UNITS: "1"' in workflow
    assert 'ZYTE_API_ENABLED: "false"' in workflow
    assert 'PAID_SERVICES_ALLOWED: "false"' in workflow
    assert "shub deploy" in workflow
    assert "shub schedule" not in workflow
