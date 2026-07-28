from __future__ import annotations

from typing import Protocol


class SourceAdapter(Protocol):
    name: str
    risk_level: str

    def is_allowed(self, url: str) -> bool: ...
