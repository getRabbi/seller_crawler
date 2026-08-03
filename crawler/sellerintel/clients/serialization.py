from __future__ import annotations

import gzip
import json
from io import BytesIO
from typing import Any

from sellerintel.schemas.ingestion import IngestionBatch


def deterministic_json_bytes(batch: IngestionBatch) -> bytes:
    payload = batch.as_payload()
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def deterministic_gzip(payload: bytes) -> bytes:
    buffer = BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buffer, mtime=0) as gzip_file:
        gzip_file.write(payload)
    return buffer.getvalue()


def deterministic_json_loads(payload: bytes) -> dict[str, Any]:
    loaded = json.loads(payload.decode("utf-8"))
    if not isinstance(loaded, dict):
        raise ValueError("serialized batch payload must be a JSON object")
    return loaded
