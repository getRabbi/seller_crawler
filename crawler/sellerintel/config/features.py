from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

type RunnerMode = str
type FlagClassification = Literal["functional", "safety_billing", "test_only"]

ALLOWED_RUNNER_MODES: frozenset[str] = frozenset(
    {
        "development_locked",
        "zyte_entitlement_pending",
        "zyte_student_active",
        "fallback_local",
        "fallback_actions_burst",
        "fallback_credit_container",
        "paused_by_operator",
        "paused_by_policy",
        "paused_by_quota",
    }
)

DEFAULT_FEATURE_FLAGS: dict[str, bool] = {
    "ENABLE_AMAZON": False,
    "ENABLE_ALIBABA": False,
    "ENABLE_1688": False,
    "ENABLE_BUSINESS_REGISTRY": False,
    "ENABLE_OFFICIAL_WEBSITE": True,
    "ENABLE_SEARCH_DISCOVERY": False,
    "ENABLE_LOCAL_PLAYWRIGHT": False,
    "ENABLE_EMAIL_EXTRACTION": True,
    "ENABLE_PHONE_EXTRACTION": True,
    "ENABLE_WHATSAPP_EXTRACTION": True,
    "ENABLE_WECHAT_EXTRACTION": True,
    "ENABLE_AI_SUMMARY": False,
    "ENABLE_OUTREACH": False,
    "GLOBAL_CRAWL_KILL_SWITCH": False,
}

FLAG_CLASSIFICATIONS: dict[str, FlagClassification] = {
    "ENABLE_AMAZON": "functional",
    "ENABLE_OFFICIAL_WEBSITE": "functional",
    "ENABLE_EMAIL_EXTRACTION": "functional",
    "ENABLE_PHONE_EXTRACTION": "functional",
    "ENABLE_WHATSAPP_EXTRACTION": "functional",
    "ENABLE_WECHAT_EXTRACTION": "functional",
    "ENABLE_SEARCH_DISCOVERY": "safety_billing",
    "ENABLE_ALIBABA": "safety_billing",
    "ENABLE_1688": "safety_billing",
    "ENABLE_BUSINESS_REGISTRY": "safety_billing",
    "ENABLE_LOCAL_PLAYWRIGHT": "test_only",
    "ENABLE_AI_SUMMARY": "safety_billing",
    "ENABLE_OUTREACH": "safety_billing",
    "GLOBAL_CRAWL_KILL_SWITCH": "safety_billing",
}


class StartupGateError(ValueError):
    """Raised when a runtime configuration violates provider or zero-charge gates."""


@dataclass(frozen=True, slots=True)
class RuntimeConfig:
    runner_mode: RunnerMode
    live_crawl_enabled: bool
    paid_services_allowed: bool
    max_external_monthly_spend_aud: int
    allow_extra_scrapy_units: bool
    allow_paid_github_actions_minutes: bool
    allow_paid_addons: bool
    zyte_student_entitlement_confirmed: bool
    scrapy_cloud_deploy_enabled: bool
    scrapy_cloud_max_units: int
    zyte_api_enabled: bool
    zyte_api_daily_request_budget: int
    zyte_api_monthly_budget_usd: int
    github_actions_crawler_enabled: bool
    github_actions_included_minutes_confirmed: bool
    credit_runner_enabled: bool
    credit_runner_monthly_cap_aud: int
    credit_runner_auto_shutdown: bool
    feature_flags: Mapping[str, bool]


def _read_bool(env: Mapping[str, str], key: str, default: bool) -> bool:
    value = env.get(key)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _read_int(env: Mapping[str, str], key: str, default: int) -> int:
    value = env.get(key)
    if value is None or value == "":
        return default
    return int(value)


