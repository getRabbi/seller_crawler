from __future__ import annotations

from urllib.parse import urlparse


def canonicalize_domain(value: str) -> str | None:
    raw = value.strip()
    if raw == "":
        return None

    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    host = parsed.hostname
    if host is None:
        return None

    host = host.rstrip(".").casefold()
    if host.startswith("www."):
        host = host[4:]
    if "." not in host or any(part == "" for part in host.split(".")):
        return None

    try:
        return host.encode("idna").decode("ascii")
    except UnicodeError:
        return None
