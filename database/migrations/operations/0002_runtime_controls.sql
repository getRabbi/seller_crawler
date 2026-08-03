CREATE TABLE source_registry (
    adapter_name TEXT PRIMARY KEY,
    source_family TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL,
    robots_policy TEXT NOT NULL,
    terms_review_status TEXT NOT NULL,
    daily_request_budget INTEGER NOT NULL DEFAULT 0,
    concurrency_per_domain INTEGER NOT NULL DEFAULT 1,
    minimum_delay_seconds REAL NOT NULL DEFAULT 2.5,
    blocked_until TEXT,
    parser_version TEXT NOT NULL,
    last_success_at TEXT,
    last_failure_at TEXT,
    operator_notes TEXT
);

CREATE INDEX ix_source_registry_family_enabled ON source_registry(source_family, enabled);
CREATE INDEX ix_source_registry_blocked_until ON source_registry(blocked_until);

CREATE TABLE idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX ix_idempotency_expires_at ON idempotency_keys(expires_at);

CREATE TABLE quota_state (
    quota_name TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    soft_limit INTEGER NOT NULL,
    hard_limit INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE feature_flags (
    flag_name TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'env_default',
    updated_at TEXT NOT NULL,
    operator_notes TEXT
);
