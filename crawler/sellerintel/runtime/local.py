from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from sellerintel.clients.ingestion import IngestionClient, IngestionClientConfig, IngestionResult
from sellerintel.config.features import RuntimeConfig, load_runtime_config, startup_gate_violations
from sellerintel.runtime.base import ValidationResult
from sellerintel.schemas.ingestion import IngestionBatch

PROVIDER_NAME = "local"
DEFAULT_ENABLED = False
LOCAL_RUNNER_PARSER_VERSION = "local-runner-smoke-v1"
FIXTURE_SMOKE_RUN_ID = "018f2d5e-7b3c-7a1d-8f2e-523456789abc"

FORBIDDEN_BROWSER_PROFILE_ENV = (
    "BROWSER_PROFILE_PATH",
    "CHROME_USER_DATA_DIR",
    "FIREFOX_PROFILE_PATH",
    "COOKIE_FILE",
)


class BatchSubmitter(Protocol):
    def submit_batch(self, batch: IngestionBatch) -> IngestionResult: ...


@dataclass(frozen=True, slots=True)
class LocalRunnerConfig:
    runtime_config: RuntimeConfig
    workspace_root: Path
    spool_dir: Path
    lock_path: Path
    fixture_only: bool = True
    dry_run: bool = True
    ingestion_endpoint_url: str | None = None
    ingestion_hmac_secret: str | None = None
    forbidden_browser_profile_values: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class LocalRunResult:
    state: str
    fixture_only: bool
    dry_run: bool
    lock_path: str
    spool_dir: str
    idempotency_key: str | None = None
    accepted: bool = False
    spooled: bool = False
    errors: tuple[str, ...] = ()


class LocalRunnerBusyError(RuntimeError):
    """Raised when another local runner job owns the sequential lock."""


