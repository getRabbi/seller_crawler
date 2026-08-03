CREATE INDEX ix_field_history_retention_observed_at ON field_history(observed_at);

CREATE TABLE history_retention_jobs (
    id TEXT PRIMARY KEY,
    retention_scope TEXT NOT NULL,
    cutoff_observed_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    archive_object_key TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    notes TEXT
);

CREATE INDEX ix_history_retention_status_created ON history_retention_jobs(status, created_at);
