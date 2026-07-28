from __future__ import annotations

from sellerintel.config.sources import DEFAULT_SOURCE_POLICIES, SourcePolicy


def configured_sources() -> tuple[SourcePolicy, ...]:
    return DEFAULT_SOURCE_POLICIES
