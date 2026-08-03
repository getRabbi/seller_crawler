from __future__ import annotations

import json
from difflib import SequenceMatcher

from sellerintel.entity_resolution.models import (
    AUTO_MERGE_THRESHOLD,
    REVIEW_QUEUE_THRESHOLD,
    MarketplaceIdentity,
    MergeAuditTrail,
    ResolutionAction,
    ResolutionDecision,
    ResolutionScoreComponent,
    RollbackStep,
    SellerIdentity,
)
from sellerintel.normalization.company import normalize_company_name
from sellerintel.normalization.country import normalize_country_code
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.normalization.hashing import deterministic_hash
from sellerintel.normalization.text import normalize_search_text

LINKED_MERGE_TABLES = (
    "marketplace_accounts",
    "seller_aliases",
    "score_components",
    "seller_product_links",
    "contacts",
    "outreach_state",
    "sources",
    "field_history",
)


def classify_resolution_score(score: int) -> ResolutionAction:
    if score >= AUTO_MERGE_THRESHOLD:
        return "auto_merge"
    if score >= REVIEW_QUEUE_THRESHOLD:
        return "review_queue"
    return "no_merge"


def resolve_pair(candidate: SellerIdentity, existing: SellerIdentity) -> ResolutionDecision:
    components = tuple(_score_components(candidate, existing))
    score = _bounded_score(components)
    return ResolutionDecision(
        candidate_seller_id=candidate.seller_id,
        matched_seller_id=existing.seller_id,
        action=classify_resolution_score(score),
        score=score,
        components=components,
    )


def resolve_best_match(
    candidate: SellerIdentity,
    existing_sellers: tuple[SellerIdentity, ...],
) -> ResolutionDecision | None:
    decisions = tuple(resolve_pair(candidate, existing) for existing in existing_sellers)
    if not decisions:
        return None
    return sorted(decisions, key=lambda decision: (-decision.score, decision.matched_seller_id))[0]


def build_merge_audit_trail(decision: ResolutionDecision) -> MergeAuditTrail:
    if decision.action == "no_merge":
        raise ValueError("no_merge decisions do not create merge audit trails")

    rollback_steps = (
        RollbackStep(
            sequence=1,
            operation="restore_source_seller",
            target="sellers",
            description=(
                "Restore the source seller as active and clear any merged-into marker created "
                "from this decision."
            ),
        ),
        RollbackStep(
            sequence=2,
            operation="repoint_linked_rows",
            target=",".join(LINKED_MERGE_TABLES),
            description=(
                "Move rows linked by this merge decision from the target seller back to the "
                "source seller where their audit metadata references the decision."
            ),
        ),
        RollbackStep(
            sequence=3,
            operation="write_rollback_audit",
            target="entity_resolution_decisions",
            description="Record the rollback decision; do not delete canonical or history rows.",
        ),
    )
    return MergeAuditTrail(
        source_seller_id=decision.candidate_seller_id,
        target_seller_id=decision.matched_seller_id,
        decision=decision,
        linked_tables=LINKED_MERGE_TABLES,
        rollback_steps=rollback_steps,
    )


def decision_id(decision: ResolutionDecision) -> str:
    return deterministic_hash(
        json.dumps(decision_payload(decision), sort_keys=True, separators=(",", ":")),
        namespace="entity_resolution_decision",
    )


def decision_payload(decision: ResolutionDecision) -> dict[str, object]:
    return {
        "schema_version": decision.schema_version,
        "parser_version": decision.parser_version,
        "candidate_seller_id": decision.candidate_seller_id,
        "matched_seller_id": decision.matched_seller_id,
        "action": decision.action,
        "score": decision.score,
        "components": score_breakdown(decision),
    }


def score_breakdown(decision: ResolutionDecision) -> list[dict[str, object]]:
    return [
        {
            "rule_code": component.rule_code,
            "points": component.points,
            "explanation": component.explanation,
        }
        for component in decision.components
    ]


def review_queue_payload(decision: ResolutionDecision) -> dict[str, object]:
    return {
        "review_type": "possible_duplicate_seller",
        "entity_id": decision.candidate_seller_id,
        "reason": f"entity_resolution_score_{decision.score}",
        "payload": decision_payload(decision),
    }


def merge_audit_payload(audit_trail: MergeAuditTrail) -> dict[str, object]:
    return {
        "source_seller_id": audit_trail.source_seller_id,
        "target_seller_id": audit_trail.target_seller_id,
        "decision_id": decision_id(audit_trail.decision),
        "action": audit_trail.decision.action,
        "score": audit_trail.decision.score,
        "score_breakdown": score_breakdown(audit_trail.decision),
        "linked_tables": list(audit_trail.linked_tables),
        "rollback_steps": [
            {
                "sequence": step.sequence,
                "operation": step.operation,
                "target": step.target,
                "description": step.description,
            }
            for step in audit_trail.rollback_steps
        ],
    }


