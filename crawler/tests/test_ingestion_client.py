from __future__ import annotations

import gzip
import hmac
import json
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar, cast

import pytest
from sellerintel.clients.ingestion import (
    HttpResponse,
    IngestionClient,
    IngestionClientConfig,
    IngestionRejectedError,
    TemporaryIngestionError,
)
from sellerintel.spool.checksums import sha256_hex
from sellerintel.spool.replay import decode_spool_body, iter_spool_records
from test_ingestion_contracts import RUN_ID, valid_batch

SECRET = "local-test-secret"


class CapturingTransport:
    def __init__(self, responses: list[HttpResponse | Exception]) -> None:
        self._responses = responses
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
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_client_signs_the_sent_gzip_body(tmp_path: Path) -> None:
    transport = CapturingTransport(
        [HttpResponse(status_code=202, body=b'{"accepted":true,"duplicate":false}', headers={})]
    )
    client = IngestionClient(config(tmp_path), transport=transport, sleep=lambda _delay: None)

    result = client.submit_batch(valid_batch())

    assert result.accepted is True
    assert result.duplicate is False
    body, headers = transport.requests[0]
    payload = json.loads(gzip.decompress(body).decode("utf-8"))
    assert payload["batch_number"] == 1
    assert payload["crawl_run_id"] == RUN_ID
    assert headers["Content-Encoding"] == "gzip"
    assert headers["Idempotency-Key"] == f"{RUN_ID}:1"
    assert verify_signature(headers, body)


def test_client_spools_after_retryable_failures_without_logging_secret(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    transport = CapturingTransport(
        [
            TemporaryIngestionError("connection reset"),
            HttpResponse(
                status_code=503,
                body=b'{"error":{"code":"partition_write_failed"}}',
                headers={},
            ),
        ]
    )
    sleeps: list[float] = []
    cfg = config(tmp_path, max_attempts=2, initial_backoff_seconds=0.5)
    client = IngestionClient(config=cfg, transport=transport, sleep=sleeps.append)

    result = client.submit_batch(valid_batch())

    assert result.accepted is False
    assert result.spool_path is not None
    assert sleeps == [0.5]
    assert SECRET not in caplog.text

    records = list(iter_spool_records(tmp_path))
    assert len(records) == 1
    path, record = records[0]
    assert path == result.spool_path
    assert record.idempotency_key == f"{RUN_ID}:1"
    assert record.last_status_code == 503
    assert sha256_hex(decode_spool_body(record)) == record.body_sha256


def test_client_rejects_non_retryable_worker_errors_without_spooling(tmp_path: Path) -> None:
    transport = CapturingTransport(
        [HttpResponse(status_code=400, body=b'{"error":{"code":"invalid_schema"}}', headers={})]
    )
    client = IngestionClient(config(tmp_path), transport=transport, sleep=lambda _delay: None)

    with pytest.raises(IngestionRejectedError) as error:
        client.submit_batch(valid_batch())

    assert error.value.status_code == 400
    assert list(tmp_path.glob("*.json")) == []


def test_client_posts_to_local_worker_compatible_endpoint(tmp_path: Path) -> None:
    with local_worker_server(SECRET) as server:
        endpoint_url, state = server
        cfg = IngestionClientConfig(
            endpoint_url=endpoint_url,
            hmac_secret=SECRET,
            spool_dir=tmp_path,
            max_attempts=1,
            timeout_seconds=2,
        )

        result = IngestionClient(cfg).submit_batch(valid_batch())

    assert result.accepted is True
    assert state.accepted_payloads == 1
    assert state.idempotency_keys == {f"{RUN_ID}:1"}


def config(
    spool_dir: Path,
    *,
    max_attempts: int = 3,
    initial_backoff_seconds: float = 0.01,
) -> IngestionClientConfig:
    return IngestionClientConfig(
        endpoint_url="http://127.0.0.1:8787/v1/ingest/batch",
        hmac_secret=SECRET,
        spool_dir=spool_dir,
        max_attempts=max_attempts,
        initial_backoff_seconds=initial_backoff_seconds,
        timeout_seconds=1,
    )


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


@dataclass(slots=True)
class LocalWorkerState:
    secret: str
    seen_nonces: set[str] = field(default_factory=set)
    idempotency_keys: set[str] = field(default_factory=set)
    accepted_payloads: int = 0


class LocalWorkerHandler(BaseHTTPRequestHandler):
    state: ClassVar[LocalWorkerState]

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        timestamp = self.headers.get("X-SI-Timestamp", "")
        nonce = self.headers.get("X-SI-Nonce", "")
        signature = self.headers.get("X-SI-Signature", "")
        idempotency_key = self.headers.get("Idempotency-Key", "")

        if nonce in self.state.seen_nonces:
            self._send_json(409, {"error": {"code": "replayed_nonce"}})
            return

        body_hash = sha256_hex(body)
        expected = hmac.new(
            self.state.secret.encode("utf-8"),
            f"{timestamp}.{nonce}.{body_hash}".encode(),
            "sha256",
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            self._send_json(401, {"error": {"code": "invalid_signature"}})
            return

        payload = json.loads(gzip.decompress(body).decode("utf-8"))
        if not isinstance(payload, dict) or "schema_version" not in payload:
            self._send_json(400, {"error": {"code": "invalid_schema"}})
            return

        self.state.seen_nonces.add(nonce)
        self.state.idempotency_keys.add(idempotency_key)
        self.state.accepted_payloads += 1
        self._send_json(
            202,
            {
                "accepted": True,
                "duplicate": False,
                "idempotency_key": idempotency_key,
            },
        )

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _send_json(self, status_code: int, payload: Mapping[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@contextmanager
def local_worker_server(secret: str) -> Iterator[tuple[str, LocalWorkerState]]:
    state = LocalWorkerState(secret=secret)
    LocalWorkerHandler.state = state
    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalWorkerHandler)
    host, port = cast(tuple[str, int], server.server_address)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{host}:{port}/v1/ingest/batch", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
