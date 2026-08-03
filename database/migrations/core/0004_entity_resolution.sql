CREATE TABLE entity_resolution_decisions (
    id TEXT PRIMARY KEY,
    candidate_seller_id TEXT NOT NULL,
    matched_seller_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('auto_merge', 'review_queue', 'no_merge')),
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    score_breakdown_json TEXT NOT NULL,
    merge_audit_json TEXT,
    rollback_plan_json TEXT,
    parser_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by TEXT,
    CHECK (candidate_seller_id <> matched_seller_id),
    FOREIGN KEY (candidate_seller_id) REFERENCES sellers(id),
    FOREIGN KEY (matched_seller_id) REFERENCES sellers(id)
);

CREATE UNIQUE INDEX ux_entity_resolution_pair_parser
ON entity_resolution_decisions(candidate_seller_id, matched_seller_id, parser_version);

CREATE INDEX ix_entity_resolution_action_score
ON entity_resolution_decisions(action, score);

CREATE INDEX ix_entity_resolution_status_created
ON entity_resolution_decisions(status, created_at);

CREATE TABLE seller_merge_redirects (
    source_seller_id TEXT PRIMARY KEY,
    target_seller_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    rollback_status TEXT NOT NULL DEFAULT 'active',
    rollback_decision_id TEXT,
    CHECK (source_seller_id <> target_seller_id),
    FOREIGN KEY (source_seller_id) REFERENCES sellers(id),
    FOREIGN KEY (target_seller_id) REFERENCES sellers(id),
    FOREIGN KEY (decision_id) REFERENCES entity_resolution_decisions(id),
    FOREIGN KEY (rollback_decision_id) REFERENCES entity_resolution_decisions(id)
);

CREATE INDEX ix_seller_merge_redirects_target
ON seller_merge_redirects(target_seller_id);

CREATE INDEX ix_seller_merge_redirects_decision
ON seller_merge_redirects(decision_id);
