from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RiskLevel = Literal["low", "medium", "high"]
RobotsPolicy = Literal["obey", "manual_review_required", "deny"]
TermsRisk = Literal["low", "medium", "high", "restricted"]
TermsReviewStatus = Literal["approved", "pending_review", "restricted"]


@dataclass(frozen=True, slots=True)
class SourcePolicy:
    adapter_name: str
    source_family: str
    enabled: bool
    risk_level: RiskLevel
    robots_policy: RobotsPolicy
    terms_risk: TermsRisk
    terms_review_status: TermsReviewStatus
    concurrency_per_domain: int
    minimum_delay_seconds: float
    blocked_cooldown_seconds: int
    feature_flag: str


DEFAULT_SOURCE_POLICIES: tuple[SourcePolicy, ...] = (
    SourcePolicy(
        adapter_name="official_site",
        source_family="official_site",
        enabled=True,
        risk_level="low",
        robots_policy="obey",
        terms_risk="low",
        terms_review_status="approved",
        concurrency_per_domain=1,
        minimum_delay_seconds=2.5,
        blocked_cooldown_seconds=86_400,
        feature_flag="ENABLE_OFFICIAL_WEBSITE",
    ),
    SourcePolicy(
        adapter_name="business_registry",
        source_family="registry",
        enabled=True,
        risk_level="low",
        robots_policy="obey",
        terms_risk="low",
        terms_review_status="approved",
        concurrency_per_domain=1,
        minimum_delay_seconds=2.5,
        blocked_cooldown_seconds=86_400,
        feature_flag="ENABLE_BUSINESS_REGISTRY",
    ),
    SourcePolicy(
        adapter_name="amazon",
        source_family="marketplace",
        enabled=False,
        risk_level="high",
        robots_policy="manual_review_required",
        terms_risk="high",
        terms_review_status="pending_review",
        concurrency_per_domain=1,
        minimum_delay_seconds=5.0,
        blocked_cooldown_seconds=604_800,
        feature_flag="ENABLE_AMAZON",
    ),
    SourcePolicy(
        adapter_name="alibaba",
        source_family="supplier_directory",
        enabled=False,
        risk_level="medium",
        robots_policy="manual_review_required",
        terms_risk="medium",
        terms_review_status="pending_review",
        concurrency_per_domain=1,
        minimum_delay_seconds=5.0,
        blocked_cooldown_seconds=604_800,
        feature_flag="ENABLE_ALIBABA",
    ),
    SourcePolicy(
        adapter_name="1688",
        source_family="supplier_directory",
        enabled=False,
        risk_level="medium",
        robots_policy="manual_review_required",
        terms_risk="medium",
        terms_review_status="pending_review",
        concurrency_per_domain=1,
        minimum_delay_seconds=5.0,
        blocked_cooldown_seconds=604_800,
        feature_flag="ENABLE_1688",
    ),
    SourcePolicy(
        adapter_name="search_discovery",
        source_family="search_discovery",
        enabled=False,
        risk_level="medium",
        robots_policy="manual_review_required",
        terms_risk="medium",
        terms_review_status="pending_review",
        concurrency_per_domain=1,
        minimum_delay_seconds=5.0,
        blocked_cooldown_seconds=604_800,
        feature_flag="ENABLE_SEARCH_DISCOVERY",
    ),
)
