from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path

import pytest
from sellerintel.runtime.base import BuildArtifact, CrawlJob, RunHandle
from sellerintel.runtime.scrapy_cloud import (
    NO_NETWORK_SMOKE_SPIDER,
    HttpResult,
    ScrapyCloudRunner,
    UrllibScrapyCloudTransport,
    load_scrapy_cloud_config,
    main,
)

READY_ENV = {
    "RUNNER_MODE": "zyte_student_active",
    "LIVE_CRAWL_ENABLED": "false",
    "PAID_SERVICES_ALLOWED": "false",
    "MAX_EXTERNAL_MONTHLY_SPEND_AUD": "0",
    "ALLOW_EXTRA_SCRAPY_UNITS": "false",
    "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED": "true",
    "SCRAPY_CLOUD_DEPLOY_ENABLED": "true",
    "SCRAPY_CLOUD_MAX_UNITS": "1",
    "ZYTE_API_ENABLED": "false",
    "ZYTE_API_DAILY_REQUEST_BUDGET": "0",
    "ZYTE_API_MONTHLY_BUDGET_USD": "0",
    "SCRAPY_CLOUD_PROJECT_ID": "123456",
    "SCRAPY_CLOUD_API_KEY": "fixture-cloud-credential",
}


class FakeTransport:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Mapping[str, str] | None]] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        form: Mapping[str, str] | None = None,
    ) -> HttpResult:
        self.calls.append((method, url, form))
        if url.endswith("/run.json"):
            return json_result({"status": "ok", "jobid": "123456/1/9"})
        if "jobs/list.json" in url:
            return json_result({"status": "ok", "jobs": [{"state": "finished"}]})
        if url.endswith("/jobs/stop.json"):
            return json_result({"status": "ok"})
        if "storage.zyte.com/logs" in url:
            return HttpResult(
                status_code=200,
                body=b'{"level":20,"message":"smoke complete"}\n',
            )
        raise AssertionError(f"Unexpected request: {method} {url}")


class FakeDeployRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[tuple[str, ...], Path]] = []

    def __call__(self, command: Sequence[str], *, cwd: Path) -> None:
        self.calls.append((tuple(command), cwd))


def test_runner_starts_exactly_one_unit_no_network_smoke(tmp_path: Path) -> None:
    transport = FakeTransport()
    runner = ready_runner(tmp_path, transport=transport)

    handle = runner.start(
        CrawlJob(job_id="controlled-smoke", page_budget=1, spider_name=NO_NETWORK_SMOKE_SPIDER)
    )

    assert handle == RunHandle(provider="zyte_scrapy_cloud", run_id="123456/1/9")
    form = transport.calls[0][2]
    assert form is not None
    assert form["units"] == "1"
    assert form["spider"] == NO_NETWORK_SMOKE_SPIDER
    assert json.loads(form["job_settings"])["ZYTE_API_ENABLED"] is False


def test_runner_supports_status_cancel_and_masked_log_transport(tmp_path: Path) -> None:
    transport = FakeTransport()
    runner = ready_runner(tmp_path, transport=transport)
    handle = RunHandle(provider="zyte_scrapy_cloud", run_id="123456/1/9")

    assert runner.status(handle).state == "finished"
    runner.cancel(handle)
    assert [(event.level, event.message) for event in runner.fetch_logs(handle)] == [
        ("info", "smoke complete")
    ]
    assert any("jobs/stop.json" in url for _, url, _ in transport.calls)


def test_runner_deploys_only_explicit_project_directory(tmp_path: Path) -> None:
    deploy = FakeDeployRunner()
    runner = ready_runner(tmp_path, deploy_runner=deploy)

    result = runner.deploy(BuildArtifact(version="fixture", path=str(tmp_path)))

    assert result.deployed is True
    assert deploy.calls == [(('shub', 'deploy', '123456'), tmp_path.resolve())]


def test_runner_remains_blocked_with_repository_safe_defaults(tmp_path: Path) -> None:
    env = {
        **READY_ENV,
        "SCRAPY_CLOUD_PROJECT_DIR": str(tmp_path),
        "RUNNER_MODE": "development_locked",
        "SCRAPY_CLOUD_DEPLOY_ENABLED": "false",
    }

    validation = ScrapyCloudRunner(load_scrapy_cloud_config(env)).validate_configuration()

    assert validation.ok is False
    assert "RUNNER_MODE must be zyte_student_active" in " ".join(validation.errors)
    assert "SCRAPY_CLOUD_DEPLOY_ENABLED must be true" in " ".join(validation.errors)


