from __future__ import annotations

import hmac
import json
import logging
import secrets
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from sellerintel.clients.serialization import deterministic_gzip, deterministic_json_bytes
from sellerintel.schemas.ingestion import IngestionBatch
from sellerintel.spool.checksums import sha256_hex
from sellerintel.spool.writer import build_spool_record, write_spool_record

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status_code: int
    body: bytes
    headers: Mapping[str, str]


class HttpTransport(Protocol):
    def post(
        self,
        url: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> HttpResponse: ...


@dataclass(frozen=True, slots=True)
class UrllibHttpTransport:
    def post(
        self,
        url: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> HttpResponse:
        request = Request(url, data=body, headers=dict(headers), method="POST")
        try:
            with urlopen(request, timeout=timeout_seconds) as response:  # nosec B310
                return HttpResponse(
                    status_code=response.status,
                    body=response.read(),
                    headers=dict(response.headers.items()),
                )
        except HTTPError as error:
            return HttpResponse(
                status_code=error.code,
                body=error.read(),
                headers=dict(error.headers.items()),
            )
        except URLError as error:
            reason = getattr(error, "reason", error)
            raise TemporaryIngestionError(str(reason)) from error


@dataclass(frozen=True, slots=True)
class IngestionClientConfig:
    endpoint_url: str
    hmac_secret: str
    spool_dir: Path
    max_attempts: int = 3
    initial_backoff_seconds: float = 0.25
    backoff_multiplier: float = 2.0
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        if not self.endpoint_url:
            raise ValueError("endpoint_url is required")
        if urlparse(self.endpoint_url).scheme not in {"http", "https"}:
            raise ValueError("endpoint_url must use http or https")
        if not self.hmac_secret:
            raise ValueError("hmac_secret is required")
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if self.initial_backoff_seconds < 0:
            raise ValueError("initial_backoff_seconds cannot be negative")
        if self.backoff_multiplier < 1:
            raise ValueError("backoff_multiplier must be at least 1")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")


@dataclass(frozen=True, slots=True)
class IngestionResult:
    accepted: bool
    duplicate: bool
    status_code: int
    idempotency_key: str
    spool_path: Path | None = None


class IngestionError(RuntimeError):
    """Base ingestion client error."""


class TemporaryIngestionError(IngestionError):
    """Raised for network or retryable server failures."""


class IngestionRejectedError(IngestionError):
    """Raised when the Worker rejects a non-retryable batch."""

    def __init__(self, message: str, *, status_code: int, response_body: bytes) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class IngestionClient:
    def __init__(
        self,
        config: IngestionClientConfig,
        *,
        transport: HttpTransport | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._config = config
        self._transport = UrllibHttpTransport() if transport is None else transport
        self._sleep = time.sleep if sleep is None else sleep

    def submit_batch(self, batch: IngestionBatch) -> IngestionResult:
        json_body = deterministic_json_bytes(batch)
        compressed_body = deterministic_gzip(json_body)
        last_status_code: int | None = None
        last_error = "temporary ingestion failure"

        for attempt in range(1, self._config.max_attempts + 1):
            timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
            nonce = secrets.token_urlsafe(24)
            headers = self._signed_headers(
                batch=batch,
                compressed_body=compressed_body,
                timestamp=timestamp,
                nonce=nonce,
            )

            try:
                response = self._transport.post(
                    self._config.endpoint_url,
                    body=compressed_body,
                    headers=headers,
                    timeout_seconds=self._config.timeout_seconds,
                )
            except TemporaryIngestionError as error:
                last_error = str(error)
                self._sleep_before_retry(attempt)
                continue

            last_status_code = response.status_code
            if response.status_code in {200, 201, 202}:
                return IngestionResult(
                    accepted=True,
                    duplicate=response_is_duplicate(response.body),
                    status_code=response.status_code,
                    idempotency_key=batch.idempotency_key,
                )

            if not is_retryable_status(response.status_code):
                raise IngestionRejectedError(
                    f"ingestion rejected with HTTP {response.status_code}",
                    status_code=response.status_code,
                    response_body=response.body,
                )

            last_error = f"retryable HTTP {response.status_code}"
            self._sleep_before_retry(attempt)

        spool_record = build_spool_record(
            idempotency_key=batch.idempotency_key,
            endpoint_url=self._config.endpoint_url,
            compressed_body=compressed_body,
            created_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            attempts=self._config.max_attempts,
            last_status_code=last_status_code,
            last_error=last_error,
        )
        spool_path = write_spool_record(self._config.spool_dir, spool_record)
        LOGGER.warning(
            "spooled ingestion batch idempotency_key=%s status=%s",
            mask_token(batch.idempotency_key),
            last_status_code,
        )
        return IngestionResult(
            accepted=False,
            duplicate=False,
            status_code=last_status_code or 0,
            idempotency_key=batch.idempotency_key,
            spool_path=spool_path,
        )

    def _signed_headers(
        self,
        *,
        batch: IngestionBatch,
        compressed_body: bytes,
        timestamp: str,
        nonce: str,
    ) -> Mapping[str, str]:
        body_hash = sha256_hex(compressed_body)
        signature_payload = f"{timestamp}.{nonce}.{body_hash}"
        signature = hmac.new(
            self._config.hmac_secret.encode("utf-8"),
            signature_payload.encode("utf-8"),
            "sha256",
        ).hexdigest()

        return {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "Idempotency-Key": batch.idempotency_key,
            "X-SI-Timestamp": timestamp,
            "X-SI-Nonce": nonce,
            "X-SI-Signature": signature,
        }

    def _sleep_before_retry(self, attempt: int) -> None:
        if attempt >= self._config.max_attempts:
            return
        delay = self._config.initial_backoff_seconds * (
            self._config.backoff_multiplier ** (attempt - 1)
        )
        self._sleep(delay)


def submit_batch(
    batch: IngestionBatch,
    config: IngestionClientConfig,
    *,
    transport: HttpTransport | None = None,
) -> IngestionResult:
    return IngestionClient(config, transport=transport).submit_batch(batch)


def is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 429} or 500 <= status_code <= 599


def mask_token(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"


def response_is_duplicate(response_body: bytes) -> bool:
    try:
        payload = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    return payload.get("duplicate") is True
