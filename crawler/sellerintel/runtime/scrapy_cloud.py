from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess  # nosec B404
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from sellerintel.adapters.official_site import new_uuidv7
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
from sellerintel.security.contact_crypto import ContactCipher, ContactEncryptionConfigError

PROVIDER_NAME = "zyte_scrapy_cloud"
DEFAULT_ENABLED = False
API_BASE_URL = "https://app.zyte.com/api"
STORAGE_BASE_URL = "https://storage.zyte.com"
NO_NETWORK_SMOKE_SPIDER = "solo_no_network_smoke"
OFFICIAL_SITE_SPIDER = "official_website"
AMAZON_DISCOVERY_SPIDER = "amazon_discovery"
PROJECT_ID_PATTERN = re.compile(r"^[0-9]+$")
JOB_ID_PATTERN = re.compile(r"^[0-9]+/[0-9]+/[0-9]+$")
RESERVED_JOB_ARGUMENTS = frozenset(
    {
        "INGESTION_HMAC_SECRET",
        "INGESTION_ENDPOINT_URL",
        "CONTACT_ENCRYPTION_KEYS",
        "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION",
        "SOURCE_COOLDOWN_CHECK_URL",
        "SCRAPY_CLOUD_API_KEY",
        "ZYTE_API_KEY",
        "apikey",
        "job_settings",
        "project",
        "spider",
        "units",
    }
)


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
    def __call__(self, command: Sequence[str], *, cwd: Path, api_key: str) -> None: ...


