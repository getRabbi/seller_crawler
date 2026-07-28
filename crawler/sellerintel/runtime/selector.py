from __future__ import annotations

from sellerintel.config.features import RuntimeConfig, StartupGateError, assert_startup_gates


def validate_selected_runner(config: RuntimeConfig) -> RuntimeConfig:
    return assert_startup_gates(config)


def reject_automatic_failover() -> None:
    raise StartupGateError("Automatic provider failover is forbidden by the master specification.")