def test_official_site_job_requires_separate_live_gate(tmp_path: Path) -> None:
    runner = ready_runner(tmp_path)

    with pytest.raises(ValueError, match="LIVE_CRAWL_ENABLED"):
        runner.start(CrawlJob(job_id="live-test", page_budget=5, spider_name="official_website"))


def test_job_arguments_cannot_override_unit_limit(tmp_path: Path) -> None:
    runner = ready_runner(tmp_path)

    with pytest.raises(ValueError, match="safety fields"):
        runner.start(
            CrawlJob(
                job_id="unsafe-test",
                page_budget=1,
                spider_name=NO_NETWORK_SMOKE_SPIDER,
                arguments=(("units", "2"),),
            )
        )


def test_job_arguments_cannot_expose_ingestion_or_provider_secrets(tmp_path: Path) -> None:
    runner = ready_runner(tmp_path)

    with pytest.raises(ValueError, match="safety fields"):
        runner.start(
            CrawlJob(
                job_id="unsafe-secret-test",
                page_budget=1,
                spider_name=NO_NETWORK_SMOKE_SPIDER,
                arguments=(("INGESTION_HMAC_SECRET", "forbidden"),),
            )
        )


def test_http_transport_rejects_non_zyte_and_non_https_urls() -> None:
    transport = UrllibScrapyCloudTransport("fixture-cloud-credential")

    with pytest.raises(ValueError, match="official HTTPS endpoints"):
        transport.request("GET", "https://example.invalid/jobs")
    with pytest.raises(ValueError, match="official HTTPS endpoints"):
        transport.request("GET", "http://app.zyte.com/api/jobs/list.json")


def test_cli_exposes_smoke_status_and_cancel_without_secrets(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    transport = FakeTransport()
    runner = ready_runner(tmp_path, transport=transport)

    assert main(["start-smoke", "--job-id", "controlled-smoke"], runner=runner) == 0
    assert '"run_id": "123456/1/9"' in capsys.readouterr().out
    assert main(["status", "123456/1/9"], runner=runner) == 0
    assert '"state": "finished"' in capsys.readouterr().out
    assert main(["cancel", "123456/1/9"], runner=runner) == 0
    assert '"cancelled": true' in capsys.readouterr().out


def test_cli_official_job_passes_only_explicit_bounded_spider_arguments(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    runner = ready_runner(
        tmp_path,
        transport=transport,
        env_overrides={"LIVE_CRAWL_ENABLED": "true"},
    )

    assert main(
        [
            "start-official",
            "--seed-url",
            "https://approved.example/",
            "--crawl-run-id",
            "018f2d5e-7b3c-7a1d-8f2e-523456789abc",
            "--page-budget",
            "3",
            "--max-depth",
            "1",
        ],
        runner=runner,
    ) == 0

    form = transport.calls[0][2]
    assert form is not None
    assert form["units"] == "1"
    assert form["seed_urls"] == "https://approved.example/"
    assert form["page_budget"] == "3"
    assert form["max_depth"] == "1"
    settings = json.loads(form["job_settings"])
    assert settings["RUNNER_MODE"] == "zyte_student_active"
    assert settings["LIVE_CRAWL_ENABLED"] is True
    assert settings["SCRAPY_CLOUD_MAX_UNITS"] == 1
    assert settings["ZYTE_API_ENABLED"] is False
    assert settings["PAID_SERVICES_ALLOWED"] is False
    assert settings["ITEM_PIPELINES"] == {
        "sellerintel.pipelines.SignedIngestionPipeline": 300
    }
    assert "INGESTION_HMAC_SECRET" not in settings


def ready_runner(
    tmp_path: Path,
    *,
    transport: FakeTransport | None = None,
    deploy_runner: FakeDeployRunner | None = None,
    env_overrides: Mapping[str, str] | None = None,
) -> ScrapyCloudRunner:
    env = {
        **READY_ENV,
        "SCRAPY_CLOUD_PROJECT_DIR": str(tmp_path),
        **(env_overrides or {}),
    }
    return ScrapyCloudRunner(
        load_scrapy_cloud_config(env),
        transport=transport or FakeTransport(),
        deploy_runner=deploy_runner,
    )


def json_result(value: object) -> HttpResult:
    return HttpResult(status_code=200, body=json.dumps(value).encode())
