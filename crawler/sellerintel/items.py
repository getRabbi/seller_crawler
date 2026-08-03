from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SellerCandidate:
    schema_version: int
    parser_version: str
    source_url: str
    observed_at: str
