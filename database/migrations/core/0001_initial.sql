PRAGMA foreign_keys = ON;

CREATE TABLE sellers (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    legal_name TEXT,
    legal_name_local TEXT,
    country_code TEXT,
    province TEXT,
    city TEXT,
    address_private TEXT,
    address_public_masked TEXT,
    official_domain TEXT,
    china_confidence INTEGER NOT NULL DEFAULT 0,
    identity_confidence INTEGER NOT NULL DEFAULT 0,
    manufacturer_score INTEGER NOT NULL DEFAULT 0,
    trader_score INTEGER NOT NULL DEFAULT 0,
    quality_score INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_material_change_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_accounts (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    merchant_token TEXT,
    display_name TEXT,
    profile_url TEXT,
    storefront_url TEXT,
    rating REAL,
    feedback_count INTEGER,
    positive_feedback_percent REAL,
    country_hint TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE TABLE seller_aliases (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    language_code TEXT,
    alias_type TEXT NOT NULL,
    source_id TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE TABLE score_components (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    score_type TEXT NOT NULL,
    rule_code TEXT NOT NULL,
    points INTEGER NOT NULL,
    evidence_source_id TEXT,
    explanation TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE TABLE seller_product_links (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    normalized_product_name TEXT NOT NULL,
    brand TEXT,
    normalized_brand TEXT,
    category TEXT,
    product_url TEXT,
    source_id TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);
