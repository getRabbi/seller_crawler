from __future__ import annotations

import hmac
import json
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from sellerintel.clients.headers import INGESTION_USER_AGENT
from sellerintel.spool.checksums import sha256_hex


class CooldownCheckError(RuntimeError):
    """Raised when a live cooldown preflight cannot be verified safely."""


@dataclass(frozen=True, slots=True)
class CooldownDecision:
    allowed: bool
    blocked_until: str | None


@dataclass(frozen=True, slots=True)
class CooldownHttpResponse:
    status_code: int
    body: bytes


class CooldownHttpTransport(Protocol):
    def get(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> CooldownHttpResponse: ...


@dataclass(frozen=True, slots=True)
class UrllibCooldownTransport:
    def get(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> CooldownHttpResponse:
        request = Request(url, headers=dict(headers), method="GET")
        try:
            with urlopen(request, timeout=timeout_seconds) as response:  # nosec B310
                return CooldownHttpResponse(response.status, response.read())
        except HTTPError as error:
            return CooldownHttpResponse(error.code, error.read())
        except URLError as error:
            reason = getattr(error, "reason", error)
            raise CooldownCheckError(str(reason)) from error


@dataclass(frozen=True, slots=True)
class CooldownClient:
    endpoint_url: str
    hmac_secret: str
    transport: CooldownHttpTransport | None = None
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        parsed = urlparse(self.endpoint_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("cooldown endpoint must be an absolute HTTP(S) URL")
        if not self.hmac_secret:
            raise ValueError("cooldown HMAC secret is required")

    def check(
        self,
        domain: str,
        *,
        timestamp: str | None = None,
        nonce: str | None = None,
    ) -> CooldownDecision:
        query = urlencode({"adapter": "official_site", "domain": domain})
        url = f"{self.endpoint_url}?{query}"
        checked_at = timestamp or datetime.now(UTC).isoformat().replace("+00:00", "Z")
        request_nonce = nonce or secrets.token_urlsafe(24)
        body_hash = sha256_hex(b"")
        signature = hmac.new(
            self.hmac_secret.encode("utf-8"),
            f"{checked_at}.{request_nonce}.{body_hash}".encode(),
            "sha256",
        ).hexdigest()
        http = self.transport or UrllibCooldownTransport()
        response = http.get(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": INGESTION_USER_AGENT,
                "X-SI-Timestamp": checked_at,
                "X-SI-Nonce": request_nonce,
                "X-SI-Signature": signature,
            },
            timeout_seconds=self.timeout_seconds,
        )
        if response.status_code != 200:
            raise CooldownCheckError(f"cooldown preflight returned HTTP {response.status_code}")
        try:
            payload = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CooldownCheckError("cooldown preflight returned invalid JSON") from error
        if not isinstance(payload, dict) or not isinstance(payload.get("allowed"), bool):
            raise CooldownCheckError("cooldown preflight response is invalid")
        blocked_until = payload.get("blocked_until")
        if blocked_until is not None and not isinstance(blocked_until, str):
            raise CooldownCheckError("cooldown preflight blocked_until is invalid")
        return CooldownDecision(allowed=payload["allowed"], blocked_until=blocked_until)


def cooldown_endpoint_from_ingestion(ingestion_endpoint: str) -> str:
    suffix = "/v1/ingest/batch"
    if not ingestion_endpoint.endswith(suffix):
        raise ValueError("INGESTION_ENDPOINT_URL must end with /v1/ingest/batch")
    return f"{ingestion_endpoint.removesuffix(suffix)}/v1/crawl/authorize"
