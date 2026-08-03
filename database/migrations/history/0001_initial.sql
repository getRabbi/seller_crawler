PRAGMA foreign_keys = ON;

CREATE TABLE field_history (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value_hash TEXT,
    new_value_hash TEXT,
    old_value_masked TEXT,
    new_value_masked TEXT,
    source_id TEXT,
    observed_at TEXT NOT NULL,
    crawl_run_id TEXT,
    actor_type TEXT NOT NULL DEFAULT 'crawler',
    actor_id TEXT,
    change_reason TEXT,
    diff_json TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX ix_field_history_entity ON field_history(entity_type, entity_id, observed_at);
CREATE INDEX ix_field_history_field ON field_history(field_name);
CREATE INDEX ix_field_history_source ON field_history(source_id);
CREATE INDEX ix_field_history_crawl_run ON field_history(crawl_run_id);

CREATE TABLE recent_diff_metadata (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    latest_field_history_id TEXT,
    diff_count_30d INTEGER NOT NULL DEFAULT 0,
    last_observed_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (latest_field_history_id) REFERENCES field_history(id)
);

CREATE UNIQUE INDEX ux_recent_diff_entity ON recent_diff_metadata(entity_type, entity_id);
CREATE INDEX ix_recent_diff_last_observed ON recent_diff_metadata(last_observed_at);
