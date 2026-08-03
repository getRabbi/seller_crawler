from __future__ import annotations

import re

from sellerintel.normalization.text import nfkc, normalize_whitespace


def normalize_address(value: str) -> str:
    return normalize_whitespace(nfkc(value).replace("\n", ", "))


def mask_address(value: str, *, keep_last_segments: int = 3) -> str:
    normalized = normalize_address(value)
    segments = [segment.strip() for segment in normalized.split(",") if segment.strip()]
    if len(segments) > keep_last_segments:
        return ", ".join(["***", *segments[-keep_last_segments:]])
    return _mask_inline_address(normalized)


def _mask_inline_address(value: str) -> str:
    masked = re.sub(r"\b\d+[A-Za-z0-9/-]*\b", "***", value)
    tokens = masked.split()
    if len(tokens) <= 4:
        return "***"
    return normalize_whitespace(" ".join(["***", *tokens[-3:]]))
