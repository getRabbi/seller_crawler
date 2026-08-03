DROP TRIGGER IF EXISTS sellers_ai_search_fts;
DROP TRIGGER IF EXISTS sellers_au_search_fts;
DROP TRIGGER IF EXISTS sellers_ad_search_fts;
DROP TRIGGER IF EXISTS seller_aliases_ai_search_fts;
DROP TRIGGER IF EXISTS seller_aliases_au_search_fts;
DROP TRIGGER IF EXISTS seller_aliases_ad_search_fts;
DROP TRIGGER IF EXISTS seller_product_links_ai_search_fts;
DROP TRIGGER IF EXISTS seller_product_links_au_search_fts;
DROP TRIGGER IF EXISTS seller_product_links_ad_search_fts;
DROP TABLE IF EXISTS seller_search_fts;

CREATE VIRTUAL TABLE seller_search_fts USING fts5(
    seller_id UNINDEXED,
    canonical_name,
    legal_name,
    legal_name_local,
    aliases,
    brands,
    official_domain,
    city,
    tokenize = 'unicode61',
    prefix = '2 3 4'
);

INSERT INTO seller_search_fts (
    seller_id,
    canonical_name,
    legal_name,
    legal_name_local,
    aliases,
    brands,
    official_domain,
    city
)
SELECT
    sellers.id,
    sellers.canonical_name,
    sellers.legal_name,
    sellers.legal_name_local,
    COALESCE((
        SELECT group_concat(alias, ' ')
        FROM seller_aliases
        WHERE seller_aliases.seller_id = sellers.id
    ), ''),
    COALESCE((
        SELECT group_concat(brand, ' ')
        FROM seller_product_links
        WHERE seller_product_links.seller_id = sellers.id
          AND seller_product_links.brand IS NOT NULL
    ), ''),
    sellers.official_domain,
    sellers.city
FROM sellers;

CREATE TRIGGER sellers_ai_search_fts
AFTER INSERT ON sellers
BEGIN
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    VALUES (
        NEW.id,
        NEW.canonical_name,
        NEW.legal_name,
        NEW.legal_name_local,
        '',
        '',
        NEW.official_domain,
        NEW.city
    );
END;

CREATE TRIGGER sellers_au_search_fts
AFTER UPDATE ON sellers
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = NEW.id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = NEW.id;
END;

CREATE TRIGGER sellers_ad_search_fts
AFTER DELETE ON sellers
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = OLD.id;
END;

CREATE TRIGGER seller_aliases_ai_search_fts
AFTER INSERT ON seller_aliases
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = NEW.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = NEW.seller_id;
END;

CREATE TRIGGER seller_aliases_au_search_fts
AFTER UPDATE ON seller_aliases
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = NEW.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = NEW.seller_id;
END;

CREATE TRIGGER seller_aliases_ad_search_fts
AFTER DELETE ON seller_aliases
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = OLD.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = OLD.seller_id;
END;

CREATE TRIGGER seller_product_links_ai_search_fts
AFTER INSERT ON seller_product_links
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = NEW.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = NEW.seller_id;
END;

CREATE TRIGGER seller_product_links_au_search_fts
AFTER UPDATE ON seller_product_links
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = NEW.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = NEW.seller_id;
END;

CREATE TRIGGER seller_product_links_ad_search_fts
AFTER DELETE ON seller_product_links
BEGIN
    DELETE FROM seller_search_fts WHERE seller_id = OLD.seller_id;
    INSERT INTO seller_search_fts (
        seller_id,
        canonical_name,
        legal_name,
        legal_name_local,
        aliases,
        brands,
        official_domain,
        city
    )
    SELECT
        sellers.id,
        sellers.canonical_name,
        sellers.legal_name,
        sellers.legal_name_local,
        COALESCE((
            SELECT group_concat(alias, ' ')
            FROM seller_aliases
            WHERE seller_aliases.seller_id = sellers.id
        ), ''),
        COALESCE((
            SELECT group_concat(brand, ' ')
            FROM seller_product_links
            WHERE seller_product_links.seller_id = sellers.id
              AND seller_product_links.brand IS NOT NULL
        ), ''),
        sellers.official_domain,
        sellers.city
    FROM sellers
    WHERE sellers.id = OLD.seller_id;
END;
