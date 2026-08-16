from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

UUIDV7_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)

UuidV7 = Annotated[str, Field(pattern=UUIDV7_PATTERN)]
NonEmptyStr = Annotated[str, Field(min_length=1)]
ContactCiphertext = Annotated[
    str,
    Field(pattern=r"^si-aesgcm:v1:[A-Za-z0-9._-]{1,32}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$"),
]
SchemaVersion = Annotated[int, Field(ge=1)]
NonNegativeInt = Annotated[int, Field(ge=0)]
Confidence = Annotated[int, Field(ge=0, le=100)]

MAX_BATCH_SELLERS = 25
MAX_BATCH_CONTACTS = 100
MAX_BATCH_WRITES = 20


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class VersionedRecord(ContractModel):
    schema_version: SchemaVersion
    parser_version: NonEmptyStr


class SellerRecord(VersionedRecord):
    id: UuidV7
    canonical_name: NonEmptyStr
    normalized_name: NonEmptyStr
    legal_name: str | None = None
    legal_name_local: str | None = None
    country_code: str | None = None
    province: str | None = None
    city: str | None = None
    address_private: str | None = None
    address_public_masked: str | None = None
    official_domain: str | None = None
    china_confidence: NonNegativeInt = 0
    identity_confidence: NonNegativeInt = 0
    manufacturer_score: int = 0
    trader_score: int = 0
    quality_score: NonNegativeInt = 0
    status: NonEmptyStr = "active"
    first_seen_at: NonEmptyStr
    last_seen_at: NonEmptyStr
    last_material_change_at: str | None = None
    created_at: NonEmptyStr
    updated_at: NonEmptyStr


class MarketplaceAccountRecord(ContractModel):
    id: UuidV7
    seller_id: UuidV7
    marketplace: NonEmptyStr
    merchant_token: str | None = None
    display_name: str | None = None
    profile_url: str | None = None
    storefront_url: str | None = None
    rating: float | None = None
    feedback_count: NonNegativeInt | None = None
    positive_feedback_percent: float | None = None
    country_hint: str | None = None
    first_seen_at: NonEmptyStr
    last_seen_at: NonEmptyStr
    status: NonEmptyStr = "active"


class SellerAliasRecord(ContractModel):
    id: UuidV7
    seller_id: UuidV7
    alias: NonEmptyStr
    normalized_alias: NonEmptyStr
    language_code: str | None = None
    alias_type: NonEmptyStr
    source_id: UuidV7 | None = None
    first_seen_at: NonEmptyStr
    last_seen_at: NonEmptyStr


class ScoreComponentRecord(ContractModel):
    id: UuidV7
    seller_id: UuidV7
    score_type: NonEmptyStr
    rule_code: NonEmptyStr
    points: int
    evidence_source_id: UuidV7 | None = None
    explanation: NonEmptyStr
    observed_at: NonEmptyStr
    parser_version: NonEmptyStr


class ProductLinkRecord(VersionedRecord):
    id: UuidV7
    seller_id: UuidV7
    product_name: NonEmptyStr
    normalized_product_name: NonEmptyStr
    brand: str | None = None
    normalized_brand: str | None = None
    category: str | None = None
    product_url: str | None = None
    source_id: UuidV7 | None = None
    first_seen_at: NonEmptyStr
    last_seen_at: NonEmptyStr
    status: NonEmptyStr = "active"


class ContactRecord(VersionedRecord):
    id: UuidV7
    seller_id: UuidV7
    contact_type: NonEmptyStr
    contact_value_ciphertext: ContactCiphertext
    normalized_hash: NonEmptyStr
    display_value_masked: str | None = None
    classification: NonEmptyStr
    confidence: Confidence
    source_id: UuidV7
    first_seen_at: NonEmptyStr
    last_seen_at: NonEmptyStr
    last_verified_at: str | None = None
    status: NonEmptyStr = "active"
    outreach_eligible: bool = False


class SuppressionRecord(ContractModel):
    id: UuidV7
    seller_id: UuidV7 | None = None
    contact_hash: str | None = None
    domain: str | None = None
    reason: NonEmptyStr
    created_at: NonEmptyStr
    expires_at: str | None = None


class OutreachStateRecord(VersionedRecord):
    id: UuidV7
    seller_id: UuidV7
    contact_id: UuidV7 | None = None
    outreach_status: NonEmptyStr = "not_started"
    channel: str | None = None
    last_outreach_at: str | None = None
    next_allowed_at: str | None = None
    operator_notes: str | None = None
    updated_at: NonEmptyStr


class AuditEventRecord(ContractModel):
    id: UuidV7
    event_type: NonEmptyStr
    entity_type: NonEmptyStr
    entity_id: NonEmptyStr
    actor_id: str | None = None
    old_value_hash: str | None = None
    new_value_hash: str | None = None
    old_value_masked: str | None = None
    new_value_masked: str | None = None
    reason: str | None = None
    metadata_json: str | None = None
    created_at: NonEmptyStr


class SourceRecord(VersionedRecord):
    id: UuidV7
    seller_id: UuidV7 | None = None
    source_url: NonEmptyStr
    canonical_url: NonEmptyStr
    source_domain: NonEmptyStr
    source_type: NonEmptyStr
    robots_status: str | None = None
    terms_risk: str | None = None
    http_status: NonNegativeInt | None = None
    page_title: str | None = None
    evidence_snippet: str | None = None
    content_hash: str | None = None
    r2_object_key: str | None = None
    detected_at: str | None = None
    last_seen_at: str | None = None
    first_seen_at: NonEmptyStr
    last_fetched_at: str | None = None
    last_success_at: str | None = None
    next_allowed_at: str | None = None
    status: NonEmptyStr = "active"


