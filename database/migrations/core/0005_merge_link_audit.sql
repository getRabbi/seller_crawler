CREATE TABLE seller_merge_link_audit (
    decision_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    original_seller_id TEXT NOT NULL,
    target_seller_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    rolled_back_at TEXT,
    PRIMARY KEY (decision_id, table_name, row_id),
    FOREIGN KEY (decision_id) REFERENCES entity_resolution_decisions(id),
    FOREIGN KEY (original_seller_id) REFERENCES sellers(id),
    FOREIGN KEY (target_seller_id) REFERENCES sellers(id)
);

CREATE INDEX ix_seller_merge_link_audit_rollback
ON seller_merge_link_audit(decision_id, rolled_back_at);
