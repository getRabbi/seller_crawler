from __future__ import annotations


class IngestionDisabledError(RuntimeError):
    pass


def submit_batch() -> None:
    raise IngestionDisabledError("Ingestion is not implemented in Phase 0.")
