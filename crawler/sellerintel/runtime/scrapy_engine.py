from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from scrapy.crawler import CrawlerProcess
from scrapy.settings import Settings

import sellerintel.settings as project_settings
from sellerintel.schemas.ingestion import IngestionBatch
from sellerintel.spiders.website_contacts import OfficialWebsiteSpider


@dataclass(frozen=True, slots=True)
class ScrapyExecutionConfig:
    seed_urls: tuple[str, ...]
    crawl_run_id: str
    output_path: Path
    observed_at: str
    page_budget: int = 8
    max_depth: int = 2
    fixture_dir: Path | None = None
    default_region: str | None = None
    seller_name: str | None = None
    log_enabled: bool = False


@dataclass(frozen=True, slots=True)
class ScrapyExecutionResult:
    batches: tuple[IngestionBatch, ...]
    finish_reason: str
    requests_total: int
    responses_success: int
    blocked_count: int
    error_count: int

    @property
    def contacts_found(self) -> int:
        return sum(len(batch.contacts) for batch in self.batches)

    @property
    def sources_found(self) -> int:
        return len({source.id for batch in self.batches for source in batch.sources})


def execute_official_site_crawl(config: ScrapyExecutionConfig) -> ScrapyExecutionResult:
    if not config.seed_urls:
        raise ValueError("At least one seed URL is required")
    config.output_path.parent.mkdir(parents=True, exist_ok=True)
    config.output_path.unlink(missing_ok=True)

    settings = Settings()
    settings.setmodule(project_settings, priority="project")
    settings.set("LOG_ENABLED", config.log_enabled, priority="cmdline")
    # Sequential queue callbacks increase Scrapy's transport depth even when the
    # next URL is a sibling. The spider enforces the configured semantic depth.
    settings.set("DEPTH_LIMIT", 0, priority="cmdline")
    settings.set("SELLERINTEL_OBSERVED_AT", config.observed_at, priority="cmdline")
    settings.set(
        "FEEDS",
        {
            config.output_path.resolve().as_uri(): {
                "format": "jsonlines",
                "encoding": "utf-8",
                "overwrite": True,
            }
        },
        priority="cmdline",
    )

    process = CrawlerProcess(settings=settings, install_root_handler=False)
    crawler = process.create_crawler(OfficialWebsiteSpider)
    process.crawl(
        crawler,
        seed_urls=",".join(config.seed_urls),
        crawl_run_id=config.crawl_run_id,
        page_budget=config.page_budget,
        max_depth=config.max_depth,
        fixture_dir=str(config.fixture_dir or ""),
        default_region=config.default_region or "",
        seller_name=config.seller_name or "",
    )
    process.start(stop_after_crawl=True, install_signal_handlers=False)

    if crawler.stats is None:
        raise RuntimeError("Scrapy stats collector was not initialized")
    stats = crawler.stats.get_stats()
    finish_reason = str(stats.get("finish_reason", "unknown"))
    batches = tuple(_read_batches(config.output_path))
    return ScrapyExecutionResult(
        batches=batches,
        finish_reason=finish_reason,
        requests_total=int(stats.get("downloader/request_count", 0)),
        responses_success=int(stats.get("downloader/response_status_count/200", 0)),
        blocked_count=int(stats.get("sellerintel/blocked_count", 0)),
        error_count=int(stats.get("sellerintel/error_count", 0)),
    )


def _read_batches(path: Path) -> list[IngestionBatch]:
    if not path.is_file():
        return []
    batches: list[IngestionBatch] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            batches.append(IngestionBatch.model_validate(json.loads(line)))
    return batches
