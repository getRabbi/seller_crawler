CREATE TABLE operator_crawl_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('find_sellers', 'known_websites')),
    query_json TEXT NOT NULL DEFAULT '[]',
    marketplace TEXT,
    country_codes_json TEXT NOT NULL DEFAULT '[]',
    filters_json TEXT NOT NULL DEFAULT '{}',
    seed_urls_json TEXT NOT NULL DEFAULT '[]',
    contact_types_json TEXT NOT NULL DEFAULT '[]',
    target_seller_count INTEGER NOT NULL,
    max_result_pages INTEGER NOT NULL,
    max_official_pages INTEGER NOT NULL,
    crawl_depth INTEGER NOT NULL,
    stop_after_target INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    active_unit_slot INTEGER,
    zyte_job_id TEXT,
    retry_of_run_id TEXT,
    requested_by TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL,
    approved_domains_json TEXT NOT NULL DEFAULT '[]',
    artifact_version TEXT NOT NULL,
    discovered_sellers INTEGER NOT NULL DEFAULT 0,
    enriched_sellers INTEGER NOT NULL DEFAULT 0,
    contacts_found INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error_code TEXT,
    error_message TEXT
);

CREATE INDEX ix_operator_crawl_runs_status_requested
ON operator_crawl_runs(status, requested_at);

CREATE INDEX ix_operator_crawl_runs_zyte_job
ON operator_crawl_runs(zyte_job_id);

CREATE UNIQUE INDEX ux_operator_crawl_active_unit
ON operator_crawl_runs(active_unit_slot)
WHERE active_unit_slot IS NOT NULL;

CREATE TABLE operator_crawl_events (
    id TEXT PRIMARY KEY,
    crawl_run_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    from_status TEXT,
    to_status TEXT,
    message TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (crawl_run_id) REFERENCES operator_crawl_runs(id)
);

CREATE INDEX ix_operator_crawl_events_run_created
ON operator_crawl_events(crawl_run_id, created_at);

CREATE TABLE operator_crawl_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    crawl_run_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (crawl_run_id) REFERENCES operator_crawl_runs(id)
);

CREATE INDEX ix_operator_crawl_idempotency_expires
ON operator_crawl_idempotency(expires_at);

CREATE TABLE crawl_run_sellers (
    crawl_run_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (crawl_run_id, seller_id, stage)
);

CREATE INDEX ix_crawl_run_sellers_seller
ON crawl_run_sellers(seller_id, first_seen_at);
