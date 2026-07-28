from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SourcePolicy:
    adapter_name: str
    enabled: bool
    risk_level: str


DEFAULT_SOURCE_POLICIES: tuple[SourcePolicy, ...] = (
    SourcePolicy(adapter_name="official_site", enabled=True, risk_level="low"),
    SourcePolicy(adapter_name="amazon", enabled=False, risk_level="high"),
    SourcePolicy(adapter_name="alibaba", enabled=False, risk_level="medium"),
    SourcePolicy(adapter_name="1688", enabled=False, risk_level="medium"),
    SourcePolicy(adapter_name="search_discovery", enabled=False, risk_level="medium"),
)
