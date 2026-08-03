from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sellerintel.clients.serialization import deterministic_gzip, deterministic_json_bytes
from sellerintel.schemas.ingestion import (
    UUIDV7_PATTERN,
    ContactRecord,
    IngestionBatch,
    SellerRecord,
    SourceRecord,
)

RUN_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789aaa"
SELLER_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
CONTACT_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789abd"
SOURCE_ID = "018f2d5e-7b3c-7a1d-8f2e-123456789abe"
OBSERVED_AT = "2026-08-01T00:00:00Z"
CONTRACT_SCHEMA = (
    Path(__file__).resolve().parents[2] / "packages" / "contracts" / "ingestion-batch.schema.json"
)


def test_batch_serialization_is_deterministic() -> None:
    batch = valid_batch()

    first_json = deterministic_json_bytes(batch)
    second_json = deterministic_json_bytes(batch)
    first_gzip = deterministic_gzip(first_json)
    second_gzip = deterministic_gzip(second_json)

    assert first_json == second_json
    assert first_gzip == second_gzip
    assert gzip.decompress(first_gzip) == first_json
    assert batch.idempotency_key == f"{RUN_ID}:1"


def test_contracts_reject_non_uuidv7_identifiers() -> None:
    with pytest.raises(ValidationError):
        SellerRecord(
            id="seller-1",
            canonical_name="Acme Industrial",
            normalized_name="acme industrial",
            schema_version=1,
            parser_version="parser-1",
            first_seen_at=OBSERVED_AT,
            last_seen_at=OBSERVED_AT,
            created_at=OBSERVED_AT,
            updated_at=OBSERVED_AT,
        )


def test_versioned_records_require_schema_version() -> None:
    with pytest.raises(ValidationError, match="schema_version"):
        SellerRecord.model_validate(
            {
                "id": SELLER_ID,
                "canonical_name": "Acme Industrial",
                "normalized_name": "acme industrial",
                "parser_version": "parser-1",
                "first_seen_at": OBSERVED_AT,
                "last_seen_at": OBSERVED_AT,
                "created_at": OBSERVED_AT,
                "updated_at": OBSERVED_AT,
            }
        )


def test_batch_enforces_worker_write_limit() -> None:
    sellers = [
            SellerRecord(
                id=f"018f2d5e-7b3c-7a1d-8f2e-123456789a{index:02x}",
                canonical_name=f"Acme Industrial {index}",
                normalized_name=f"acme industrial {index}",
                schema_version=1,
                parser_version="parser-1",
                first_seen_at=OBSERVED_AT,
                last_seen_at=OBSERVED_AT,
            created_at=OBSERVED_AT,
            updated_at=OBSERVED_AT,
        )
        for index in range(21)
    ]

    with pytest.raises(ValidationError, match="more than 20 write records"):
        IngestionBatch(
            schema_version=1,
            parser_version="parser-1",
            crawl_run_id=RUN_ID,
            batch_number=1,
            generated_at=OBSERVED_AT,
            sellers=sellers,
        )


def test_json_schema_contract_has_strict_nested_types() -> None:
    schema = json.loads(CONTRACT_SCHEMA.read_text(encoding="utf-8"))
    contact_schema = schema["$defs"]["ContactRecord"]

    assert schema["additionalProperties"] is False
    assert contact_schema["additionalProperties"] is False
    assert "schema_version" in schema["required"]
    assert "schema_version" in contact_schema["required"]
    assert contact_schema["properties"]["id"]["pattern"] == UUIDV7_PATTERN
    assert contact_schema["properties"]["parser_version"]["type"] == "string"
    assert contact_schema["properties"]["confidence"]["type"] == "integer"
    assert contact_schema["properties"]["confidence"]["maximum"] == 100


def valid_batch() -> IngestionBatch:
    return IngestionBatch(
        schema_version=1,
        parser_version="parser-1",
        crawl_run_id=RUN_ID,
        batch_number=1,
        generated_at=OBSERVED_AT,
        sellers=[
            SellerRecord(
                id=SELLER_ID,
                canonical_name="Acme Industrial",
                normalized_name="acme industrial",
                country_code="US",
                city="Austin",
                schema_version=1,
                parser_version="parser-1",
                first_seen_at=OBSERVED_AT,
                last_seen_at=OBSERVED_AT,
                created_at=OBSERVED_AT,
                updated_at=OBSERVED_AT,
            )
        ],
        contacts=[
            ContactRecord(
                id=CONTACT_ID,
                seller_id=SELLER_ID,
                contact_type="email",
                contact_value_ciphertext="sealed-contact-value",
                normalized_hash="contact-hash",
                display_value_masked="sa***@example.invalid",
                classification="business_generic",
                confidence=90,
                source_id=SOURCE_ID,
                schema_version=1,
                parser_version="parser-1",
                first_seen_at=OBSERVED_AT,
                last_seen_at=OBSERVED_AT,
            )
        ],
        sources=[
            SourceRecord(
                id=SOURCE_ID,
                seller_id=SELLER_ID,
                source_url="https://example.invalid/seller",
                canonical_url="https://example.invalid/seller",
                source_domain="example.invalid",
                source_type="official_site",
                schema_version=1,
                parser_version="parser-1",
                first_seen_at=OBSERVED_AT,
            )
        ],
    )
