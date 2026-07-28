from __future__ import annotations

from sellerintel.config.features import StartupGateError, assert_startup_gates, load_runtime_config


def assert_zyte_api_disabled() -> None:
    config = load_runtime_config({"ZYTE_API_ENABLED": "false"})
    assert_startup_gates(config)


def request_with_zyte_api() -> None:
    raise StartupGateError("Zyte API is disabled in the zero-cost baseline.")
