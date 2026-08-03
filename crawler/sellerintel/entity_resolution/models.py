from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SCHEMA_VERSION = 1
PARSER_VERSION = "entity-resolution-v1"

AUTO_MERGE_THRESHOLD = 92
REVIEW_QUEUE_THRESHOLD = 70

ResolutionAction = Literal["auto_merge", "review_queue", "no_merge"]


@dataclass(frozen=True, slots=True)
class MarketplaceIdentity:
    marketplace: str
    merchant_token: str | None = None
    profile_url: str | None = None
    display_name: str | None = None


@dataclass(frozen=True, slots=True)
class SellerIdentity:
    seller_id: str
    canonical_name: str
    normalized_name: str | None = None
    legal_name: str | None = None
    aliases: tuple[str, ...] = ()
    official_domain: str | None = None
    country_code: str | None = None
    city: str | None = None
    marketplace_accounts: tuple[MarketplaceIdentity, ...] = ()
    contact_hashes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ResolutionScoreComponent:
    rule_code: str
    points: int
    explanation: str


@dataclass(frozen=True, slots=True)
class ResolutionDecision:
    candidate_seller_id: str
    matched_seller_id: str
    action: ResolutionAction
    score: int
    components: tuple[ResolutionScoreComponent, ...]
    schema_version: int = SCHEMA_VERSION
    parser_version: str = PARSER_VERSION


@dataclass(frozen=True, slots=True)
class RollbackStep:
    sequence: int
    operation: str
    target: str
    description: str


@dataclass(frozen=True, slots=True)
class MergeAuditTrail:
    source_seller_id: str
    target_seller_id: str
    decision: ResolutionDecision
    linked_tables: tuple[str, ...]
    rollback_steps: tuple[RollbackStep, ...]