class CrawlRunRecord(ContractModel):
    id: UuidV7
    job_type: NonEmptyStr
    zyte_job_id: str | None = None
    started_at: NonEmptyStr
    finished_at: str | None = None
    status: NonEmptyStr
    requests_total: NonNegativeInt = 0
    responses_success: NonNegativeInt = 0
    candidates_found: NonNegativeInt = 0
    records_created: NonNegativeInt = 0
    records_updated: NonNegativeInt = 0
    contacts_verified: NonNegativeInt = 0
    blocked_count: NonNegativeInt = 0
    error_count: NonNegativeInt = 0
    notes: str | None = None


class ReviewQueueRecord(ContractModel):
    id: UuidV7
    review_type: NonEmptyStr
    entity_id: NonEmptyStr
    priority: NonNegativeInt = 2
    payload_json: NonEmptyStr
    reason: NonEmptyStr
    status: NonEmptyStr = "pending"
    created_at: NonEmptyStr
    reviewed_at: str | None = None
    reviewed_by: str | None = None


class SourceRegistryRecord(ContractModel):
    adapter_name: NonEmptyStr
    source_family: NonEmptyStr
    enabled: bool = False
    risk_level: NonEmptyStr
    robots_policy: NonEmptyStr
    terms_review_status: NonEmptyStr
    daily_request_budget: NonNegativeInt = 0
    concurrency_per_domain: NonNegativeInt = 1
    minimum_delay_seconds: float = 2.5
    blocked_until: str | None = None
    parser_version: NonEmptyStr
    last_success_at: str | None = None
    last_failure_at: str | None = None
    operator_notes: str | None = None


class QuotaStateRecord(ContractModel):
    quota_name: NonEmptyStr
    window_start: NonEmptyStr
    used: NonNegativeInt = 0
    soft_limit: NonNegativeInt
    hard_limit: NonNegativeInt
    updated_at: NonEmptyStr


class FeatureFlagRecord(ContractModel):
    flag_name: NonEmptyStr
    enabled: bool = False
    source: NonEmptyStr = "env_default"
    updated_at: NonEmptyStr
    operator_notes: str | None = None


class FieldHistoryRecord(ContractModel):
    id: UuidV7
    entity_type: NonEmptyStr
    entity_id: NonEmptyStr
    field_name: NonEmptyStr
    old_value_hash: str | None = None
    new_value_hash: str | None = None
    old_value_masked: str | None = None
    new_value_masked: str | None = None
    source_id: UuidV7 | None = None
    observed_at: NonEmptyStr
    crawl_run_id: UuidV7 | None = None
    actor_type: NonEmptyStr = "crawler"
    actor_id: str | None = None
    change_reason: str | None = None
    diff_json: str | None = None
    schema_version: SchemaVersion


class RecentDiffMetadataRecord(ContractModel):
    id: UuidV7
    entity_type: NonEmptyStr
    entity_id: NonEmptyStr
    latest_field_history_id: UuidV7 | None = None
    diff_count_30d: NonNegativeInt = 0
    last_observed_at: NonEmptyStr
    schema_version: SchemaVersion
    updated_at: NonEmptyStr


class IngestionBatch(VersionedRecord):
    crawl_run_id: UuidV7
    batch_number: NonNegativeInt
    generated_at: NonEmptyStr
    sellers: list[SellerRecord] = Field(default_factory=list)
    marketplace_accounts: list[MarketplaceAccountRecord] = Field(default_factory=list)
    seller_aliases: list[SellerAliasRecord] = Field(default_factory=list)
    score_components: list[ScoreComponentRecord] = Field(default_factory=list)
    product_links: list[ProductLinkRecord] = Field(default_factory=list)
    contacts: list[ContactRecord] = Field(default_factory=list)
    suppressions: list[SuppressionRecord] = Field(default_factory=list)
    outreach_states: list[OutreachStateRecord] = Field(default_factory=list)
    audit_events: list[AuditEventRecord] = Field(default_factory=list)
    sources: list[SourceRecord] = Field(default_factory=list)
    crawl_runs: list[CrawlRunRecord] = Field(default_factory=list)
    review_queue_items: list[ReviewQueueRecord] = Field(default_factory=list)
    source_registry: list[SourceRegistryRecord] = Field(default_factory=list)
    quota_states: list[QuotaStateRecord] = Field(default_factory=list)
    feature_flags: list[FeatureFlagRecord] = Field(default_factory=list)
    field_history: list[FieldHistoryRecord] = Field(default_factory=list)
    recent_diff_metadata: list[RecentDiffMetadataRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def enforce_worker_batch_limits(self) -> Self:
        if len(self.sellers) > MAX_BATCH_SELLERS:
            raise ValueError(f"batch contains more than {MAX_BATCH_SELLERS} sellers")
        if len(self.contacts) > MAX_BATCH_CONTACTS:
            raise ValueError(f"batch contains more than {MAX_BATCH_CONTACTS} contacts")
        if self.write_count > MAX_BATCH_WRITES:
            raise ValueError(f"batch contains more than {MAX_BATCH_WRITES} write records")
        return self

    @property
    def idempotency_key(self) -> str:
        return f"{self.crawl_run_id}:{self.batch_number}"

    @property
    def write_count(self) -> int:
        return sum(
            len(records)
            for records in (
                self.sellers,
                self.marketplace_accounts,
                self.seller_aliases,
                self.score_components,
                self.product_links,
                self.contacts,
                self.suppressions,
                self.outreach_states,
                self.audit_events,
                self.sources,
                self.crawl_runs,
                self.review_queue_items,
                self.source_registry,
                self.quota_states,
                self.feature_flags,
                self.field_history,
                self.recent_diff_metadata,
            )
        )

    def as_payload(self) -> Mapping[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)
