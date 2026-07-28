from __future__ import annotations

from typing import Any


class PhaseZeroPipeline:
    """Placeholder pipeline; ingestion is intentionally not implemented in Phase 0."""

    def process_item(self, item: dict[str, Any], _spider: object) -> dict[str, Any]:
        return item