def _score_components(
    candidate: SellerIdentity,
    existing: SellerIdentity,
) -> list[ResolutionScoreComponent]:
    components: list[ResolutionScoreComponent] = []

    if _marketplace_keys(candidate.marketplace_accounts) & _marketplace_keys(
        existing.marketplace_accounts
    ):
        components.append(
            ResolutionScoreComponent(
                rule_code="marketplace_token_match",
                points=100,
                explanation="The same marketplace merchant token appears on both sellers.",
            )
        )

    candidate_domain = _normalized_domain(candidate.official_domain)
    existing_domain = _normalized_domain(existing.official_domain)
    if candidate_domain and existing_domain:
        if candidate_domain == existing_domain:
            components.append(
                ResolutionScoreComponent(
                    rule_code="official_domain_match",
                    points=52,
                    explanation="Canonical official domains match exactly.",
                )
            )
        else:
            components.append(
                ResolutionScoreComponent(
                    rule_code="official_domain_conflict",
                    points=-30,
                    explanation="Both sellers have official domains and they differ.",
                )
            )

    candidate_primary = _primary_name(candidate)
    existing_primary = _primary_name(existing)
    candidate_names = _name_values(candidate)
    existing_names = _name_values(existing)
    name_overlap = candidate_names & existing_names

    if candidate_primary and candidate_primary == existing_primary:
        components.append(
            ResolutionScoreComponent(
                rule_code="normalized_name_exact",
                points=40,
                explanation="Primary normalized company names match exactly.",
            )
        )
    elif name_overlap:
        components.append(
            ResolutionScoreComponent(
                rule_code="alias_name_exact",
                points=35,
                explanation="A normalized alias or legal name matches exactly.",
            )
        )
    else:
        fuzzy = _best_name_similarity(candidate_names, existing_names)
        fuzzy_component = _fuzzy_component(fuzzy)
        if fuzzy_component is not None:
            components.append(fuzzy_component)

    contact_overlap = _normalized_set(candidate.contact_hashes) & _normalized_set(
        existing.contact_hashes
    )
    if contact_overlap:
        components.append(
            ResolutionScoreComponent(
                rule_code="contact_hash_overlap",
                points=min(45, 30 + (5 * len(contact_overlap))),
                explanation="One or more normalized public contact hashes overlap.",
            )
        )

    candidate_country = _normalized_country(candidate.country_code)
    existing_country = _normalized_country(existing.country_code)
    if candidate_country and existing_country:
        if candidate_country == existing_country:
            components.append(
                ResolutionScoreComponent(
                    rule_code="country_match",
                    points=6,
                    explanation="Normalized country codes match.",
                )
            )
        else:
            components.append(
                ResolutionScoreComponent(
                    rule_code="country_conflict",
                    points=-18,
                    explanation="Normalized country codes differ.",
                )
            )

    candidate_city = _normalized_text(candidate.city)
    existing_city = _normalized_text(existing.city)
    if candidate_city and existing_city and candidate_country == existing_country:
        if candidate_city == existing_city:
            components.append(
                ResolutionScoreComponent(
                    rule_code="city_match",
                    points=4,
                    explanation="Normalized city names match within the same country.",
                )
            )
        else:
            components.append(
                ResolutionScoreComponent(
                    rule_code="city_conflict",
                    points=-8,
                    explanation="Normalized city names differ within the same country.",
                )
            )

    return components


def _bounded_score(components: tuple[ResolutionScoreComponent, ...]) -> int:
    return max(0, min(100, sum(component.points for component in components)))


def _fuzzy_component(score: float) -> ResolutionScoreComponent | None:
    if score >= 0.96:
        return ResolutionScoreComponent(
            rule_code="name_fuzzy_very_high",
            points=32,
            explanation="Normalized company names are a very high fuzzy match.",
        )
    if score >= 0.90:
        return ResolutionScoreComponent(
            rule_code="name_fuzzy_high",
            points=25,
            explanation="Normalized company names are a high fuzzy match.",
        )
    if score >= 0.84:
        return ResolutionScoreComponent(
            rule_code="name_fuzzy_medium",
            points=18,
            explanation="Normalized company names are a medium fuzzy match.",
        )
    if score >= 0.78:
        return ResolutionScoreComponent(
            rule_code="name_fuzzy_low",
            points=10,
            explanation="Normalized company names are a low fuzzy match.",
        )
    return None


def _best_name_similarity(candidate_names: set[str], existing_names: set[str]) -> float:
    best = 0.0
    for candidate_name in candidate_names:
        for existing_name in existing_names:
            best = max(best, SequenceMatcher(None, candidate_name, existing_name).ratio())
    return best


def _marketplace_keys(
    accounts: tuple[MarketplaceIdentity, ...],
) -> set[tuple[str, str]]:
    return {
        (normalize_search_text(account.marketplace), normalize_search_text(account.merchant_token))
        for account in accounts
        if account.merchant_token
    }


def _name_values(identity: SellerIdentity) -> set[str]:
    values = {
        _primary_name(identity),
        _normalized_company(identity.legal_name),
        *(_normalized_company(alias) for alias in identity.aliases),
    }
    return {value for value in values if value}


def _primary_name(identity: SellerIdentity) -> str | None:
    return _normalized_text(identity.normalized_name) or _normalized_company(
        identity.canonical_name
    )


def _normalized_company(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_company_name(value).normalized
    return normalized or None


def _normalized_domain(value: str | None) -> str | None:
    if value is None:
        return None
    return canonicalize_domain(value)


def _normalized_country(value: str | None) -> str | None:
    if value is None:
        return None
    return normalize_country_code(value)


def _normalized_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_search_text(value)
    return normalized or None


def _normalized_set(values: tuple[str, ...]) -> set[str]:
    return {value.strip().casefold() for value in values if value.strip()}
