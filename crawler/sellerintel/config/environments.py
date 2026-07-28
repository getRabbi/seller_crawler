from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Environment:
    name: str
    allows_live_crawl: bool


LOCAL_ENVIRONMENT = Environment(name="local", allows_live_crawl=False)
