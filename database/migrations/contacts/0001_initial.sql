CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    contact_type TEXT NOT NULL,
    contact_value_ciphertext TEXT NOT NULL,
    normalized_hash TEXT NOT NULL,
    display_value_masked TEXT,
    classification TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_verified_at TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    outreach_eligible INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX ix_contacts_seller ON contacts(seller_id);
CREATE INDEX ix_contacts_hash ON contacts(normalized_hash);
CREATE INDEX ix_contacts_source ON contacts(source_id);
CREATE INDEX ix_contacts_status_last_seen ON contacts(status, last_seen_at);

CREATE TABLE suppression_list (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    contact_hash TEXT,
    domain TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT
);

CREATE INDEX ix_suppression_seller ON suppression_list(seller_id);
CREATE INDEX ix_suppression_contact_hash ON suppression_list(contact_hash);
CREATE INDEX ix_suppression_domain ON suppression_list(domain);
CREATE INDEX ix_suppression_expires ON suppression_list(expires_at);

CREATE TABLE outreach_state (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    contact_id TEXT,
    outreach_status TEXT NOT NULL DEFAULT 'not_started',
    channel TEXT,
    last_outreach_at TEXT,
    next_allowed_at TEXT,
    operator_notes TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE INDEX ix_outreach_seller ON outreach_state(seller_id);
CREATE INDEX ix_outreach_contact ON outreach_state(contact_id);
CREATE INDEX ix_outreach_status_next_allowed ON outreach_state(outreach_status, next_allowed_at);
