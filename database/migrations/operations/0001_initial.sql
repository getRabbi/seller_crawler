CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    source_url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_type TEXT NOT NULL,
    robots_status TEXT,
    terms_risk TEXT,
    http_status INTEGER,
    content_hash TEXT,
    r2_object_key TEXT,
    first_seen_at TEXT NOT NULL,
    last_fetched_at TEXT,
    last_success_at TEXT,
    next_allowed_at TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX ix_sources_seller ON sources(seller_id);
CREATE INDEX ix_sources_domain ON sources(source_domain);
CREATE INDEX ix_sources_status_next_allowed ON sources(status, next_allowed_at);
CREATE INDEX ix_sources_content_hash ON sources(content_hash);

CREATE TABLE crawl_runs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    zyte_job_id TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    requests_total INTEGER NOT NULL DEFAULT 0,
    responses_success INTEGER NOT NULL DEFAULT 0,
    candidates_found INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    contacts_verified INTEGER NOT NULL DEFAULT 0,
    blocked_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT
);

CREATE INDEX ix_crawl_runs_status_started ON crawl_runs(status, started_at);
CREATE INDEX ix_crawl_runs_job_type ON crawl_runs(job_type);

CREATE TABLE review_queue (
    id TEXT PRIMARY KEY,
    review_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 2,
    payload_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT
);

CREATE INDEX ix_review_status_priority ON review_queue(status, priority, created_at);
CREATE INDEX ix_review_entity ON review_queue(entity_id);
