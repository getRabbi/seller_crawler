from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path

import pytest
from sellerintel.entity_resolution import (
    MarketplaceIdentity,
    SellerIdentity,
    build_merge_audit_trail,
    classify_resolution_score,
    decision_id,
    merge_audit_payload,
    resolve_best_match,
    resolve_pair,
    review_queue_payload,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "entity_resolution"


def test_thresholds_are_exact_and_deterministic() -> None:
    assert classify_resolution_score(100) == "auto_merge"
    assert classify_resolution_score(92) == "auto_merge"
    assert classify_resolution_score(91) == "review_queue"
    assert classify_resolution_score(70) == "review_queue"
    assert classify_resolution_score(69) == "no_merge"


def test_exact_resolution_auto_merges_with_transparent_breakdown() -> None:
    candidate, existing = fixture_pair("auto_merge")

    decision = resolve_pair(candidate, existing)
    component_codes = {component.rule_code for component in decision.components}

    assert decision.action == "auto_merge"
    assert decision.score >= 92
    assert component_codes == {
        "official_domain_match",
        "normalized_name_exact",
        "country_match",
        "city_match",
    }
    assert decision_id(decision) == decision_id(resolve_pair(candidate, existing))

    audit_trail = build_merge_audit_trail(decision)
    audit_payload = merge_audit_payload(audit_trail)
    rollback_steps = list_value(audit_payload["rollback_steps"])

    assert audit_trail.source_seller_id == candidate.seller_id
    assert audit_trail.target_seller_id == existing.seller_id
    assert audit_payload["decision_id"] == decision_id(decision)
    assert "seller_product_links" in audit_trail.linked_tables
    assert mapping(rollback_steps[0])["operation"] == "restore_source_seller"
    assert mapping(rollback_steps[-1])["target"] == "entity_resolution_decisions"


def test_contact_and_name_overlap_routes_to_review_queue() -> None:
    candidate, existing = fixture_pair("review_queue")

    decision = resolve_pair(candidate, existing)
    payload = review_queue_payload(decision)
    nested_payload = mapping(payload["payload"])

    assert decision.action == "review_queue"
    assert 70 <= decision.score <= 91
    assert payload["review_type"] == "possible_duplicate_seller"
    assert payload["entity_id"] == candidate.seller_id
    assert nested_payload["score"] == decision.score
    assert "hash-public-sales" not in json.dumps(payload)


def test_conflicts_below_threshold_do_not_create_merge_audit() -> None:
    candidate, existing = fixture_pair("no_merge")

    decision = resolve_pair(candidate, existing)
    component_codes = {component.rule_code for component in decision.components}

    assert decision.action == "no_merge"
    assert decision.score < 70
    assert "official_domain_conflict" in component_codes
    assert "country_conflict" in component_codes
    with pytest.raises(ValueError, match="no_merge"):
        build_merge_audit_trail(decision)


def test_best_match_uses_score_then_stable_seller_id_tiebreak() -> None:
    candidate = SellerIdentity(
        seller_id="candidate",
        canonical_name="Fixture Export Limited",
        official_domain="fixture-export.testmail",
    )
    first = SellerIdentity(
        seller_id="existing-b",
        canonical_name="Fixture Export Co., Ltd.",
        official_domain="fixture-export.testmail",
    )
    second = SellerIdentity(
        seller_id="existing-a",
        canonical_name="Fixture Export Co., Ltd.",
        official_domain="fixture-export.testmail",
    )

    decision = resolve_best_match(candidate, (first, second))

    assert decision is not None
    assert decision.matched_seller_id == "existing-a"


def test_marketplace_token_match_can_auto_merge_when_not_conflicted() -> None:
    candidate = SellerIdentity(
        seller_id="candidate",
        canonical_name="Display Seller",
        marketplace_accounts=(
            MarketplaceIdentity(marketplace="amazon", merchant_token="A1FIXTURE"),
        ),
    )
    existing = SellerIdentity(
        seller_id="existing",
        canonical_name="Different Display Seller",
        marketplace_accounts=(
            MarketplaceIdentity(marketplace="Amazon", merchant_token="a1fixture"),
        ),
    )

    decision = resolve_pair(candidate, existing)

    assert decision.action == "auto_merge"
    assert decision.score == 100


def fixture_pair(name: str) -> tuple[SellerIdentity, SellerIdentity]:
    root = mapping(json.loads((FIXTURES / "seller_pairs.json").read_text(encoding="utf-8")))
    pair = mapping(root[name])
    return seller_identity(pair["candidate"]), seller_identity(pair["existing"])


def seller_identity(raw: object) -> SellerIdentity:
    data = mapping(raw)
    return SellerIdentity(
        seller_id=string_value(data["seller_id"]),
        canonical_name=string_value(data["canonical_name"]),
        normalized_name=optional_string(data.get("normalized_name")),
        legal_name=optional_string(data.get("legal_name")),
        aliases=string_tuple(data.get("aliases")),
        official_domain=optional_string(data.get("official_domain")),
        country_code=optional_string(data.get("country_code")),
        city=optional_string(data.get("city")),
        contact_hashes=string_tuple(data.get("contact_hashes")),
    )


def mapping(raw: object) -> Mapping[str, object]:
    if not isinstance(raw, Mapping):
        raise AssertionError("expected object mapping")
    return raw


def list_value(raw: object) -> list[object]:
    if not isinstance(raw, list):
        raise AssertionError("expected list")
    return raw


def string_value(raw: object) -> str:
    if not isinstance(raw, str):
        raise AssertionError("expected string")
    return raw


def optional_string(raw: object) -> str | None:
    if raw is None:
        return None
    return string_value(raw)


def string_tuple(raw: object) -> tuple[str, ...]:
    if raw is None:
        return ()
    values = list_value(raw)
    return tuple(string_value(value) for value in values)
