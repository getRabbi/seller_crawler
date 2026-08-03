CREATE TABLE ingestion_nonces (
    nonce TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX ix_ingestion_nonces_expires_at ON ingestion_nonces(expires_at);
CREATE INDEX ix_ingestion_nonces_idempotency_key ON ingestion_nonces(idempotency_key);
