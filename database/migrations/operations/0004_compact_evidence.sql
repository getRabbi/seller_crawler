ALTER TABLE sources ADD COLUMN page_title TEXT;
ALTER TABLE sources ADD COLUMN evidence_snippet TEXT;
ALTER TABLE sources ADD COLUMN detected_at TEXT;
ALTER TABLE sources ADD COLUMN last_seen_at TEXT;

CREATE INDEX ix_sources_detected_at ON sources(detected_at);
CREATE INDEX ix_sources_last_seen_at ON sources(last_seen_at);
