from __future__ import annotations

import base64
import json
import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

CONTACT_CIPHERTEXT_FORMAT = "si-aesgcm:v1"
_KEY_VERSION_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,32}$")
_FIXTURE_KEY_VERSION = "fixture-v1"
_FIXTURE_KEY = bytes.fromhex(
    "9a7e8491deac4e7693f041fd6ddf6eb0d0e0bccdd2f947c48278bfa3446da2ab"
)


class ContactEncryptionConfigError(ValueError):
    """Raised when the contact encryption keyring is absent or invalid."""


@dataclass(frozen=True, slots=True)
class ContactCipher:
    keys: Mapping[str, bytes]
    active_key_version: str

    def __post_init__(self) -> None:
        if self.active_key_version not in self.keys:
            raise ContactEncryptionConfigError("active contact encryption key version is missing")
        for version, key in self.keys.items():
            if not _KEY_VERSION_PATTERN.fullmatch(version):
                raise ContactEncryptionConfigError("contact encryption key version is invalid")
            if len(key) != 32:
                raise ContactEncryptionConfigError("contact encryption keys must be 32 bytes")

    @classmethod
    def from_environment(cls, env: Mapping[str, str]) -> ContactCipher:
        raw_keyring = env.get("CONTACT_ENCRYPTION_KEYS", "")
        active_version = env.get("CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION", "").strip()
        if not raw_keyring or not active_version:
            raise ContactEncryptionConfigError(
                "CONTACT_ENCRYPTION_KEYS and CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION are required"
            )
        try:
            payload = json.loads(raw_keyring)
        except json.JSONDecodeError as error:
            raise ContactEncryptionConfigError(
                "CONTACT_ENCRYPTION_KEYS must be valid JSON"
            ) from error
        if not isinstance(payload, dict) or not payload:
            raise ContactEncryptionConfigError("CONTACT_ENCRYPTION_KEYS must be a non-empty object")

        keys: dict[str, bytes] = {}
        for version, encoded in payload.items():
            if not isinstance(version, str) or not isinstance(encoded, str):
                raise ContactEncryptionConfigError("contact keyring entries must be strings")
            try:
                keys[version] = _decode_base64url(encoded)
            except ValueError as error:
                raise ContactEncryptionConfigError(
                    f"contact encryption key {version!r} is not valid base64url"
                ) from error
        return cls(keys=keys, active_key_version=active_version)

    @classmethod
    def for_fixture_tests(cls) -> ContactCipher:
        return cls(
            keys={_FIXTURE_KEY_VERSION: _FIXTURE_KEY},
            active_key_version=_FIXTURE_KEY_VERSION,
        )

    def encrypt(
        self,
        plaintext: str,
        *,
        contact_id: str,
        seller_id: str,
        contact_type: str,
        nonce: bytes | None = None,
    ) -> str:
        if not plaintext:
            raise ValueError("contact plaintext cannot be empty")
        encryption_nonce = secrets.token_bytes(12) if nonce is None else nonce
        if len(encryption_nonce) != 12:
            raise ValueError("AES-GCM nonce must be 12 bytes")
        aad = contact_aad(
            contact_id=contact_id,
            seller_id=seller_id,
            contact_type=contact_type,
        )
        ciphertext = AESGCM(self.keys[self.active_key_version]).encrypt(
            encryption_nonce,
            plaintext.encode("utf-8"),
            aad,
        )
        return ":".join(
            (
                CONTACT_CIPHERTEXT_FORMAT,
                self.active_key_version,
                _encode_base64url(encryption_nonce),
                _encode_base64url(ciphertext),
            )
        )

    def decrypt(
        self,
        sealed_value: str,
        *,
        contact_id: str,
        seller_id: str,
        contact_type: str,
    ) -> str:
        parts = sealed_value.split(":")
        if len(parts) != 5 or ":".join(parts[:2]) != CONTACT_CIPHERTEXT_FORMAT:
            raise ValueError("unsupported contact ciphertext format")
        key_version = parts[2]
        key = self.keys.get(key_version)
        if key is None:
            raise ContactEncryptionConfigError("contact ciphertext key version is unavailable")
        nonce = _decode_base64url(parts[3])
        ciphertext = _decode_base64url(parts[4])
        if len(nonce) != 12:
            raise ValueError("contact ciphertext nonce is invalid")
        aad = contact_aad(
            contact_id=contact_id,
            seller_id=seller_id,
            contact_type=contact_type,
        )
        return AESGCM(key).decrypt(nonce, ciphertext, aad).decode("utf-8")


def contact_aad(*, contact_id: str, seller_id: str, contact_type: str) -> bytes:
    return (
        f"seller-intelligence-contact|v1|{contact_id}|{seller_id}|{contact_type}"
    ).encode()


def _encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode_base64url(value: str) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("invalid base64url")
    padding = "=" * (-len(value) % 4)
    return base64.b64decode(value + padding, altchars=b"-_", validate=True)
