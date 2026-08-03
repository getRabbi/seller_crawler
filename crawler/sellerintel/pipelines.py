from __future__ import annotations

from typing import Any


class LockedPipeline:
    """Pass-through pipeline while live crawling remains disabled."""

    def process_item(self, item: dict[str, Any], _spider: object) -> dict[str, Any]:
        return item
