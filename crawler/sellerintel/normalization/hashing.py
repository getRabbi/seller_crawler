from __future__ import annotations

import hashlib


def deterministic_hash(value: str, *, namespace: str = "sellerintel") -> str:
    payload = f"{namespace}\0{value}".encode()
    return hashlib.sha256(payload).hexdigest()
