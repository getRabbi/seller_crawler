from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sellerintel.adapters.base import PolicyBackedAdapter, SourceAdapter
from sellerintel.config.features import RuntimeConfig
from sellerintel.config.sources import DEFAULT_SOURCE_POLICIES, SourcePolicy


def configured_sources() -> tuple[SourcePolicy, ...]:
    return DEFAULT_SOURCE_POLICIES


@dataclass(frozen=True, slots=True)
class RegisteredAdapter:
    adapter: SourceAdapter
    policy: SourcePolicy


class AdapterRegistry:
    def __init__(self, adapters: Iterable[RegisteredAdapter]) -> None:
        self._adapters = {registered.adapter.name: registered for registered in adapters}

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._adapters))

    def get(self, name: str) -> SourceAdapter:
        return self._adapters[name].adapter

    def policy_for(self, name: str) -> SourcePolicy:
        return self._adapters[name].policy

    def enabled_adapters(self, config: RuntimeConfig) -> tuple[SourceAdapter, ...]:
        enabled: list[SourceAdapter] = []
        for registered in self._adapters.values():
            if _policy_enabled(registered.policy, config):
                enabled.append(registered.adapter)
        return tuple(sorted(enabled, key=lambda adapter: adapter.name))


def default_adapter_registry(
    policies: tuple[SourcePolicy, ...] = DEFAULT_SOURCE_POLICIES,
) -> AdapterRegistry:
    return AdapterRegistry(
        RegisteredAdapter(adapter=PolicyBackedAdapter(policy), policy=policy) for policy in policies
    )


def _policy_enabled(policy: SourcePolicy, config: RuntimeConfig) -> bool:
    return policy.enabled and config.feature_flags.get(policy.feature_flag, False)