def load_runtime_config(env: Mapping[str, str] | None = None) -> RuntimeConfig:
    source = os.environ if env is None else env
    runner_mode = source.get("RUNNER_MODE", "development_locked")
    if runner_mode not in ALLOWED_RUNNER_MODES:
        raise StartupGateError(f"Unknown RUNNER_MODE: {runner_mode}")

    feature_flags = {
        key: _read_bool(source, key, default) for key, default in DEFAULT_FEATURE_FLAGS.items()
    }

    return RuntimeConfig(
        runner_mode=runner_mode,
        live_crawl_enabled=_read_bool(source, "LIVE_CRAWL_ENABLED", False),
        paid_services_allowed=_read_bool(source, "PAID_SERVICES_ALLOWED", False),
        max_external_monthly_spend_aud=_read_int(source, "MAX_EXTERNAL_MONTHLY_SPEND_AUD", 0),
        allow_extra_scrapy_units=_read_bool(source, "ALLOW_EXTRA_SCRAPY_UNITS", False),
        allow_paid_github_actions_minutes=_read_bool(
            source,
            "ALLOW_PAID_GITHUB_ACTIONS_MINUTES",
            False,
        ),
        allow_paid_addons=(
            _read_bool(source, "ALLOW_PAID_ADDONS", False)
            or _read_bool(source, "PAID_ADDONS_ALLOWED", False)
        ),
        zyte_student_entitlement_confirmed=_read_bool(
            source,
            "ZYTE_STUDENT_ENTITLEMENT_CONFIRMED",
            False,
        ),
        scrapy_cloud_deploy_enabled=_read_bool(source, "SCRAPY_CLOUD_DEPLOY_ENABLED", False),
        scrapy_cloud_max_units=_read_int(source, "SCRAPY_CLOUD_MAX_UNITS", 1),
        zyte_api_enabled=_read_bool(source, "ZYTE_API_ENABLED", False),
        zyte_api_daily_request_budget=_read_int(source, "ZYTE_API_DAILY_REQUEST_BUDGET", 0),
        zyte_api_monthly_budget_usd=_read_int(source, "ZYTE_API_MONTHLY_BUDGET_USD", 0),
        github_actions_crawler_enabled=_read_bool(
            source,
            "GITHUB_ACTIONS_CRAWLER_ENABLED",
            False,
        ),
        github_actions_included_minutes_confirmed=_read_bool(
            source,
            "GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED",
            False,
        ),
        credit_runner_enabled=_read_bool(source, "CREDIT_RUNNER_ENABLED", False),
        credit_runner_monthly_cap_aud=_read_int(source, "CREDIT_RUNNER_MONTHLY_CAP_AUD", 0),
        credit_runner_auto_shutdown=_read_bool(source, "CREDIT_RUNNER_AUTO_SHUTDOWN", True),
        feature_flags=feature_flags,
    )


def startup_gate_violations(config: RuntimeConfig) -> list[str]:
    violations: list[str] = []

    if not config.paid_services_allowed:
        if config.max_external_monthly_spend_aud != 0:
            violations.append("MAX_EXTERNAL_MONTHLY_SPEND_AUD must be 0.")
        if config.scrapy_cloud_max_units > 1 or config.allow_extra_scrapy_units:
            violations.append("Scrapy Cloud is limited to one unit.")
        if (
            config.zyte_api_enabled
            or config.zyte_api_daily_request_budget != 0
            or config.zyte_api_monthly_budget_usd != 0
        ):
            violations.append("Zyte API must remain disabled with zero request and spend budgets.")
        if config.allow_paid_github_actions_minutes:
            violations.append("Paid GitHub Actions minutes are not allowed.")
        if config.allow_paid_addons:
            violations.append("Paid add-ons are not allowed.")
        if config.credit_runner_enabled:
            violations.append("Credit runner requires explicit credit and zero-overage guards.")

    if config.runner_mode == "development_locked" and config.live_crawl_enabled:
        violations.append("LIVE_CRAWL_ENABLED must be false in development_locked mode.")

    deferred_flags = (
        "ENABLE_ALIBABA",
        "ENABLE_1688",
        "ENABLE_BUSINESS_REGISTRY",
        "ENABLE_SEARCH_DISCOVERY",
        "ENABLE_LOCAL_PLAYWRIGHT",
        "ENABLE_AI_SUMMARY",
        "ENABLE_OUTREACH",
    )
    enabled_deferred = [flag for flag in deferred_flags if config.feature_flags.get(flag, False)]
    if enabled_deferred:
        violations.append(
            f"Deferred Solo v1 features must remain disabled: {', '.join(enabled_deferred)}."
        )
    if not config.feature_flags.get("ENABLE_OFFICIAL_WEBSITE", False):
        violations.append("ENABLE_OFFICIAL_WEBSITE must remain true for Solo v1.")

    if config.runner_mode == "zyte_student_active":
        if not config.zyte_student_entitlement_confirmed:
            violations.append("Zyte student entitlement is not confirmed.")
        if not config.scrapy_cloud_deploy_enabled:
            violations.append("Scrapy Cloud deploy is not enabled.")
        if config.scrapy_cloud_max_units != 1:
            violations.append("Zyte runner must use exactly one Scrapy Cloud unit.")

    if (
        config.runner_mode == "fallback_actions_burst"
        and not config.github_actions_included_minutes_confirmed
    ):
        violations.append("Actions burst requires confirmed included-minute availability.")

    return violations


def assert_startup_gates(config: RuntimeConfig | None = None) -> RuntimeConfig:
    checked = load_runtime_config() if config is None else config
    violations = startup_gate_violations(checked)
    if violations:
        raise StartupGateError("; ".join(violations))
    return checked