@dataclass(frozen=True, slots=True)
class ScrapyCloudConfig:
    runtime_config: RuntimeConfig
    project_id: str | None
    api_key: str | None = field(repr=False)
    project_dir: Path
    source_cooldown_check_url: str | None
    ingestion_endpoint_url: str | None
    ingestion_hmac_secret: str | None = field(repr=False)
    contact_encryption_keys: str | None = field(repr=False)
    contact_encryption_active_key_version: str | None


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
        if not valid_cooldown_check_url(self._config.source_cooldown_check_url):
            errors.append(
                "SOURCE_COOLDOWN_CHECK_URL must use the approved staging or production HTTPS host."
            )
        if not valid_ingestion_endpoint_url(self._config.ingestion_endpoint_url):
            errors.append(
                "INGESTION_ENDPOINT_URL must use the approved staging or production HTTPS host."
            )
        if not self._config.ingestion_hmac_secret:
            errors.append("INGESTION_HMAC_SECRET is required.")
        try:
            ContactCipher.from_environment(
                {
                    "CONTACT_ENCRYPTION_KEYS": self._config.contact_encryption_keys or "",
                    "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION": (
                        self._config.contact_encryption_active_key_version or ""
                    ),
                }
            )
        except ContactEncryptionConfigError:
            errors.append(
                "CONTACT_ENCRYPTION_KEYS and CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION "
                "must contain a valid matching keyring."
            )
        return ValidationResult(ok=not errors, errors=tuple(dict.fromkeys(errors)))

    def deploy(self, artifact: BuildArtifact) -> DeploymentResult:
        self._assert_ready()
        artifact_path = Path(artifact.path).resolve()
        if artifact_path != self._config.project_dir.resolve():
            raise ValueError("Scrapy Cloud artifact path must equal SCRAPY_CLOUD_PROJECT_DIR.")
        self._deploy_runner(
            ["shub", "deploy", "--version", artifact.version, self._project_id()],
            cwd=artifact_path,
            api_key=self._api_key(),
        )
        return DeploymentResult(deployed=True, provider=self.name)

    def start(self, job: CrawlJob) -> RunHandle:
        self._assert_ready()
        if job.spider_name not in {
            NO_NETWORK_SMOKE_SPIDER,
            OFFICIAL_SITE_SPIDER,
            AMAZON_DISCOVERY_SPIDER,
        }:
            raise ValueError("Only Solo v1 Scrapy Cloud spiders may be started.")
        if (
            job.spider_name != NO_NETWORK_SMOKE_SPIDER
            and not self._config.runtime_config.live_crawl_enabled
        ):
            raise ValueError("LIVE_CRAWL_ENABLED must be true for a live cloud job.")
        maximum_page_budget = 250 if job.spider_name == AMAZON_DISCOVERY_SPIDER else 25
        if not 1 <= job.page_budget <= maximum_page_budget:
            raise ValueError(
                f"Scrapy Cloud page_budget must be between 1 and {maximum_page_budget}."
            )
        arguments = dict(job.arguments)
        if RESERVED_JOB_ARGUMENTS.intersection(arguments):
            raise ValueError("Job arguments may not override provider safety fields.")
        close_page_count = job.page_budget
        if job.spider_name == OFFICIAL_SITE_SPIDER:
            seed_count = max(
                1,
                len([value for value in arguments.get("seed_urls", "").split(",") if value]),
            )
            close_page_count = job.page_budget * seed_count + 2 * seed_count
        job_settings: dict[str, object] = {
            "ALLOW_EXTRA_SCRAPY_UNITS": False,
            "ALLOW_PAID_ADDONS": False,
            "ALLOW_PAID_GITHUB_ACTIONS_MINUTES": False,
            "CLOSESPIDER_PAGECOUNT": close_page_count,
            "CONCURRENT_REQUESTS": 4,
            "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
            "CREDIT_RUNNER_ENABLED": False,
            "DEPTH_LIMIT": 0,
            "DOWNLOAD_TIMEOUT": 30,
            "ENABLE_AMAZON": job.spider_name == AMAZON_DISCOVERY_SPIDER,
            "ENABLE_ALIBABA": False,
            "ENABLE_1688": False,
            "ENABLE_BUSINESS_REGISTRY": False,
            "ENABLE_SEARCH_DISCOVERY": False,
            "ENABLE_AI_SUMMARY": False,
            "ENABLE_OUTREACH": False,
            "ENABLE_LOCAL_PLAYWRIGHT": False,
            "ENABLE_OFFICIAL_WEBSITE": True,
            "ENABLE_EMAIL_EXTRACTION": True,
            "ENABLE_PHONE_EXTRACTION": True,
            "ENABLE_WHATSAPP_EXTRACTION": True,
            "ENABLE_WECHAT_EXTRACTION": True,
            "GLOBAL_CRAWL_KILL_SWITCH": False,
            "LOG_LEVEL": "WARNING",
            "MAX_EXTERNAL_MONTHLY_SPEND_AUD": 0,
            "PAID_SERVICES_ALLOWED": False,
            "RETRY_TIMES": 1 if job.spider_name == AMAZON_DISCOVERY_SPIDER else 2,
            "ROBOTSTXT_OBEY": True,
            "RUNNER_MODE": "zyte_student_active",
            "SCRAPY_CLOUD_DEPLOY_ENABLED": True,
            "SCRAPY_CLOUD_MAX_UNITS": 1,
            "ZYTE_API_DAILY_REQUEST_BUDGET": 0,
            "ZYTE_API_ENABLED": False,
            "ZYTE_API_MONTHLY_BUDGET_USD": 0,
            "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED": True,
            "SOURCE_COOLDOWN_CHECK_URL": self._source_cooldown_check_url(),
            "INGESTION_ENDPOINT_URL": self._ingestion_endpoint_url(),
            "INGESTION_HMAC_SECRET": self._ingestion_hmac_secret(),
            "CONTACT_ENCRYPTION_KEYS": self._contact_encryption_keys(),
            "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION": (
                self._contact_encryption_active_key_version()
            ),
        }
        if job.spider_name != NO_NETWORK_SMOKE_SPIDER:
            job_settings["LIVE_CRAWL_ENABLED"] = True
            job_settings["SELLERINTEL_OBSERVED_AT"] = datetime.now(UTC).isoformat().replace(
                "+00:00", "Z"
            )
            job_settings["ITEM_PIPELINES"] = {
                "sellerintel.pipelines.SignedIngestionPipeline": 300,
            }
        else:
            job_settings["LIVE_CRAWL_ENABLED"] = False
        form = {
            "project": self._project_id(),
            "spider": job.spider_name,
            "units": "1",
            "priority": "1",
            "add_tag": f"solo-v1:{job.job_id[:64]}",
            "job_settings": json.dumps(job_settings, separators=(",", ":"), sort_keys=True),
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

    def _api_key(self) -> str:
        if self._config.api_key is None:
            raise ValueError("SCRAPY_CLOUD_API_KEY is required.")
        return self._config.api_key

    def _source_cooldown_check_url(self) -> str:
        if self._config.source_cooldown_check_url is None:
            raise ValueError("SOURCE_COOLDOWN_CHECK_URL is required.")
        return self._config.source_cooldown_check_url

    def _contact_encryption_keys(self) -> str:
        if self._config.contact_encryption_keys is None:
            raise ValueError("CONTACT_ENCRYPTION_KEYS is required.")
        return self._config.contact_encryption_keys

    def _ingestion_endpoint_url(self) -> str:
        if self._config.ingestion_endpoint_url is None:
            raise ValueError("INGESTION_ENDPOINT_URL is required.")
        return self._config.ingestion_endpoint_url

    def _ingestion_hmac_secret(self) -> str:
        if self._config.ingestion_hmac_secret is None:
            raise ValueError("INGESTION_HMAC_SECRET is required.")
        return self._config.ingestion_hmac_secret

    def _contact_encryption_active_key_version(self) -> str:
        if self._config.contact_encryption_active_key_version is None:
            raise ValueError("CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION is required.")
        return self._config.contact_encryption_active_key_version

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
        parsed_url = urllib.parse.urlparse(url)
        if parsed_url.scheme != "https" or parsed_url.hostname not in {
            "app.zyte.com",
            "storage.zyte.com",
        }:
            raise ValueError("Scrapy Cloud transport accepts only official HTTPS endpoints.")
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
            with urllib.request.urlopen(  # noqa: S310  # nosec B310
                request,
                timeout=self._timeout_seconds,
            ) as response:
                return HttpResult(status_code=response.status, body=response.read())
        except urllib.error.HTTPError as error:
            return HttpResult(status_code=error.code, body=error.read())


def load_scrapy_cloud_config(env: Mapping[str, str] | None = None) -> ScrapyCloudConfig:
    source = os.environ if env is None else env
    project_dir = _resolve_project_dir(source.get("SCRAPY_CLOUD_PROJECT_DIR", "crawler"))
    return ScrapyCloudConfig(
        runtime_config=load_runtime_config(source),
        project_id=source.get("SCRAPY_CLOUD_PROJECT_ID"),
        api_key=source.get("SCRAPY_CLOUD_API_KEY"),
        project_dir=project_dir,
        source_cooldown_check_url=source.get("SOURCE_COOLDOWN_CHECK_URL"),
        ingestion_endpoint_url=source.get("INGESTION_ENDPOINT_URL"),
        ingestion_hmac_secret=source.get("INGESTION_HMAC_SECRET"),
        contact_encryption_keys=source.get("CONTACT_ENCRYPTION_KEYS"),
        contact_encryption_active_key_version=source.get(
            "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION"
        ),
    )


def _resolve_project_dir(raw_value: str) -> Path:
    configured = Path(raw_value)
    if configured.is_absolute():
        return configured.resolve()
    candidate = configured.resolve()
    current = Path.cwd().resolve()
    if candidate.is_dir():
        return candidate
    if configured == Path(current.name) and (current / "scrapy.cfg").is_file():
        return current
    return candidate


def valid_cooldown_check_url(value: str | None) -> bool:
    return valid_worker_url(value, path="/v1/crawl/authorize")


def valid_ingestion_endpoint_url(value: str | None) -> bool:
    return valid_worker_url(value, path="/v1/ingest/batch")


def valid_worker_url(value: str | None, *, path: str) -> bool:
    if not value:
        return False
    parsed = urllib.parse.urlparse(value)
    try:
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname
        in {"api-stg.scalemyprints.com", "api.scalemyprints.com"}
        and parsed.path == path
        and not parsed.params
        and not parsed.query
        and not parsed.fragment
        and parsed.username is None
        and parsed.password is None
        and port is None
    )


