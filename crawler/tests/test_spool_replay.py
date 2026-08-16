from __future__ import annotations

import gzip
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path

from sellerintel.clients.ingestion import HttpResponse
from sellerintel.clients.serialization import deterministic_json_bytes
from sellerintel.spool.replay import replay_spool_records
from sellerintel.spool.writer import build_spool_record, write_spool_record
from test_ingestion_contracts import valid_batch


class ReplayTransport:
    def __init__(self, status: int) -> None:
        self.status = status
        self.requests: list[tuple[bytes, Mapping[str, str]]] = []

    def post(
        self,
        _url: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> HttpResponse:
        assert timeout_seconds > 0
        self.requests.append((body, headers))
        return HttpResponse(self.status, b"{}", {})


def test_spool_replay_uses_normal_ingestion_headers_and_deletes_only_on_acceptance(
    tmp_path: Path,
) -> None:
    batch = valid_batch()
    compressed = gzip.compress(deterministic_json_bytes(batch), mtime=0)
    record = build_spool_record(
        idempotency_key=batch.idempotency_key,
        endpoint_url="https://api.example.test/v1/ingest/batch",
        compressed_body=compressed,
        created_at=datetime.now(UTC).isoformat(),
        attempts=3,
        last_status_code=503,
        last_error="retryable HTTP 503",
    )
    path = write_spool_record(tmp_path, record)
    transport = ReplayTransport(202)

    summary = replay_spool_records(tmp_path, hmac_secret="test-secret", transport=transport)

    assert summary.accepted == 1
    assert not path.exists()
    body, headers = transport.requests[0]
    assert body == compressed
    assert headers["User-Agent"] == "seller-intelligence-crawler/1.0"
    assert headers["Content-Type"] == "application/json"
    assert headers["Content-Encoding"] == "gzip"
    assert headers["Idempotency-Key"] == batch.idempotency_key
    assert headers["X-SI-Timestamp"]
    assert headers["X-SI-Nonce"]
    assert headers["X-SI-Signature"]


def test_spool_replay_retains_record_on_retryable_response(tmp_path: Path) -> None:
    batch = valid_batch()
    compressed = gzip.compress(deterministic_json_bytes(batch), mtime=0)
    path = write_spool_record(
        tmp_path,
        build_spool_record(
            idempotency_key=batch.idempotency_key,
            endpoint_url="https://api.example.test/v1/ingest/batch",
            compressed_body=compressed,
            created_at=datetime.now(UTC).isoformat(),
            attempts=3,
            last_status_code=503,
            last_error="retryable HTTP 503",
        ),
    )

    summary = replay_spool_records(
        tmp_path,
        hmac_secret="test-secret",
        transport=ReplayTransport(503),
    )

    assert summary.retained == 1
    assert path.exists()
