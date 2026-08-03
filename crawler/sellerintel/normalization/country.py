from __future__ import annotations

COUNTRY_ALIASES = {
    "cn": "CN",
    "china": "CN",
    "mainland china": "CN",
    "peoples republic of china": "CN",
    "people s republic of china": "CN",
    "pr china": "CN",
    "prc": "CN",
    "hk": "HK",
    "hong kong": "HK",
    "hong kong sar": "HK",
    "mo": "MO",
    "macau": "MO",
    "macao": "MO",
    "tw": "TW",
    "taiwan": "TW",
    "us": "US",
    "usa": "US",
    "united states": "US",
    "united states of america": "US",
    "gb": "GB",
    "uk": "GB",
    "united kingdom": "GB",
}


def normalize_country_code(value: str) -> str | None:
    normalized = value.strip().replace(".", " ").replace("'", " ").replace("\u2019", " ")
    normalized = " ".join(normalized.casefold().split())
    if normalized == "":
        return None
    if len(normalized) == 2 and normalized.isalpha():
        return normalized.upper()
    return COUNTRY_ALIASES.get(normalized)
