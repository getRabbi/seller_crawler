from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from scrapy import Spider
from scrapy.crawler import Crawler

from sellerintel.clients.ingestion import IngestionClient, IngestionClientConfig, IngestionResult
from sellerintel.schemas.ingestion import CrawlRunRecord, IngestionBatch

COMPLETION_BATCH_NUMBER = 2_147_483_647


class BatchSubmitter(Protocol):
    def submit_batch(self, batch: IngestionBatch) -> IngestionResult: ...


class SignedIngestionPipeline:
    """Submit cloud-spider batches without exposing payloads in cloud item storage."""

    def __init__(
        self,
        submitter: BatchSubmitter,
        *,
        started_at: str | None = None,
    ) -> None:
        self._submitter = submitter
        self._started_at = started_at or _utc_now()
        self._sources_found = 0
        self._contacts_found = 0
        self._spooled = 0

    @classmethod
    def from_crawler(cls, crawler: Crawler) -> SignedIngestionPipeline:
        endpoint = crawler.settings.get("INGESTION_ENDPOINT_URL")
        secret = crawler.settings.get("INGESTION_HMAC_SECRET")
        if not isinstance(endpoint, str) or not endpoint.strip():
            raise ValueError("INGESTION_ENDPOINT_URL is required for cloud ingestion")
        if not isinstance(secret, str) or not secret:
            raise ValueError("INGESTION_HMAC_SECRET is required for cloud ingestion")
        spool_value = crawler.settings.get("LOCAL_SPOOL_DIR", ".sellerintel/spool")
        spool_dir = Path(str(spool_value)).resolve()
        return cls(
            IngestionClient(
                IngestionClientConfig(
                    endpoint_url=endpoint,
                    hmac_secret=secret,
                    spool_dir=spool_dir,
                )
            )
        )

    def process_item(
        self,
        item: Mapping[str, object],
        spider: Spider,
    ) -> dict[str, object]:
        batch = IngestionBatch.model_validate(item)
        result = self._submitter.submit_batch(batch)
        self._sources_found += len(batch.sources)
        self._contacts_found += len(batch.contacts)
        if result.spool_path is not None:
            self._spooled += 1
            _inc_stat(spider, "sellerintel/ingestion_spooled")
            _stop_spider(spider, "ingestion_spooled")
        else:
            _inc_stat(spider, "sellerintel/ingestion_accepted")
        return {
            "accepted": result.accepted,
            "batch_number": batch.batch_number,
            "crawl_run_id": batch.crawl_run_id,
            "schema_version": batch.schema_version,
            "spooled": result.spool_path is not None,
        }

    def close_spider(self, spider: Spider) -> None:
        crawl_run_id = getattr(spider, "crawl_run_id", None)
        if not isinstance(crawl_run_id, str) or not crawl_run_id:
            return
        stats = spider.crawler.stats
        blocked = _stat_int(stats.get_value("sellerintel/blocked_count")) if stats else 0
        errors = _stat_int(stats.get_value("sellerintel/error_count")) if stats else 0
        status = "completed"
        if blocked:
            status = "paused_by_policy"
        elif errors or self._spooled:
            status = "completed_with_errors"
        finished_at = _utc_now()
        batch = IngestionBatch(
            schema_version=1,
            parser_version="official-site-v1",
            crawl_run_id=crawl_run_id,
            batch_number=COMPLETION_BATCH_NUMBER,
            generated_at=finished_at,
            crawl_runs=[
                CrawlRunRecord(
                    id=crawl_run_id,
                    job_type="official_website",
                    zyte_job_id=_setting_string(spider, "SHUB_JOBKEY"),
                    started_at=self._started_at,
                    finished_at=finished_at,
                    status=status,
                    requests_total=_request_count(spider),
                    responses_success=(
                        _stat_int(stats.get_value("downloader/response_count")) if stats else 0
                    ),
                    candidates_found=self._sources_found,
                    contacts_verified=self._contacts_found,
                    blocked_count=blocked,
                    error_count=errors + self._spooled,
                    notes="Solo v1 one-unit Scrapy Cloud official-site crawl",
                )
            ],
        )
        result = self._submitter.submit_batch(batch)
        if result.spool_path is not None:
            _inc_stat(spider, "sellerintel/completion_spooled")


def _request_count(spider: Spider) -> int:
    stats = spider.crawler.stats
    if stats is None:
        return 0
    return max(
        _stat_int(stats.get_value("downloader/request_count")),
        _stat_int(stats.get_value("scheduler/dequeued")),
        _stat_int(stats.get_value("downloader/response_count")),
    )


def _inc_stat(spider: Spider, key: str) -> None:
    if spider.crawler.stats is not None:
        spider.crawler.stats.inc_value(key)


def _stop_spider(spider: Spider, reason: str) -> None:
    engine = spider.crawler.engine
    if engine is not None:
        engine.close_spider(spider, reason=reason)


def _setting_string(spider: Spider, key: str) -> str | None:
    value = spider.crawler.settings.get(key)
    return value if isinstance(value, str) and value else None


def _stat_int(value: object) -> int:
    return int(value) if isinstance(value, int | float) else 0


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
