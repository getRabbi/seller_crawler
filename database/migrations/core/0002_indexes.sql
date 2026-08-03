CREATE INDEX ix_sellers_normalized_name ON sellers(normalized_name);
CREATE INDEX ix_sellers_official_domain ON sellers(official_domain);
CREATE INDEX ix_sellers_location ON sellers(country_code, province, city);
CREATE INDEX ix_sellers_status_last_seen ON sellers(status, last_seen_at);

CREATE UNIQUE INDEX ux_marketplace_token
ON marketplace_accounts(marketplace, merchant_token)
WHERE merchant_token IS NOT NULL;

CREATE INDEX ix_marketplace_seller ON marketplace_accounts(seller_id);
CREATE INDEX ix_marketplace_profile_url ON marketplace_accounts(profile_url);
CREATE INDEX ix_marketplace_status_last_seen ON marketplace_accounts(status, last_seen_at);

CREATE INDEX ix_alias_normalized ON seller_aliases(normalized_alias);
CREATE INDEX ix_alias_seller ON seller_aliases(seller_id);

CREATE INDEX ix_score_components_seller ON score_components(seller_id);
CREATE INDEX ix_score_components_type ON score_components(score_type, rule_code);

CREATE INDEX ix_product_links_seller ON seller_product_links(seller_id);
CREATE INDEX ix_product_links_brand ON seller_product_links(normalized_brand);
CREATE INDEX ix_product_links_category ON seller_product_links(category);
