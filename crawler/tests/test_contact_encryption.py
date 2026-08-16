from __future__ import annotations

import base64
import json

import pytest
from cryptography.exceptions import InvalidTag
from sellerintel.security.contact_crypto import ContactCipher, ContactEncryptionConfigError

CONTACT_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789abe"
SELLER_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789abc"


def test_contact_cipher_round_trip_is_versioned_and_authenticated() -> None:
    cipher = contact_cipher_fixture()
    sealed = cipher.encrypt(
        "sales@example.test",
        contact_id=CONTACT_ID,
        seller_id=SELLER_ID,
        contact_type="email",
        nonce=b"n" * 12,
    )

    assert sealed.startswith("si-aesgcm:v1:test-v1:")
    assert "sales@example.test" not in sealed
    assert (
        cipher.decrypt(
            sealed,
            contact_id=CONTACT_ID,
            seller_id=SELLER_ID,
            contact_type="email",
        )
        == "sales@example.test"
    )


def test_contact_cipher_rejects_tampering_or_wrong_context() -> None:
    cipher = contact_cipher_fixture()
    sealed = cipher.encrypt(
        "+15551234567",
        contact_id=CONTACT_ID,
        seller_id=SELLER_ID,
        contact_type="phone",
        nonce=b"n" * 12,
    )

    with pytest.raises(InvalidTag):
        cipher.decrypt(
            sealed,
            contact_id=CONTACT_ID,
            seller_id=SELLER_ID,
            contact_type="email",
        )
    with pytest.raises(InvalidTag):
        cipher.decrypt(
            sealed[:-1] + ("A" if sealed[-1] != "A" else "B"),
            contact_id=CONTACT_ID,
            seller_id=SELLER_ID,
            contact_type="phone",
        )


def test_contact_cipher_requires_available_valid_key_version() -> None:
    encoded = base64.urlsafe_b64encode(b"k" * 32).decode().rstrip("=")
    with pytest.raises(ContactEncryptionConfigError, match="active"):
        ContactCipher.from_environment(
            {
                "CONTACT_ENCRYPTION_KEYS": json.dumps({"old-v1": encoded}),
                "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION": "missing-v2",
            }
        )


def test_ciphertext_can_be_decrypted_after_active_key_rotation() -> None:
    old_cipher = ContactCipher(keys={"old-v1": b"o" * 32}, active_key_version="old-v1")
    sealed = old_cipher.encrypt(
        "fixture-wechat",
        contact_id=CONTACT_ID,
        seller_id=SELLER_ID,
        contact_type="wechat",
        nonce=b"n" * 12,
    )
    rotated = ContactCipher(
        keys={"old-v1": b"o" * 32, "new-v2": b"2" * 32},
        active_key_version="new-v2",
    )

    assert (
        rotated.decrypt(
            sealed,
            contact_id=CONTACT_ID,
            seller_id=SELLER_ID,
            contact_type="wechat",
        )
        == "fixture-wechat"
    )


def contact_cipher_fixture() -> ContactCipher:
    return ContactCipher(keys={"test-v1": b"k" * 32}, active_key_version="test-v1")
