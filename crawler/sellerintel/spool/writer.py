from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from sellerintel.spool.checksums import sha256_hex


@dataclass(frozen=True, slots=True)
class SpoolRecord:
    idempotency_key: str
    endpoint_url: str
    content_encoding: str
    body_sha256: str
    compressed_body_b64: str
    created_at: str
    attempts: int
    last_status_code: int | None
    last_error: str


def build_spool_record(
    *,
    idempotency_key: str,
    endpoint_url: str,
    compressed_body: bytes,
    created_at: str,
    attempts: int,
    last_status_code: int | None,
    last_error: str,
) -> SpoolRecord:
    return SpoolRecord(
        idempotency_key=idempotency_key,
        endpoint_url=endpoint_url,
        content_encoding="gzip",
        body_sha256=sha256_hex(compressed_body),
        compressed_body_b64=base64.b64encode(compressed_body).decode("ascii"),
        created_at=created_at,
        attempts=attempts,
        last_status_code=last_status_code,
        last_error=last_error,
    )


def write_spool_record(spool_dir: Path, record: SpoolRecord) -> Path:
    spool_dir.mkdir(parents=True, exist_ok=True)
    target_path = spool_dir / f"{sha256_hex(record.idempotency_key.encode('utf-8'))}.json"
    temp_path = target_path.with_suffix(".json.tmp")
    payload = json.dumps(asdict(record), sort_keys=True, separators=(",", ":")) + "\n"
    temp_path.write_text(payload, encoding="utf-8")
    temp_path.replace(target_path)
    return target_path
