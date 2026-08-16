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
    pipeline = SignedIngestionPipeline(submitter, started_at="2026-08-04T00:00:00Z")
    spider = configured_spider()
    batch = fixture_batch()

    receipt = pipeline.process_item(batch.as_payload(), spider)

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
    pipeline = SignedIngestionPipeline(submitter, started_at="2026-08-04T00:00:00Z")
    spider = configured_spider()
    spider.crawler.settings.set("SHUB_JOBKEY", None, priority="cmdline")
    monkeypatch.setenv("SHUB_JOBKEY", "123456/1/9")
    assert spider.crawler.stats is not None
    spider.crawler.stats.set_value("downloader/request_count", 4)
    spider.crawler.stats.set_value("downloader/response_count", 4)

    pipeline.process_item(fixture_batch().as_payload(), spider)
    pipeline.close_spider(spider)

    completion = submitter.batches[-1]
    assert completion.batch_number == COMPLETION_BATCH_NUMBER
    assert completion.crawl_runs[0].status == "completed"
    assert completion.crawl_runs[0].requests_total == 4
    assert completion.crawl_runs[0].zyte_job_id == "123456/1/9"


def test_pipeline_fails_closed_when_ingestion_settings_are_missing() -> None:
    crawler = Crawler(Spider, Settings())

    with pytest.raises(ValueError, match="INGESTION_ENDPOINT_URL"):
        SignedIngestionPipeline.from_crawler(crawler)


def test_pipeline_spools_and_marks_run_error(tmp_path: Path) -> None:
    submitter = FakeSubmitter(spool_path=tmp_path / "batch.spool.json")
    pipeline = SignedIngestionPipeline(submitter, started_at="2026-08-04T00:00:00Z")
    spider = configured_spider()

    receipt = pipeline.process_item(fixture_batch().as_payload(), spider)
    pipeline.close_spider(spider)

    assert receipt["spooled"] is True
    assert submitter.batches[-1].crawl_runs[0].status == "completed_with_errors"
    assert submitter.batches[-1].crawl_runs[0].error_count == 1


def test_pipeline_rejection_returns_only_safe_receipt_and_stops_cleanly() -> None:
    pipeline = SignedIngestionPipeline(
        RejectingSubmitter(),
        started_at="2026-08-04T00:00:00Z",
    )
    spider = configured_spider()

    receipt = pipeline.process_item(fixture_batch().as_payload(), spider)
    pipeline.close_spider(spider)

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
    return spider


def fixture_batch() -> IngestionBatch:
    return IngestionBatch(
        schema_version=1,
        parser_version="official-site-v1",
        crawl_run_id=CRAWL_RUN_ID,
        batch_number=7,
        generated_at="2026-08-04T00:00:00Z",
    )
