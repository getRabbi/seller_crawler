from __future__ import annotations

import pytest
from sellerintel.config.features import (
    FLAG_CLASSIFICATIONS,
    StartupGateError,
    assert_startup_gates,
    load_runtime_config,
    startup_gate_violations,
)
from sellerintel.spool.checksums import sha256_hex


def test_default_runtime_is_zero_charge_locked() -> None:
    config = load_runtime_config({})

    assert config.runner_mode == "development_locked"
    assert config.live_crawl_enabled is False
    assert config.paid_services_allowed is False
    assert config.max_external_monthly_spend_aud == 0
    assert config.scrapy_cloud_deploy_enabled is False
    assert config.scrapy_cloud_max_units == 1
    assert config.zyte_api_enabled is False
    assert config.github_actions_crawler_enabled is False
    assert config.credit_runner_enabled is False
    assert config.feature_flags["ENABLE_AMAZON"] is False
    assert config.feature_flags["ENABLE_BUSINESS_REGISTRY"] is False
    assert config.feature_flags["ENABLE_OFFICIAL_WEBSITE"] is True
    assert assert_startup_gates(config) == config


def test_rejects_unknown_runner_mode() -> None:
    with pytest.raises(StartupGateError, match="Unknown RUNNER_MODE"):
        load_runtime_config({"RUNNER_MODE": "auto_paid_failover"})


def test_rejects_live_crawl_in_development_lock() -> None:
    config = load_runtime_config({"LIVE_CRAWL_ENABLED": "true"})

    violations = startup_gate_violations(config)

    assert "LIVE_CRAWL_ENABLED must be false in development_locked mode." in violations


def test_rejects_zyte_api_budget_or_enablement() -> None:
    config = load_runtime_config(
        {
            "ZYTE_API_ENABLED": "true",
            "ZYTE_API_DAILY_REQUEST_BUDGET": "1",
            "ZYTE_API_MONTHLY_BUDGET_USD": "1",
        }
    )

    with pytest.raises(StartupGateError, match="Zyte API must remain disabled"):
        assert_startup_gates(config)


def test_rejects_unconfirmed_provider_activation() -> None:
    config = load_runtime_config({"RUNNER_MODE": "zyte_student_active"})

    violations = startup_gate_violations(config)
    assert "Zyte student entitlement is not confirmed." in violations
    assert "Scrapy Cloud deploy is not enabled." in violations


def test_classifies_operational_and_billing_flags_without_overloading_discovery() -> None:
    assert FLAG_CLASSIFICATIONS["ENABLE_AMAZON"] == "functional"
    assert FLAG_CLASSIFICATIONS["ENABLE_OFFICIAL_WEBSITE"] == "functional"
    assert FLAG_CLASSIFICATIONS["ENABLE_EMAIL_EXTRACTION"] == "functional"
    assert FLAG_CLASSIFICATIONS["ENABLE_SEARCH_DISCOVERY"] == "safety_billing"
    assert FLAG_CLASSIFICATIONS["GLOBAL_CRAWL_KILL_SWITCH"] == "safety_billing"


def test_accepted_operator_runtime_enables_amazon_while_paid_paths_stay_locked() -> None:
    config = load_runtime_config(
        {
            "RUNNER_MODE": "zyte_student_active",
            "LIVE_CRAWL_ENABLED": "true",
            "ENABLE_AMAZON": "true",
            "ENABLE_OFFICIAL_WEBSITE": "true",
            "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED": "true",
            "SCRAPY_CLOUD_DEPLOY_ENABLED": "true",
            "SCRAPY_CLOUD_MAX_UNITS": "1",
            "ZYTE_API_ENABLED": "false",
            "PAID_SERVICES_ALLOWED": "false",
            "PAID_ADDONS_ALLOWED": "false",
            "ALLOW_EXTRA_SCRAPY_UNITS": "false",
        }
    )

    assert startup_gate_violations(config) == []
    assert config.feature_flags["ENABLE_AMAZON"] is True
    assert config.zyte_api_enabled is False
    assert config.paid_services_allowed is False


def test_spool_checksum_is_deterministic() -> None:
    assert sha256_hex(b"phase-0") == sha256_hex(b"phase-0")
