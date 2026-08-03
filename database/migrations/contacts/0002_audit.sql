CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor_id TEXT,
    old_value_hash TEXT,
    new_value_hash TEXT,
    old_value_masked TEXT,
    new_value_masked TEXT,
    reason TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX ix_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX ix_audit_event_type ON audit_events(event_type);
CREATE INDEX ix_audit_created_at ON audit_events(created_at);
