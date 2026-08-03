from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import timedelta

from sellerintel.adapters import PolicyBackedAdapter, Seed, default_adapter_registry
from sellerintel.adapters.base import AdapterResponse, is_blocked_response
from sellerintel.config.features import load_runtime_config
from sellerintel.config.sources import DEFAULT_SOURCE_POLICIES, SourcePolicy


@dataclass(frozen=True, slots=True)
class SyntheticResponse:
    url: str
    status: int
    text: str
    headers: Mapping[str, str]


def test_default_source_policies_include_required_risk_and_crawl_controls() -> None:
    policies = {policy.adapter_name: policy for policy in DEFAULT_SOURCE_POLICIES}

    assert policies["official_site"].enabled is True
    assert policies["official_site"].risk_level == "low"
    assert policies["official_site"].robots_policy == "obey"
    assert policies["official_site"].terms_risk == "low"
    assert policies["official_site"].concurrency_per_domain == 1
    assert policies["official_site"].blocked_cooldown_seconds == 86_400

    assert policies["amazon"].enabled is False
    assert policies["amazon"].source_family == "marketplace"
    assert policies["amazon"].terms_review_status == "pending_review"
    assert policies["alibaba"].enabled is False
    assert policies["1688"].enabled is False


def test_registry_enables_only_policy_and_feature_allowed_adapters() -> None:
    registry = default_adapter_registry()
    default_config = load_runtime_config({})
    amazon_flag_config = load_runtime_config({"ENABLE_AMAZON": "true"})
    official_disabled_config = load_runtime_config({"ENABLE_OFFICIAL_WEBSITE": "false"})

    assert registry.names() == (
        "1688",
        "alibaba",
        "amazon",
        "business_registry",
        "official_site",
        "search_discovery",
    )
    assert [adapter.name for adapter in registry.enabled_adapters(default_config)] == [
        "business_registry",
        "official_site",
    ]
    amazon_enabled_names = [
        adapter.name for adapter in registry.enabled_adapters(amazon_flag_config)
    ]
    assert "amazon" not in amazon_enabled_names
    assert [adapter.name for adapter in registry.enabled_adapters(official_disabled_config)] == [
        "business_registry"
    ]


def test_adapter_url_policy_rejects_evasion_primitives() -> None:
    adapter = PolicyBackedAdapter(DEFAULT_SOURCE_POLICIES[0])

    assert adapter.explain_url_policy("https://example.test/contact").allowed is True
    assert adapter.explain_url_policy("ftp://example.test/contact").allowed is False
    assert adapter.explain_url_policy("https://user:pass@example.test/contact").allowed is False
    assert adapter.explain_url_policy("https://localhost/contact").allowed is False


def test_restricted_terms_or_robots_policy_blocks_requests() -> None:
    policy = DEFAULT_SOURCE_POLICIES[0]
    restricted_policy: SourcePolicy = replace(policy, terms_risk="restricted")
    denied_robots_policy: SourcePolicy = replace(policy, robots_policy="deny")

    assert PolicyBackedAdapter(restricted_policy).is_allowed("https://example.test") is False
    assert PolicyBackedAdapter(denied_robots_policy).is_allowed("https://example.test") is False


def test_build_requests_is_policy_checked_and_side_effect_free() -> None:
    adapter = PolicyBackedAdapter(DEFAULT_SOURCE_POLICIES[0])

    allowed = tuple(
        adapter.build_requests(Seed(url="https://example.test/contact", seller_id="s1"))
    )
    blocked = tuple(adapter.build_requests(Seed(url="https://localhost/contact", seller_id="s1")))

    assert len(allowed) == 1
    assert allowed[0].adapter_name == "official_site"
    assert allowed[0].metadata == {"seller_id": "s1"}
    assert blocked == ()


def test_blocked_response_detection_and_cooldown_behavior() -> None:
    adapter = PolicyBackedAdapter(DEFAULT_SOURCE_POLICIES[0])
    captcha = response(status=200, text="Please verify you are human before continuing")
    forbidden = response(status=403, text="Forbidden")
    rate_limited = response(status=429, text="Too many requests")
    ok = response(status=200, text="Company contact page")

    assert is_blocked_response(captcha) is True
    assert is_blocked_response(forbidden) is True
    assert adapter.cooldown_for(captcha) == timedelta(seconds=86_400)
    assert adapter.cooldown_for(forbidden) == timedelta(seconds=86_400)
    assert adapter.cooldown_for(rate_limited) == timedelta(hours=1)
    assert adapter.cooldown_for(ok) == timedelta(seconds=2.5)


def response(status: int, text: str) -> AdapterResponse:
    return SyntheticResponse(
        url="https://example.test/contact",
        status=status,
        text=text,
        headers={},
    )
