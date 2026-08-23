CREATE TABLE crawl_run_contacts (
    crawl_run_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (crawl_run_id, contact_id)
);

CREATE INDEX ix_crawl_run_contacts_seller
ON crawl_run_contacts(seller_id, first_seen_at);
