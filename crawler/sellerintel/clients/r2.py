from __future__ import annotations


class R2DisabledError(RuntimeError):
    pass


def upload_evidence() -> None:
    raise R2DisabledError("R2 uploads are not implemented in the current local phase.")
