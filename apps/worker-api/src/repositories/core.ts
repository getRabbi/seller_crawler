import { nullable, runStatement, type D1Database, type D1Result } from "./d1";
import { assertUuidV7Compatible } from "./ids";
import type {
  MarketplaceAccountWrite,
  ScoreComponentWrite,
  SellerAliasWrite,
  SellerProductLinkWrite,
  SellerWrite
} from "./types";

export interface SellerRow {
  id: string;
  canonical_name: string;
  normalized_name: string;
  legal_name: string | null;
  legal_name_local: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  official_domain: string | null;
  status: string;
  parser_version: string;
}

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async sellerExists(id: string): Promise<boolean> {
    assertUuidV7Compatible(id, "seller_id");
    const row = await this.db
      .prepare("SELECT 1 AS found FROM sellers WHERE id = ? LIMIT 1")
      .bind(id)
      .first<{ found: number }>();

    return row !== null;
  }

  async getSellerById(id: string): Promise<SellerRow | null> {
    assertUuidV7Compatible(id, "seller_id");
    return this.db
      .prepare(
        `SELECT id, canonical_name, normalized_name, legal_name, legal_name_local,
                country_code, province, city, official_domain, status, parser_version
         FROM sellers
         WHERE id = ?
         LIMIT 1`
      )
      .bind(id)
      .first<SellerRow>();
  }

  async upsertSeller(record: SellerWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    return runStatement(
      this.db,
      `INSERT INTO sellers (
         id, canonical_name, normalized_name, legal_name, legal_name_local,
         country_code, province, city, address_private, address_public_masked,
         official_domain, china_confidence, identity_confidence, manufacturer_score,
         trader_score, quality_score, schema_version, parser_version, status,
         first_seen_at, last_seen_at, last_material_change_at, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         canonical_name = excluded.canonical_name,
         normalized_name = excluded.normalized_name,
         legal_name = excluded.legal_name,
         legal_name_local = excluded.legal_name_local,
         country_code = excluded.country_code,
         province = excluded.province,
         city = excluded.city,
         address_private = excluded.address_private,
         address_public_masked = excluded.address_public_masked,
         official_domain = excluded.official_domain,
         china_confidence = excluded.china_confidence,
         identity_confidence = excluded.identity_confidence,
         manufacturer_score = excluded.manufacturer_score,
         trader_score = excluded.trader_score,
         quality_score = excluded.quality_score,
         schema_version = excluded.schema_version,
         parser_version = excluded.parser_version,
         status = excluded.status,
         last_seen_at = excluded.last_seen_at,
         last_material_change_at = excluded.last_material_change_at,
         updated_at = excluded.updated_at`,
      [
        record.id,
        record.canonicalName,
        record.normalizedName,
        nullable(record.legalName),
        nullable(record.legalNameLocal),
        nullable(record.countryCode),
        nullable(record.province),
        nullable(record.city),
        nullable(record.addressPrivate),
        nullable(record.addressPublicMasked),
        nullable(record.officialDomain),
        record.chinaConfidence ?? 0,
        record.identityConfidence ?? 0,
        record.manufacturerScore ?? 0,
        record.traderScore ?? 0,
        record.qualityScore ?? 0,
        record.schemaVersion ?? 1,
        record.parserVersion,
        record.status ?? "active",
        record.firstSeenAt,
        record.lastSeenAt,
        nullable(record.lastMaterialChangeAt),
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  async upsertMarketplaceAccount(record: MarketplaceAccountWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    return runStatement(
      this.db,
      `INSERT INTO marketplace_accounts (
         id, seller_id, marketplace, merchant_token, display_name, profile_url,
         storefront_url, rating, feedback_count, positive_feedback_percent,
         country_hint, first_seen_at, last_seen_at, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         marketplace = excluded.marketplace,
         merchant_token = excluded.merchant_token,
         display_name = excluded.display_name,
         profile_url = excluded.profile_url,
         storefront_url = excluded.storefront_url,
         rating = excluded.rating,
         feedback_count = excluded.feedback_count,
         positive_feedback_percent = excluded.positive_feedback_percent,
         country_hint = excluded.country_hint,
         last_seen_at = excluded.last_seen_at,
         status = excluded.status`,
      [
        record.id,
        record.sellerId,
        record.marketplace,
        nullable(record.merchantToken),
        nullable(record.displayName),
        nullable(record.profileUrl),
        nullable(record.storefrontUrl),
        nullable(record.rating),
        nullable(record.feedbackCount),
        nullable(record.positiveFeedbackPercent),
        nullable(record.countryHint),
        record.firstSeenAt,
        record.lastSeenAt,
        record.status ?? "active"
      ]
    );
  }

  async upsertSellerAlias(record: SellerAliasWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    return runStatement(
      this.db,
      `INSERT INTO seller_aliases (
         id, seller_id, alias, normalized_alias, language_code, alias_type,
         source_id, first_seen_at, last_seen_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         alias = excluded.alias,
         normalized_alias = excluded.normalized_alias,
         language_code = excluded.language_code,
         alias_type = excluded.alias_type,
         source_id = excluded.source_id,
         last_seen_at = excluded.last_seen_at`,
      [
        record.id,
        record.sellerId,
        record.alias,
        record.normalizedAlias,
        nullable(record.languageCode),
        record.aliasType,
        nullable(record.sourceId),
        record.firstSeenAt,
        record.lastSeenAt
      ]
    );
  }

  async insertScoreComponent(record: ScoreComponentWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    return runStatement(
      this.db,
      `INSERT INTO score_components (
         id, seller_id, score_type, rule_code, points, evidence_source_id,
         explanation, observed_at, parser_version
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        record.id,
        record.sellerId,
        record.scoreType,
        record.ruleCode,
        record.points,
        nullable(record.evidenceSourceId),
        record.explanation,
        record.observedAt,
        record.parserVersion
      ]
    );
  }

  async upsertProductLink(record: SellerProductLinkWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    return runStatement(
      this.db,
      `INSERT INTO seller_product_links (
         id, seller_id, product_name, normalized_product_name, brand, normalized_brand,
         category, product_url, source_id, first_seen_at, last_seen_at,
         schema_version, parser_version, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         product_name = excluded.product_name,
         normalized_product_name = excluded.normalized_product_name,
         brand = excluded.brand,
         normalized_brand = excluded.normalized_brand,
         category = excluded.category,
         product_url = excluded.product_url,
         source_id = excluded.source_id,
         last_seen_at = excluded.last_seen_at,
         schema_version = excluded.schema_version,
         parser_version = excluded.parser_version,
         status = excluded.status`,
      [
        record.id,
        record.sellerId,
        record.productName,
        record.normalizedProductName,
        nullable(record.brand),
        nullable(record.normalizedBrand),
        nullable(record.category),
        nullable(record.productUrl),
        nullable(record.sourceId),
        record.firstSeenAt,
        record.lastSeenAt,
        record.schemaVersion ?? 1,
        record.parserVersion,
        record.status ?? "active"
      ]
    );
  }
}
