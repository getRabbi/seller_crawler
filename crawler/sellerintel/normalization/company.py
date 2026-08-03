from __future__ import annotations

from dataclasses import dataclass

from sellerintel.normalization.text import nfkc, normalize_search_text, normalize_whitespace

ENGLISH_SUFFIXES = (
    "company limited",
    "company ltd",
    "co limited",
    "co ltd",
    "corporation",
    "incorporated",
    "limited",
    "ltd",
    "llc",
    "inc",
    "corp",
    "co",
)

CHINESE_SUFFIXES = (
    "\u80a1\u4efd\u6709\u9650\u516c\u53f8",
    "\u6709\u9650\u8d23\u4efb\u516c\u53f8",
    "\u6709\u9650\u516c\u53f8",
    "\u5b9e\u4e1a\u6709\u9650\u516c\u53f8",
    "\u96c6\u56e2",
    "\u516c\u53f8",
    "\u5de5\u5382",
    "\u5382",
)


@dataclass(frozen=True, slots=True)
class NormalizedCompanyName:
    original: str
    nfkc: str
    normalized: str
    suffix_removed: str | None


def normalize_company_name(value: str) -> NormalizedCompanyName:
    normalized_nfkc = normalize_whitespace(nfkc(value))
    suffix_removed = _removed_suffix(normalized_nfkc)
    without_suffix = _strip_chinese_suffixes(normalized_nfkc)
    without_suffix = _strip_english_suffixes(without_suffix)
    return NormalizedCompanyName(
        original=value,
        nfkc=normalized_nfkc,
        normalized=normalize_search_text(without_suffix),
        suffix_removed=suffix_removed,
    )


def _strip_english_suffixes(value: str) -> str:
    normalized = normalize_search_text(value)
    for suffix in sorted(ENGLISH_SUFFIXES, key=len, reverse=True):
        if normalized == suffix:
            return ""
        marker = f" {suffix}"
        if normalized.endswith(marker):
            return normalized[: -len(marker)]
    return normalized


def _strip_chinese_suffixes(value: str) -> str:
    current = value
    for suffix in sorted(CHINESE_SUFFIXES, key=len, reverse=True):
        if current.endswith(suffix):
            return current[: -len(suffix)]
    return current


def _removed_suffix(value: str) -> str | None:
    normalized = normalize_search_text(value)
    for suffix in sorted(ENGLISH_SUFFIXES, key=len, reverse=True):
        if normalized == suffix or normalized.endswith(f" {suffix}"):
            return suffix
    for suffix in sorted(CHINESE_SUFFIXES, key=len, reverse=True):
        if value.endswith(suffix):
            return suffix
    return None