class LocalRunnerLock:
    def __init__(self, lock_path: Path) -> None:
        self._lock_path = lock_path
        self._fd: int | None = None

    def __enter__(self) -> LocalRunnerLock:
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._fd = os.open(
                self._lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        except FileExistsError as error:
            raise LocalRunnerBusyError(f"local runner lock exists: {self._lock_path}") from error
        os.write(self._fd, f"pid={os.getpid()}\n".encode())
        return self

    def __exit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
        try:
            self._lock_path.unlink()
        except FileNotFoundError:
            return


class LocalRunner:
    def __init__(
        self,
        config: LocalRunnerConfig,
        *,
        submitter: BatchSubmitter | None = None,
    ) -> None:
        self._config = config
        self._submitter = submitter

    def run_fixture_smoke(self, batch: IngestionBatch | None = None) -> LocalRunResult:
        validation = validate_local_runner_readiness(self._config)
        if not validation.ok:
            return self._result("blocked", errors=validation.errors)

        try:
            with LocalRunnerLock(self._config.lock_path):
                smoke_batch = build_fixture_smoke_batch() if batch is None else batch
                if self._config.dry_run:
                    return self._result(
                        "dry_run_complete",
                        idempotency_key=smoke_batch.idempotency_key,
                    )

                submitter = self._submitter or self._build_ingestion_client()
                ingestion_result = submitter.submit_batch(smoke_batch)
                return self._result(
                    "submitted",
                    idempotency_key=ingestion_result.idempotency_key,
                    accepted=ingestion_result.accepted,
                    spooled=ingestion_result.spool_path is not None,
                )
        except LocalRunnerBusyError as error:
            return self._result("busy", errors=(str(error),))

    def _build_ingestion_client(self) -> IngestionClient:
        if self._config.ingestion_endpoint_url is None:
            raise ValueError("ingestion_endpoint_url is required outside dry-run mode")
        if self._config.ingestion_hmac_secret is None:
            raise ValueError("ingestion_hmac_secret is required outside dry-run mode")
        return IngestionClient(
            IngestionClientConfig(
                endpoint_url=self._config.ingestion_endpoint_url,
                hmac_secret=self._config.ingestion_hmac_secret,
                spool_dir=self._config.spool_dir,
            )
        )

    def _result(
        self,
        state: str,
        *,
        idempotency_key: str | None = None,
        accepted: bool = False,
        spooled: bool = False,
        errors: tuple[str, ...] = (),
    ) -> LocalRunResult:
        return LocalRunResult(
            state=state,
            fixture_only=self._config.fixture_only,
            dry_run=self._config.dry_run,
            lock_path=str(self._config.lock_path),
            spool_dir=str(self._config.spool_dir),
            idempotency_key=idempotency_key,
            accepted=accepted,
            spooled=spooled,
            errors=errors,
        )


def load_local_runner_config(env: Mapping[str, str] | None = None) -> LocalRunnerConfig:
    source = os.environ if env is None else env
    workspace_root = _path_value(source, "SELLERINTEL_WORKSPACE_ROOT", Path.cwd()).resolve()
    spool_dir = _path_value(
        source,
        "LOCAL_SPOOL_DIR",
        workspace_root / ".sellerintel" / "spool",
        base=workspace_root,
    )
    lock_path = _path_value(
        source,
        "LOCAL_RUNNER_LOCK_PATH",
        workspace_root / ".sellerintel" / "local-runner.lock",
        base=workspace_root,
    )

    return LocalRunnerConfig(
        runtime_config=load_runtime_config(source),
        workspace_root=workspace_root,
        spool_dir=spool_dir.resolve(),
        lock_path=lock_path.resolve(),
        fixture_only=_read_bool(source, "LOCAL_RUNNER_FIXTURE_ONLY", True),
        dry_run=_read_bool(source, "LOCAL_RUNNER_DRY_RUN", True),
        ingestion_endpoint_url=source.get("INGESTION_ENDPOINT_URL"),
        ingestion_hmac_secret=source.get("INGESTION_HMAC_SECRET"),
        forbidden_browser_profile_values=tuple(
            source[key] for key in FORBIDDEN_BROWSER_PROFILE_ENV if source.get(key)
        ),
    )


def validate_local_runner_readiness(config: LocalRunnerConfig) -> ValidationResult:
    errors = list(startup_gate_violations(config.runtime_config))

    if config.runtime_config.runner_mode not in {"development_locked", "fallback_local"}:
        errors.append("Local runner supports only development_locked or fallback_local mode.")
    if config.runtime_config.live_crawl_enabled:
        errors.append("Local runner readiness does not permit live crawling.")
    if config.runtime_config.feature_flags.get("GLOBAL_CRAWL_KILL_SWITCH", False):
        errors.append("GLOBAL_CRAWL_KILL_SWITCH is active.")
    if config.runtime_config.feature_flags.get("ENABLE_LOCAL_PLAYWRIGHT", False):
        errors.append("ENABLE_LOCAL_PLAYWRIGHT must remain false for fixture-only smoke runs.")
    if config.runtime_config.runner_mode == "development_locked" and not config.fixture_only:
        errors.append("development_locked mode requires LOCAL_RUNNER_FIXTURE_ONLY=true.")
    if not config.dry_run:
        if not config.ingestion_endpoint_url:
            errors.append("INGESTION_ENDPOINT_URL is required when LOCAL_RUNNER_DRY_RUN=false.")
        if not config.ingestion_hmac_secret:
            errors.append("INGESTION_HMAC_SECRET is required when LOCAL_RUNNER_DRY_RUN=false.")
    if config.forbidden_browser_profile_values:
        errors.append("Personal browser profiles and cookie files are forbidden.")
    if not _is_within(config.spool_dir, config.workspace_root):
        errors.append("LOCAL_SPOOL_DIR must stay within SELLERINTEL_WORKSPACE_ROOT.")
    if not _is_within(config.lock_path, config.workspace_root):
        errors.append("LOCAL_RUNNER_LOCK_PATH must stay within SELLERINTEL_WORKSPACE_ROOT.")

    return ValidationResult(ok=not errors, errors=tuple(errors))


def build_fixture_smoke_batch(generated_at: str | None = None) -> IngestionBatch:
    timestamp = generated_at or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return IngestionBatch(
        schema_version=1,
        parser_version=LOCAL_RUNNER_PARSER_VERSION,
        crawl_run_id=FIXTURE_SMOKE_RUN_ID,
        batch_number=0,
        generated_at=timestamp,
    )


def local_run_result_payload(result: LocalRunResult) -> dict[str, object]:
    return asdict(result)


def main() -> int:
    config = load_local_runner_config()
    result = LocalRunner(config).run_fixture_smoke()
    print(json.dumps(local_run_result_payload(result), sort_keys=True))
    return 0 if result.state in {"dry_run_complete", "submitted"} else 1


def _path_value(
    source: Mapping[str, str],
    key: str,
    default: Path,
    *,
    base: Path | None = None,
) -> Path:
    raw = source.get(key)
    if raw is None or raw == "":
        return default
    path = Path(raw)
    if path.is_absolute():
        return path
    return (base or Path.cwd()) / path


def _read_bool(source: Mapping[str, str], key: str, default: bool) -> bool:
    value = source.get(key)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


if __name__ == "__main__":
    raise SystemExit(main())
