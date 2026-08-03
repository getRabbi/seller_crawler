from __future__ import annotations

import gzip
import hmac
from collections.abc import Mapping
from pathlib import Path

from sellerintel.clients.ingestion import HttpResponse, IngestionResult, TemporaryIngestionError
from sellerintel.clients.serialization import deterministic_gzip, deterministic_json_bytes
from sellerintel.runtime.local import (
    FIXTURE_SMOKE_RUN_ID,
    LocalRunner,
    LocalRunnerConfig,
    build_fixture_smoke_batch,
    load_local_runner_config,
    validate_local_runner_readiness,
)
from sellerintel.schemas.ingestion import IngestionBatch
from sellerintel.spool import build_spool_record, replay_spool_records, write_spool_record
from sellerintel.spool.checksums import sha256_hex

SECRET = "local-runner-secret"


class FakeSubmitter:
    def __init__(self) -> None:
        self.idempotency_keys: list[str] = []

    def submit_batch(self, batch: IngestionBatch) -> IngestionResult:
        idempotency_key = batch.idempotency_key
        self.idempotency_keys.append(idempotency_key)
        return IngestionResult(
            accepted=True,
            duplicate=False,
            status_code=202,
            idempotency_key=idempotency_key,
        )


class CapturingTransport:
    def __init__(self, response: HttpResponse | Exception) -> None:
        self._response = response
        self.requests: list[tuple[bytes, Mapping[str, str]]] = []

    def post(
        self,
        url: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> HttpResponse:
        assert url
        assert timeout_seconds > 0
        self.requests.append((body, headers))
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def test_dry_run_fixture_smoke_uses_lock_and_does_not_require_secret(tmp_path: Path) -> None:
    config = local_config(tmp_path)

    result = LocalRunner(config).run_fixture_smoke(
        build_fixture_smoke_batch(generated_at="2026-08-03T00:00:00Z")
    )

    assert result.state == "dry_run_complete"
    assert result.fixture_only is True
    assert result.dry_run is True
    assert result.idempotency_key == f"{FIXTURE_SMOKE_RUN_ID}:0"
    assert config.lock_path.exists() is False


def test_local_runner_rejects_second_job_when_lock_exists(tmp_path: Path) -> None:
    config = local_config(tmp_path)
    config.lock_path.parent.mkdir(parents=True)
    config.lock_path.write_text("pid=fixture\n", encoding="utf-8")

    result = LocalRunner(config).run_fixture_smoke()

    assert result.state == "busy"
    assert result.errors
    assert config.lock_path.exists() is True


def test_local_runner_readiness_blocks_kill_switch_and_browser_profiles(tmp_path: Path) -> None:
    config = local_config(
        tmp_path,
        {
            "GLOBAL_CRAWL_KILL_SWITCH": "true",
            "BROWSER_PROFILE_PATH": "C:\\Users\\User\\BrowserProfile",
        },
    )

    validation = validate_local_runner_readiness(config)

    assert validation.ok is False
    assert "GLOBAL_CRAWL_KILL_SWITCH is active." in validation.errors
    assert "Personal browser profiles and cookie files are forbidden." in validation.errors


def test_non_dry_run_requires_ingestion_settings_and_can_submit_fixture_batch(
    tmp_path: Path,
) -> None:
    blocked = local_config(tmp_path, {"LOCAL_RUNNER_DRY_RUN": "false"})

    validation = validate_local_runner_readiness(blocked)

    assert validation.ok is False
    assert (
        "INGESTION_ENDPOINT_URL is required when LOCAL_RUNNER_DRY_RUN=false."
        in validation.errors
    )
    assert (
        "INGESTION_HMAC_SECRET is required when LOCAL_RUNNER_DRY_RUN=false."
        in validation.errors
    )

    submitter = FakeSubmitter()
    ready = local_config(
        tmp_path,
        {
            "LOCAL_RUNNER_DRY_RUN": "false",
            "INGESTION_ENDPOINT_URL": "http://127.0.0.1:8787/v1/ingest/batch",
            "INGESTION_HMAC_SECRET": SECRET,
        },
    )

    result = LocalRunner(ready, submitter=submitter).run_fixture_smoke()

    assert result.state == "submitted"
    assert result.accepted is True
    assert submitter.idempotency_keys == [f"{FIXTURE_SMOKE_RUN_ID}:0"]


def test_spool_replay_resigns_body_with_same_idempotency_key_and_new_nonce(
    tmp_path: Path,
) -> None:
    batch = build_fixture_smoke_batch(generated_at="2026-08-03T00:00:00Z")
    compressed_body = deterministic_gzip(deterministic_json_bytes(batch))
    record = build_spool_record(
        idempotency_key=batch.idempotency_key,
        endpoint_url="http://127.0.0.1:8787/v1/ingest/batch",
        compressed_body=compressed_body,
        created_at="2026-08-03T00:01:00Z",
        attempts=3,
        last_status_code=503,
        last_error="retryable HTTP 503",
    )
    path = write_spool_record(tmp_path, record)
    transport = CapturingTransport(HttpResponse(status_code=202, body=b"{}", headers={}))

    summary = replay_spool_records(tmp_path, hmac_secret=SECRET, transport=transport)

    assert summary.attempted == 1
    assert summary.accepted == 1
    assert summary.retained == 0
    assert path.exists() is False
    body, headers = transport.requests[0]
    assert gzip.decompress(body) == deterministic_json_bytes(batch)
    assert headers["Idempotency-Key"] == batch.idempotency_key
    assert headers["X-SI-Nonce"]
    assert verify_signature(headers, body)


def test_spool_replay_retains_record_after_temporary_failure(tmp_path: Path) -> None:
    batch = build_fixture_smoke_batch(generated_at="2026-08-03T00:00:00Z")
    compressed_body = deterministic_gzip(deterministic_json_bytes(batch))
    path = write_spool_record(
        tmp_path,
        build_spool_record(
            idempotency_key=batch.idempotency_key,
            endpoint_url="http://127.0.0.1:8787/v1/ingest/batch",
            compressed_body=compressed_body,
            created_at="2026-08-03T00:01:00Z",
            attempts=3,
            last_status_code=None,
            last_error="connection reset",
        ),
    )
    transport = CapturingTransport(TemporaryIngestionError("connection reset"))

    summary = replay_spool_records(tmp_path, hmac_secret=SECRET, transport=transport)

    assert summary.attempted == 1
    assert summary.accepted == 0
    assert summary.retained == 1
    assert path.exists() is True


def test_dockerfile_keeps_local_runner_fixture_locked() -> None:
    dockerfile = Path(__file__).resolve().parents[2] / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")

    assert "RUNNER_MODE=development_locked" in content
    assert "LOCAL_RUNNER_FIXTURE_ONLY=true" in content
    assert "LOCAL_RUNNER_DRY_RUN=true" in content
    assert "ZYTE_API_ENABLED=false" in content


def local_config(tmp_path: Path, overrides: dict[str, str] | None = None) -> LocalRunnerConfig:
    env = {
        "SELLERINTEL_WORKSPACE_ROOT": str(tmp_path),
        "LOCAL_SPOOL_DIR": str(tmp_path / "spool"),
        "LOCAL_RUNNER_LOCK_PATH": str(tmp_path / "locks" / "local.lock"),
    }
    if overrides:
        env.update(overrides)
    return load_local_runner_config(env)


def verify_signature(headers: Mapping[str, str], body: bytes) -> bool:
    timestamp = headers["X-SI-Timestamp"]
    nonce = headers["X-SI-Nonce"]
    body_hash = sha256_hex(body)
    signature_payload = f"{timestamp}.{nonce}.{body_hash}"
    expected = hmac.new(
        SECRET.encode("utf-8"),
        signature_payload.encode("utf-8"),
        "sha256",
    ).hexdigest()
    return hmac.compare_digest(expected, headers["X-SI-Signature"])
