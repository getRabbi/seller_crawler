from __future__ import annotations

import base64
import hmac
import json
import secrets
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from sellerintel.clients.headers import INGESTION_USER_AGENT
from sellerintel.spool.checksums import sha256_hex
from sellerintel.spool.writer import SpoolRecord


class ReplayHttpResponse(Protocol):
    @property
    def status_code(self) -> int: ...


class ReplayHttpTransport(Protocol):
    def post(
        self,
        url: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> ReplayHttpResponse: ...


@dataclass(frozen=True, slots=True)
class SpoolReplayRequest:
    path: Path
    endpoint_url: str
    body: bytes
    headers: dict[str, str]


@dataclass(frozen=True, slots=True)
class SpoolReplaySummary:
    attempted: int
    accepted: int
    retained: int
    deleted_paths: tuple[Path, ...]


def iter_spool_records(spool_dir: Path) -> Iterator[tuple[Path, SpoolRecord]]:
    if not spool_dir.exists():
        return

    for path in sorted(spool_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"spool record {path} must be a JSON object")
        record = SpoolRecord(**payload)
        compressed_body = decode_spool_body(record)
        if sha256_hex(compressed_body) != record.body_sha256:
            raise ValueError(f"spool record {path} checksum mismatch")
        yield path, record


def decode_spool_body(record: SpoolRecord) -> bytes:
    return base64.b64decode(record.compressed_body_b64.encode("ascii"), validate=True)


def delete_spool_record(path: Path) -> None:
    path.unlink()


def build_spool_replay_request(
    path: Path,
    record: SpoolRecord,
    *,
    hmac_secret: str,
    timestamp: str | None = None,
    nonce: str | None = None,
) -> SpoolReplayRequest:
    body = decode_spool_body(record)
    body_hash = sha256_hex(body)
    if body_hash != record.body_sha256:
        raise ValueError(f"spool record {path} checksum mismatch")
    replay_timestamp = timestamp or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    replay_nonce = nonce or secrets.token_urlsafe(24)
    signature_payload = f"{replay_timestamp}.{replay_nonce}.{body_hash}"
    signature = hmac.new(
        hmac_secret.encode("utf-8"),
        signature_payload.encode("utf-8"),
        "sha256",
    ).hexdigest()
    return SpoolReplayRequest(
        path=path,
        endpoint_url=record.endpoint_url,
        body=body,
        headers={
            "Content-Type": "application/json",
            "Content-Encoding": record.content_encoding,
            "User-Agent": INGESTION_USER_AGENT,
            "Idempotency-Key": record.idempotency_key,
            "X-SI-Timestamp": replay_timestamp,
            "X-SI-Nonce": replay_nonce,
            "X-SI-Signature": signature,
        },
    )


def replay_spool_records(
    spool_dir: Path,
    *,
    hmac_secret: str,
    transport: ReplayHttpTransport | None = None,
    timeout_seconds: float = 10.0,
) -> SpoolReplaySummary:
    from sellerintel.clients.ingestion import TemporaryIngestionError, UrllibHttpTransport

    http = UrllibHttpTransport() if transport is None else transport
    attempted = 0
    accepted = 0
    retained = 0
    deleted_paths: list[Path] = []

    for path, record in iter_spool_records(spool_dir):
        attempted += 1
        request = build_spool_replay_request(path, record, hmac_secret=hmac_secret)
        try:
            response = http.post(
                request.endpoint_url,
                body=request.body,
                headers=request.headers,
                timeout_seconds=timeout_seconds,
            )
        except TemporaryIngestionError:
            retained += 1
            continue
        if response.status_code in {200, 201, 202}:
            delete_spool_record(path)
            accepted += 1
            deleted_paths.append(path)
        else:
            retained += 1

    return SpoolReplaySummary(
        attempted=attempted,
        accepted=accepted,
        retained=retained,
        deleted_paths=tuple(deleted_paths),
    )