def run_deploy_command(command: Sequence[str], *, cwd: Path, api_key: str) -> None:
    if not command or command[0] != "shub":
        raise ValueError("Only the pinned shub deployment command is allowed.")
    uvx_path = shutil.which("uvx")
    if uvx_path is None:
        raise RuntimeError("uvx is required for the pinned Scrapy Cloud deploy tool.")
    subprocess.run(  # noqa: S603  # nosec B603
        [uvx_path, "--from", "shub==2.18.1", *command],
        cwd=cwd,
        check=True,
        env={**os.environ, "SHUB_APIKEY": api_key},
    )


def cloud_log_level(raw_level: object) -> str:
    if not isinstance(raw_level, int):
        return "unknown"
    return {10: "debug", 20: "info", 30: "warning", 40: "error", 50: "critical"}.get(
        raw_level,
        "unknown",
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Controlled one-unit Scrapy Cloud runner")
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("validate", help="Validate configuration without network access")

    deploy = actions.add_parser("deploy", help="Deploy crawler code to the configured project")
    deploy.add_argument("--version", default="solo-v1")

    smoke = actions.add_parser("start-smoke", help="Start the no-network smoke spider")
    smoke.add_argument("--job-id", default="solo-v1-no-network-smoke")

    official = actions.add_parser("start-official", help="Start one approved official-site job")
    official.add_argument("--seed-url", action="append", required=True)
    official.add_argument("--crawl-run-id", default="")
    official.add_argument("--page-budget", type=int, default=8)
    official.add_argument("--max-depth", type=int, default=2)
    official.add_argument("--default-region", default="")
    official.add_argument("--seller-id", default="")
    official.add_argument("--seller-name", default="")
    official.add_argument(
        "--contact-type",
        action="append",
        choices=("email", "phone", "whatsapp", "wechat"),
        default=[],
    )

    amazon = actions.add_parser(
        "start-amazon",
        help="Start one approved bounded public Amazon identity-discovery job",
    )
    amazon.add_argument("--keyword", action="append", required=True)
    amazon.add_argument("--marketplace", required=True)
    amazon.add_argument("--crawl-run-id", default="")
    amazon.add_argument("--target-sellers", type=int, default=1)
    amazon.add_argument("--max-result-pages", type=int, default=1)
    amazon.add_argument("--page-budget", type=int, default=6)
    amazon.add_argument("--country-code", action="append", default=[])
    amazon.add_argument("--category", default="")
    amazon.add_argument("--brand-keyword", default="")
    amazon.add_argument("--seller-name-keyword", default="")
    amazon.add_argument("--require-public-location", action="store_true")
    amazon.add_argument("--require-official-website", action="store_true")
    amazon.add_argument("--manufacturer-likelihood", choices=("any", "likely"), default="any")
    amazon.add_argument("--trader-likelihood", choices=("any", "likely"), default="any")

    status = actions.add_parser("status", help="Read one job status")
    status.add_argument("job_id")

    cancel = actions.add_parser("cancel", help="Cancel one job")
    cancel.add_argument("job_id")
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    runner: ScrapyCloudRunner | None = None,
) -> int:
    args = _parser().parse_args(argv)
    config = load_scrapy_cloud_config()
    cloud_runner = runner or ScrapyCloudRunner(config)

    if args.action == "validate":
        validation = cloud_runner.validate_configuration()
        print(json.dumps({"errors": validation.errors, "ok": validation.ok}, sort_keys=True))
        return 0 if validation.ok else 1
    if args.action == "deploy":
        artifact = BuildArtifact(version=args.version, path=str(config.project_dir))
        result = cloud_runner.deploy(artifact)
        print(json.dumps({"deployed": result.deployed, "provider": result.provider}))
        return 0
    if args.action == "start-smoke":
        handle = cloud_runner.start(
            CrawlJob(
                job_id=args.job_id,
                page_budget=1,
                spider_name=NO_NETWORK_SMOKE_SPIDER,
            )
        )
        print(json.dumps({"provider": handle.provider, "run_id": handle.run_id}))
        return 0
    if args.action == "start-official":
        crawl_run_id = args.crawl_run_id or new_uuidv7()
        if bool(args.seller_id) != bool(args.seller_name):
            raise ValueError("--seller-id and --seller-name must be supplied together.")
        if args.seller_id and len(args.seed_url) != 1:
            raise ValueError("A linked seller crawl must contain exactly one seed URL.")
        arguments = [
            ("seed_urls", ",".join(args.seed_url)),
            ("crawl_run_id", crawl_run_id),
            ("page_budget", str(args.page_budget)),
            ("max_depth", str(args.max_depth)),
            (
                "contact_types",
                ",".join(args.contact_type or ("email", "phone", "whatsapp", "wechat")),
            ),
        ]
        if args.default_region:
            arguments.append(("default_region", args.default_region))
        if args.seller_id:
            arguments.append(
                (
                    "seller_targets",
                    json.dumps(
                        [
                            {
                                "seller_id": args.seller_id,
                                "seller_name": args.seller_name,
                                "seed_url": args.seed_url[0],
                            }
                        ],
                        separators=(",", ":"),
                    ),
                )
            )
        handle = cloud_runner.start(
            CrawlJob(
                job_id=crawl_run_id,
                page_budget=args.page_budget,
                spider_name=OFFICIAL_SITE_SPIDER,
                arguments=tuple(arguments),
            )
        )
        print(json.dumps({"provider": handle.provider, "run_id": handle.run_id}))
        return 0
    if args.action == "start-amazon":
        crawl_run_id = args.crawl_run_id or new_uuidv7()
        amazon_arguments: tuple[tuple[str, str], ...] = (
            (
                "keywords",
                json.dumps([str(value) for value in args.keyword], separators=(",", ":")),
            ),
            ("marketplace", str(args.marketplace)),
            ("crawl_run_id", crawl_run_id),
            ("target_sellers", str(args.target_sellers)),
            ("max_result_pages", str(args.max_result_pages)),
            ("country_codes", ",".join(str(value) for value in args.country_code)),
            ("category", str(args.category)),
            ("brand_keyword", str(args.brand_keyword)),
            ("seller_name_keyword", str(args.seller_name_keyword)),
            ("require_public_location", str(args.require_public_location).lower()),
            ("require_official_website", str(args.require_official_website).lower()),
            ("manufacturer_likelihood", str(args.manufacturer_likelihood)),
            ("trader_likelihood", str(args.trader_likelihood)),
        )
        handle = cloud_runner.start(
            CrawlJob(
                job_id=crawl_run_id,
                page_budget=args.page_budget,
                spider_name=AMAZON_DISCOVERY_SPIDER,
                arguments=amazon_arguments,
            )
        )
        print(json.dumps({"provider": handle.provider, "run_id": handle.run_id}))
        return 0
    handle = RunHandle(provider=PROVIDER_NAME, run_id=args.job_id)
    if args.action == "status":
        print(json.dumps({"run_id": handle.run_id, "state": cloud_runner.status(handle).state}))
        return 0
    cloud_runner.cancel(handle)
    print(json.dumps({"cancelled": True, "run_id": handle.run_id}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"scrapy-cloud: {error}", file=sys.stderr)
        raise SystemExit(1) from error
