from __future__ import annotations

from pathlib import Path

import pytest
from scrapy import Spider
from scrapy.crawler import Crawler
from scrapy.settings import Settings
from scrapy.statscollectors import MemoryStatsCollector
from sellerintel.clients.ingestion import IngestionRejectedError, IngestionResult
from sellerintel.pipelines import COMPLETION_BATCH_NUMBER, SignedIngestionPipeline
from sellerintel.schemas.ingestion import IngestionBatch
from sellerintel.spiders.marketplace_seller import AmazonDiscoverySpider
from sellerintel.spiders.website_contacts import OfficialWebsiteSpider
from sellerintel.spiders.website_discovery import OfficialDomainDiscoverySpider

CRAWL_RUN_ID = "018f2d5e-7b3c-7a1d-8f2e-523456789abc"


class FakeSubmitter:
    def __init__(self, *, spool_path: Path | None = None) -> None:
        self.batches: list[IngestionBatch] = []
        self._spool_path = spool_path

    def submit_batch(self, batch: IngestionBatch) -> IngestionResult:
        self.batches.append(batch)
        return IngestionResult(
            accepted=self._spool_path is None,
            duplicate=False,
            status_code=202 if self._spool_path is None else 0,
            idempotency_key=batch.idempotency_key,
            spool_path=self._spool_path,
        )


class RejectingSubmitter:
    def submit_batch(self, _batch: IngestionBatch) -> IngestionResult:
        raise IngestionRejectedError(
            "fixture rejection",
            status_code=403,
            response_body=b'{"error":{"code":"fixture"}}',
        )


def test_pipeline_submits_signed_batch_and_returns_only_receipt_metadata() -> None:
    submitter = FakeSubmitter()
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        submitter,
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )
    batch = fixture_batch()

    receipt = pipeline.process_item(batch.as_payload())

    assert submitter.batches == [batch]
    assert receipt == {
        "accepted": True,
        "batch_number": 7,
        "crawl_run_id": CRAWL_RUN_ID,
        "schema_version": 1,
        "spooled": False,
    }
    assert "contacts" not in receipt


def test_pipeline_writes_completion_batch_with_cloud_job_and_stats(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submitter = FakeSubmitter()
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        submitter,
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )
    spider.crawler.settings.set("SHUB_JOBKEY", None, priority="cmdline")
    monkeypatch.setenv("SHUB_JOBKEY", "123456/1/9")
    assert spider.crawler.stats is not None
    spider.crawler.stats.set_value("downloader/request_count", 4)
    spider.crawler.stats.set_value("downloader/response_count", 4)

    pipeline.process_item(fixture_batch().as_payload())
    pipeline.close_spider()

    completion = submitter.batches[-1]
    assert completion.batch_number == COMPLETION_BATCH_NUMBER
    assert completion.crawl_runs[0].status == "completed"
    assert completion.crawl_runs[0].requests_total == 4
    assert completion.crawl_runs[0].zyte_job_id == "123456/1/9"


def test_pipeline_uses_spider_stage_metadata_for_amazon_completion() -> None:
    submitter = FakeSubmitter()
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        submitter,
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )
    spider.job_type = "amazon_discovery"  # type: ignore[attr-defined]
    spider.parser_version = "amazon-public-v1"  # type: ignore[attr-defined]
    spider.completion_batch_number = 2_147_483_645  # type: ignore[attr-defined]

    pipeline.close_spider()

    completion = submitter.batches[-1]
    assert completion.batch_number == 2_147_483_645
    assert completion.parser_version == "amazon-public-v1"
    assert completion.crawl_runs[0].job_type == "amazon_discovery"


def test_pipeline_preserves_temporary_source_cooldown_as_terminal_status() -> None:
    submitter = FakeSubmitter()
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        submitter,
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )
    assert spider.crawler.stats is not None
    spider.crawler.stats.set_value("sellerintel/temporary_unavailable_count", 1)
    spider.crawler.stats.set_value("sellerintel/error_count", 1)

    pipeline.close_spider()

    completion = submitter.batches[-1]
    assert completion.crawl_runs[0].status == "cooldown"
    assert completion.crawl_runs[0].error_count == 1


def test_pipeline_fails_closed_when_ingestion_settings_are_missing() -> None:
    crawler = Crawler(Spider, Settings())

    with pytest.raises(ValueError, match="INGESTION_ENDPOINT_URL"):
        SignedIngestionPipeline.from_crawler(crawler)


def test_pipeline_spools_and_marks_run_error(tmp_path: Path) -> None:
    submitter = FakeSubmitter(spool_path=tmp_path / "batch.spool.json")
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        submitter,
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )

    receipt = pipeline.process_item(fixture_batch().as_payload())
    pipeline.close_spider()

    assert receipt["spooled"] is True
    assert submitter.batches[-1].crawl_runs[0].status == "completed_with_errors"
    assert submitter.batches[-1].crawl_runs[0].error_count == 1


def test_pipeline_rejection_returns_only_safe_receipt_and_stops_cleanly() -> None:
    spider = configured_spider()
    pipeline = SignedIngestionPipeline(
        RejectingSubmitter(),
        started_at="2026-08-04T00:00:00Z",
        crawler=spider.crawler,
    )

    receipt = pipeline.process_item(fixture_batch().as_payload())
    pipeline.close_spider()

    assert receipt == {
        "accepted": False,
        "batch_number": 7,
        "crawl_run_id": CRAWL_RUN_ID,
        "rejected": True,
        "schema_version": 1,
        "spooled": False,
        "status_code": 403,
    }
    assert "contacts" not in receipt
    assert spider.crawler.stats is not None
    assert spider.crawler.stats.get_value("sellerintel/ingestion_rejected") == 1
    assert spider.crawler.stats.get_value("sellerintel/completion_rejected") == 1


def test_multistage_spiders_use_distinct_completion_idempotency_keys() -> None:
    assert {
        AmazonDiscoverySpider.completion_batch_number,
        OfficialDomainDiscoverySpider.completion_batch_number,
        OfficialWebsiteSpider.completion_batch_number,
    } == {2_147_483_645, 2_147_483_646, 2_147_483_647}


def configured_spider() -> Spider:
    crawler = Crawler(
        Spider,
        Settings(
            {
                "INGESTION_ENDPOINT_URL": "https://worker.example/v1/ingest/batch",
                "INGESTION_HMAC_SECRET": "fixture-hmac-secret",
                "SHUB_JOBKEY": "123456/1/9",
            }
        ),
    )
    crawler.stats = MemoryStatsCollector(crawler)
    spider = Spider(name="official_website")
    spider.crawl_run_id = CRAWL_RUN_ID  # type: ignore[attr-defined]
    spider._set_crawler(crawler)
    crawler.spider = spider
    return spider


def fixture_batch() -> IngestionBatch:
    return IngestionBatch(
        schema_version=1,
        parser_version="official-site-v1",
        crawl_run_id=CRAWL_RUN_ID,
        batch_number=7,
        generated_at="2026-08-04T00:00:00Z",
    )
