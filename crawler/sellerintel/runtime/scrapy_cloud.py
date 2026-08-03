from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from sellerintel.config.features import RuntimeConfig, load_runtime_config, startup_gate_violations
from sellerintel.runtime.base import (
    BuildArtifact,
    CrawlJob,
    DeploymentResult,
    LogEvent,
    RunHandle,
    RunStatus,
    ValidationResult,
)

PROVIDER_NAME = "zyte_scrapy_cloud"
DEFAULT_ENABLED = False
API_BASE_URL = "https://app.zyte.com/api"
STORAGE_BASE_URL = "https://storage.zyte.com"
NO_NETWORK_SMOKE_SPIDER = "solo_no_network_smoke"
OFFICIAL_SITE_SPIDER = "official_website"
PROJECT_ID_PATTERN = re.compile(r"^[0-9]+$")
JOB_ID_PATTERN = re.compile(r"^[0-9]+/[0-9]+/[0-9]+$")
RESERVED_JOB_ARGUMENTS = frozenset({"project", "spider", "units", "job_settings"})


@dataclass(frozen=True, slots=True)
class HttpResult:
    status_code: int
    body: bytes


class HttpTransport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        form: Mapping[str, str] | None = None,
    ) -> HttpResult: ...


class DeployCommandRunner(Protocol):
    def __call__(self, command: Sequence[str], *, cwd: Path) -> None: ...


@dataclass(frozen=True, slots=True)
class ScrapyCloudConfig:
    runtime_config: RuntimeConfig
    project_id: str | None
    api_key: str | None
    project_dir: Path


class ScrapyCloudRunner:
    name = PROVIDER_NAME

    def __init__(
        self,
        config: ScrapyCloudConfig,
        *,
        transport: HttpTransport | None = None,
        deploy_runner: DeployCommandRunner | None = None,
    ) -> None:
        self._config = config
        self._transport = transport or UrllibScrapyCloudTransport(config.api_key or "")
        self._deploy_runner = deploy_runner or run_deploy_command

    def validate_configuration(self) -> ValidationResult:
        errors = list(startup_gate_violations(self._config.runtime_config))
        runtime = self._config.runtime_config
        if runtime.runner_mode != "zyte_student_active":
            errors.append("RUNNER_MODE must be zyte_student_active for Scrapy Cloud operations.")
        if not runtime.zyte_student_entitlement_confirmed:
            errors.append("ZYTE_STUDENT_ENTITLEMENT_CONFIRMED must be true.")
        if not runtime.scrapy_cloud_deploy_enabled:
            errors.append("SCRAPY_CLOUD_DEPLOY_ENABLED must be true for controlled operations.")
        if runtime.scrapy_cloud_max_units != 1:
            errors.append("SCRAPY_CLOUD_MAX_UNITS must equal 1.")
        if runtime.zyte_api_enabled:
            errors.append("ZYTE_API_ENABLED must remain false.")
        if runtime.paid_services_allowed:
            errors.append("PAID_SERVICES_ALLOWED must remain false.")
        if runtime.allow_extra_scrapy_units:
            errors.append("ALLOW_EXTRA_SCRAPY_UNITS must remain false.")
        if runtime.max_external_monthly_spend_aud != 0:
            errors.append("MAX_EXTERNAL_MONTHLY_SPEND_AUD must remain 0.")
        if not self._config.project_id or not PROJECT_ID_PATTERN.fullmatch(
            self._config.project_id
        ):
            errors.append("SCRAPY_CLOUD_PROJECT_ID must be a numeric project identifier.")
        if not self._config.api_key:
            errors.append("SCRAPY_CLOUD_API_KEY is required.")
        if not self._config.project_dir.is_dir():
            errors.append("SCRAPY_CLOUD_PROJECT_DIR must be an existing directory.")
        return ValidationResult(ok=not errors, errors=tuple(dict.fromkeys(errors)))

    def deploy(self, artifact: BuildArtifact) -> DeploymentResult:
        self._assert_ready()
        artifact_path = Path(artifact.path).resolve()
        if artifact_path != self._config.project_dir.resolve():
            raise ValueError("Scrapy Cloud artifact path must equal SCRAPY_CLOUD_PROJECT_DIR.")
        self._deploy_runner(["shub", "deploy", self._project_id()], cwd=artifact_path)
        return DeploymentResult(deployed=True, provider=self.name)

    def start(self, job: CrawlJob) -> RunHandle:
        self._assert_ready()
        if job.spider_name not in {NO_NETWORK_SMOKE_SPIDER, OFFICIAL_SITE_SPIDER}:
            raise ValueError("Only Solo v1 Scrapy Cloud spiders may be started.")
        if (
            job.spider_name == OFFICIAL_SITE_SPIDER
            and not self._config.runtime_config.live_crawl_enabled
        ):
            raise ValueError("LIVE_CRAWL_ENABLED must be true for an official-site cloud job.")
        if not 1 <= job.page_budget <= 25:
            raise ValueError("Scrapy Cloud page_budget must be between 1 and 25.")
        arguments = dict(job.arguments)
        if RESERVED_JOB_ARGUMENTS.intersection(arguments):
            raise ValueError("Job arguments may not override provider safety fields.")
        form = {
            "project": self._project_id(),
            "spider": job.spider_name,
            "units": "1",
            "priority": "1",
            "add_tag": f"solo-v1:{job.job_id[:64]}",
            "job_settings": json.dumps(
                {
                    "CLOSESPIDER_PAGECOUNT": job.page_budget,
                    "CONCURRENT_REQUESTS": 4,
                    "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
                    "DOWNLOAD_TIMEOUT": 30,
                    "RETRY_TIMES": 2,
                    "ROBOTSTXT_OBEY": True,
                    "ZYTE_API_ENABLED": False,
                },
                separators=(",", ":"),
                sort_keys=True,
            ),
            **arguments,
        }
        payload = self._json_request("POST", f"{API_BASE_URL}/run.json", form=form)
        job_id = payload.get("jobid")
        if payload.get("status") != "ok" or not isinstance(job_id, str):
            raise RuntimeError("Scrapy Cloud did not return a job identifier.")
        self._validate_job_id(job_id)
        return RunHandle(provider=self.name, run_id=job_id)

    def status(self, handle: RunHandle) -> RunStatus:
        self._assert_handle(handle)
        query = urllib.parse.urlencode(
            {"project": self._project_id(), "job": handle.run_id, "count": "1"}
        )
        payload = self._json_request("GET", f"{API_BASE_URL}/jobs/list.json?{query}")
        jobs = payload.get("jobs")
        if not isinstance(jobs, list) or not jobs or not isinstance(jobs[0], dict):
            return RunStatus(state="unknown")
        state = jobs[0].get("state")
        return RunStatus(state=state if isinstance(state, str) else "unknown")

    def cancel(self, handle: RunHandle) -> None:
        self._assert_handle(handle)
        payload = self._json_request(
            "POST",
            f"{API_BASE_URL}/jobs/stop.json",
            form={"project": self._project_id(), "job": handle.run_id},
        )
        if payload.get("status") not in {"ok", None}:
            raise RuntimeError("Scrapy Cloud did not accept the stop request.")

    def fetch_logs(self, handle: RunHandle) -> Iterable[LogEvent]:
        self._assert_handle(handle)
        result = self._transport.request(
            "GET",
            f"{STORAGE_BASE_URL}/logs/{handle.run_id}?format=jl&count=100",
        )
        if result.status_code != 200:
            raise RuntimeError(f"Scrapy Cloud logs request failed with HTTP {result.status_code}.")
        events: list[LogEvent] = []
        for line in result.body.decode("utf-8").splitlines():
            value = json.loads(line)
            level = cloud_log_level(value.get("level"))
            message = value.get("message")
            if isinstance(message, str):
                events.append(LogEvent(level=level, message=message))
        return tuple(events)

    def _json_request(
        self,
        method: str,
        url: str,
        *,
        form: Mapping[str, str] | None = None,
    ) -> dict[str, object]:
        result = self._transport.request(method, url, form=form)
        if not 200 <= result.status_code < 300:
            raise RuntimeError(f"Scrapy Cloud request failed with HTTP {result.status_code}.")
        payload = json.loads(result.body)
        if not isinstance(payload, dict):
            raise RuntimeError("Scrapy Cloud returned an invalid JSON payload.")
        return payload

    def _assert_ready(self) -> None:
        validation = self.validate_configuration()
        if not validation.ok:
            raise ValueError("; ".join(validation.errors))

    def _assert_handle(self, handle: RunHandle) -> None:
        self._assert_ready()
        if handle.provider != self.name:
            raise ValueError("Run handle belongs to a different provider.")
        self._validate_job_id(handle.run_id)
        if not handle.run_id.startswith(f"{self._project_id()}/"):
            raise ValueError("Run handle belongs to a different Scrapy Cloud project.")

    def _project_id(self) -> str:
        if self._config.project_id is None:
            raise ValueError("SCRAPY_CLOUD_PROJECT_ID is required.")
        return self._config.project_id

    @staticmethod
    def _validate_job_id(job_id: str) -> None:
        if not JOB_ID_PATTERN.fullmatch(job_id):
            raise ValueError("Invalid Scrapy Cloud job identifier.")


