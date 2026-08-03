from __future__ import annotations

import re
import unicodedata


def nfkc(value: str) -> str:
    return unicodedata.normalize("NFKC", value)


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def remove_punctuation(value: str) -> str:
    chars: list[str] = []
    for char in value:
        category = unicodedata.category(char)
        if category.startswith(("P", "S")):
            chars.append(" ")
        else:
            chars.append(char)
    return normalize_whitespace("".join(chars))


def normalize_search_text(value: str) -> str:
    return normalize_whitespace(remove_punctuation(nfkc(value)).casefold())
