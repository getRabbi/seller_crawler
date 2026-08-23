from __future__ import annotations

import hashlib
import secrets
import time
from datetime import UTC, datetime
from uuid import UUID

from sellerintel.adapters.official_site.enrichment import OfficialPageEnrichment
from sellerintel.normalization.company import normalize_company_name
from sellerintel.normalization.hashing import deterministic_hash
from sellerintel.schemas.ingestion import ContactRecord, SellerRecord, SourceRecord
from sellerintel.security.contact_crypto import ContactCipher

OFFICIAL_SITE_PARSER_VERSION = "official-site-v1"


def deterministic_uuidv7(namespace: str, value: str) -> str:
    digest = list(hashlib.sha256(f"{namespace}:{value}".encode()).hexdigest()[:32])
    digest[12] = "7"
    digest[16] = "8"
    raw = "".join(digest)
    return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"


def new_uuidv7() -> str:
    timestamp_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    value = timestamp_ms << 80
    value |= 0x7 << 76
    value |= secrets.randbits(12) << 64
    value |= 0b10 << 62
    value |= secrets.randbits(62)
    return str(UUID(int=value))


def seller_record_for_domain(
    domain: str,
    *,
    company_name: str,
    observed_at: str,
    seller_id: str | None = None,
) -> SellerRecord:
    normalized = normalize_company_name(company_name)
    canonical_name = normalized.nfkc or domain
    normalized_name = normalized.normalized or domain.replace(".", " ")
    return SellerRecord(
        id=seller_id or deterministic_uuidv7("seller-domain", domain),
        canonical_name=canonical_name,
        normalized_name=normalized_name,
        official_domain=domain,
        identity_confidence=80,
        quality_score=40,
        schema_version=1,
        parser_version=OFFICIAL_SITE_PARSER_VERSION,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
        created_at=observed_at,
        updated_at=observed_at,
    )


def source_record_for_page(
    enrichment: OfficialPageEnrichment,
    *,
    seller_id: str,
    http_status: int,
    robots_status: str,
) -> SourceRecord:
    return SourceRecord(
        id=deterministic_uuidv7("source-url", enrichment.canonical_url),
        seller_id=seller_id,
        source_url=enrichment.canonical_url,
        canonical_url=enrichment.canonical_url,
        source_domain=enrichment.source_domain,
        source_type="official_site",
        robots_status=robots_status,
        terms_risk="low",
        http_status=http_status,
        page_title=enrichment.page_title,
        evidence_snippet=enrichment.evidence_snippet,
        content_hash=enrichment.content_hash,
        detected_at=enrichment.detected_at,
        last_seen_at=enrichment.last_seen_at,
        first_seen_at=enrichment.detected_at,
        last_fetched_at=enrichment.last_seen_at,
        last_success_at=enrichment.last_seen_at if 200 <= http_status < 300 else None,
        schema_version=1,
        parser_version=OFFICIAL_SITE_PARSER_VERSION,
        status="active" if 200 <= http_status < 300 else "error",
    )


def contact_records_for_page(
    enrichment: OfficialPageEnrichment,
    *,
    seller_id: str,
    source_id: str,
    contact_cipher: ContactCipher,
    allowed_contact_types: set[str] | None = None,
) -> list[ContactRecord]:
    records: list[ContactRecord] = []
    for candidate in enrichment.contacts:
        if (
            allowed_contact_types is not None
            and candidate.contact_type not in allowed_contact_types
        ):
            continue
        normalized_hash = deterministic_hash(
            candidate.normalized_value,
            namespace=f"contact:{candidate.contact_type}",
        )
        contact_id = deterministic_uuidv7(
            "contact",
            f"{seller_id}:{candidate.contact_type}:{candidate.normalized_value}",
        )
        records.append(
            ContactRecord(
                id=contact_id,
                seller_id=seller_id,
                contact_type=candidate.contact_type,
                contact_value_ciphertext=contact_cipher.encrypt(
                    candidate.normalized_value,
                    contact_id=contact_id,
                    seller_id=seller_id,
                    contact_type=candidate.contact_type,
                ),
                normalized_hash=normalized_hash,
                display_value_masked=candidate.display_value_masked,
                classification=candidate.classification,
                confidence=candidate.confidence,
                source_id=source_id,
                first_seen_at=enrichment.detected_at,
                last_seen_at=enrichment.last_seen_at,
                last_verified_at=enrichment.last_seen_at,
                schema_version=1,
                parser_version=candidate.parser_version,
                outreach_eligible=False,
            )
        )
    return records


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