class UrllibScrapyCloudTransport:
    def __init__(self, api_key: str, timeout_seconds: float = 30) -> None:
        self._authorization = "Basic " + base64.b64encode(f"{api_key}:".encode()).decode()
        self._timeout_seconds = timeout_seconds

    def request(
        self,
        method: str,
        url: str,
        *,
        form: Mapping[str, str] | None = None,
    ) -> HttpResult:
        body = urllib.parse.urlencode(form).encode() if form is not None else None
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "accept": "application/json",
                "authorization": self._authorization,
                "content-type": "application/x-www-form-urlencoded",
                "user-agent": "seller-intelligence-solo-v1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:  # noqa: S310
                return HttpResult(status_code=response.status, body=response.read())
        except urllib.error.HTTPError as error:
            return HttpResult(status_code=error.code, body=error.read())


def load_scrapy_cloud_config(env: Mapping[str, str] | None = None) -> ScrapyCloudConfig:
    source = os.environ if env is None else env
    project_dir = Path(source.get("SCRAPY_CLOUD_PROJECT_DIR", "crawler")).resolve()
    return ScrapyCloudConfig(
        runtime_config=load_runtime_config(source),
        project_id=source.get("SCRAPY_CLOUD_PROJECT_ID"),
        api_key=source.get("SCRAPY_CLOUD_API_KEY"),
        project_dir=project_dir,
    )


def run_deploy_command(command: Sequence[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)  # noqa: S603


def cloud_log_level(raw_level: object) -> str:
    if not isinstance(raw_level, int):
        return "unknown"
    return {10: "debug", 20: "info", 30: "warning", 40: "error", 50: "critical"}.get(
        raw_level,
        "unknown",
    )
