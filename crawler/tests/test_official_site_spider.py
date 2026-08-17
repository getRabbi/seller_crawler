from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from scrapy.settings import Settings
from sellerintel.runtime.scrapy_engine import total_scheduled_requests
from sellerintel.spiders.website_contacts import OfficialWebsiteSpider

ROOT = Path(__file__).resolve().parents[2]
CRAWLER = ROOT / "crawler"
FIXTURE_SITE = CRAWLER / "tests" / "fixtures" / "official_site"


def test_fixture_only_scrapy_crawl_runs_end_to_end_without_network(tmp_path: Path) -> None:
    assert OfficialWebsiteSpider.custom_settings["DEPTH_LIMIT"] == 0
    output_path = tmp_path / "runs" / "official-site.jsonl"
    env = os.environ.copy()
    env.update(
        {
            "PYTHONPATH": str(CRAWLER),
            "SELLERINTEL_WORKSPACE_ROOT": str(tmp_path),
            "LOCAL_SPOOL_DIR": str(tmp_path / "spool"),
            "LOCAL_RUNNER_LOCK_PATH": str(tmp_path / "runner.lock"),
            "LOCAL_CRAWL_OUTPUT_PATH": str(output_path),
            "LOCAL_RUNNER_FIXTURE_ONLY": "true",
            "LOCAL_RUNNER_DRY_RUN": "true",
            "OFFICIAL_SITE_FIXTURE_DIR": str(FIXTURE_SITE),
            "OFFICIAL_SITE_SEED_URLS": "https://acme-industrial.testmail/",
            "OFFICIAL_SITE_DEFAULT_REGION": "US",
            "RUNNER_MODE": "development_locked",
            "LIVE_CRAWL_ENABLED": "false",
            "PAID_SERVICES_ALLOWED": "false",
            "MAX_EXTERNAL_MONTHLY_SPEND_AUD": "0",
            "SCRAPY_CLOUD_MAX_UNITS": "1",
            "ZYTE_API_ENABLED": "false",
        }
    )

    completed = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "sellerintel.runtime.local"],
        cwd=CRAWLER,
        env=env,
        capture_output=True,
        check=False,
        text=True,
        timeout=30,
    )

    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result["state"] == "dry_run_complete"
    assert result["fixture_only"] is True
    assert result["pages_crawled"] >= 3
    assert result["contacts_found"] == 4
    assert result["blocked_count"] == 0
    assert output_path.is_file()

    batches = [json.loads(line) for line in output_path.read_text(encoding="utf-8").splitlines()]
    contact_types = {
        contact["contact_type"]
        for batch in batches
        for contact in batch.get("contacts", [])
    }
    assert contact_types == {"email", "phone", "whatsapp", "wechat"}
    for batch in batches:
        for contact in batch.get("contacts", []):
            assert contact["contact_value_ciphertext"].startswith("si-aesgcm:v1:fixture-v1:")
            assert not contact["contact_value_ciphertext"].startswith("redacted-sha256:")
        for source in batch.get("sources", []):
            assert source["source_url"].startswith("https://acme-industrial.testmail/")
            assert source["page_title"]
            assert source["evidence_snippet"]
            assert source["content_hash"]
            assert source["detected_at"]
            assert source["last_seen_at"]


def test_spider_rejects_private_seed_hosts() -> None:
    with pytest.raises(ValueError, match="private seed hosts"):
        OfficialWebsiteSpider(
            seed_urls="http://127.0.0.1/",
            crawl_run_id="018f2d5e-7b3c-7a1d-8f2e-523456789abc",
            fixture_dir=str(FIXTURE_SITE),
        )


def test_fixture_request_stats_use_scheduler_count_when_downloader_is_intercepted() -> None:
    assert total_scheduled_requests(
        {
            "downloader/request_count": 0,
            "scheduler/dequeued": 9,
            "response_received_count": 9,
        }
    ) == 9


def test_cloud_runtime_settings_open_only_the_explicit_one_unit_live_gate() -> None:
    spider = OfficialWebsiteSpider(
        seed_urls="https://approved.example/",
        crawl_run_id="018f2d5e-7b3c-7a1d-8f2e-523456789abc",
    )

    spider._validate_runtime(
        Settings(
            {
                "RUNNER_MODE": "zyte_student_active",
                "LIVE_CRAWL_ENABLED": True,
                "PAID_SERVICES_ALLOWED": False,
                "MAX_EXTERNAL_MONTHLY_SPEND_AUD": 0,
                "ALLOW_EXTRA_SCRAPY_UNITS": False,
                "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED": True,
                "SCRAPY_CLOUD_DEPLOY_ENABLED": True,
                "SCRAPY_CLOUD_MAX_UNITS": 1,
                "ZYTE_API_ENABLED": False,
                "ZYTE_API_DAILY_REQUEST_BUDGET": 0,
                "ZYTE_API_MONTHLY_BUDGET_USD": 0,
                "ENABLE_AMAZON": False,
                "ENABLE_OFFICIAL_WEBSITE": True,
                "CONTACT_ENCRYPTION_KEYS": json.dumps(
                    {"test-v1": base64.urlsafe_b64encode(b"x" * 32).decode().rstrip("=")}
                ),
                "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION": "test-v1",
                "INGESTION_ENDPOINT_URL": "https://api.example/v1/ingest/batch",
                "INGESTION_HMAC_SECRET": "test-only-hmac-secret",
            }
        )
    )
