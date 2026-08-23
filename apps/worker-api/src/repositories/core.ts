import { nullable, runStatement, type D1Database, type D1Result } from "./d1";
import { assertUuidV7Compatible } from "./ids";
import type {
  EntityResolutionDecisionWrite,
  MarketplaceAccountWrite,
  ScoreComponentWrite,
  SellerAliasWrite,
  SellerMergeLinkAuditWrite,
  SellerMergeRedirectWrite,
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

export interface ResolutionDecisionRow {
  id: string;
  candidate_seller_id: string;
  matched_seller_id: string;
  action: string;
  score: number;
  status: string;
}

export interface MergeLinkRow {
  decision_id: string;
  table_name: string;
  row_id: string;
  original_seller_id: string;
  target_seller_id: string;
  rolled_back_at: string | null;
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

  async findResolutionCandidates(record: SellerWrite): Promise<SellerRow[]> {
    const domain = record.officialDomain ?? "";
    const result = await this.db
      .prepare(
        `SELECT id, canonical_name, normalized_name, legal_name, legal_name_local,
                country_code, province, city, official_domain, status, parser_version
         FROM sellers
         WHERE id <> ? AND status = 'active'
           AND (
             (? <> '' AND official_domain = ?)
             OR normalized_name = ?
             OR substr(normalized_name, 1, 8) = substr(?, 1, 8)
           )
         ORDER BY id ASC
         LIMIT 25`
      )
      .bind(record.id, domain, domain, record.normalizedName, record.normalizedName)
      .all<SellerRow>();
    return result.results ?? [];
  }

  async getResolutionDecision(id: string): Promise<ResolutionDecisionRow | null> {
    assertUuidV7Compatible(id, "decision_id");
    return this.db
      .prepare(
        `SELECT id, candidate_seller_id, matched_seller_id, action, score, status
         FROM entity_resolution_decisions WHERE id = ? LIMIT 1`
      )
      .bind(id)
      .first<ResolutionDecisionRow>();
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
         canonical_name = CASE
           WHEN excluded.identity_confidence >= sellers.identity_confidence THEN excluded.canonical_name
           ELSE sellers.canonical_name END,
         normalized_name = CASE
           WHEN excluded.identity_confidence >= sellers.identity_confidence THEN excluded.normalized_name
           ELSE sellers.normalized_name END,
         legal_name = COALESCE(excluded.legal_name, sellers.legal_name),
         legal_name_local = COALESCE(excluded.legal_name_local, sellers.legal_name_local),
         country_code = COALESCE(excluded.country_code, sellers.country_code),
         province = COALESCE(excluded.province, sellers.province),
         city = COALESCE(excluded.city, sellers.city),
         address_private = COALESCE(excluded.address_private, sellers.address_private),
         address_public_masked = COALESCE(excluded.address_public_masked, sellers.address_public_masked),
         official_domain = CASE
           WHEN sellers.official_domain IS NULL OR sellers.official_domain = excluded.official_domain
             THEN COALESCE(excluded.official_domain, sellers.official_domain)
           ELSE sellers.official_domain END,
         china_confidence = MAX(sellers.china_confidence, excluded.china_confidence),
         identity_confidence = MAX(sellers.identity_confidence, excluded.identity_confidence),
         manufacturer_score = MAX(sellers.manufacturer_score, excluded.manufacturer_score),
         trader_score = MAX(sellers.trader_score, excluded.trader_score),
         quality_score = MAX(sellers.quality_score, excluded.quality_score),
         schema_version = excluded.schema_version,
         parser_version = excluded.parser_version,
         status = excluded.status,
         last_seen_at = excluded.last_seen_at,
         last_material_change_at = COALESCE(excluded.last_material_change_at, sellers.last_material_change_at),
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

  async upsertResolutionDecision(record: EntityResolutionDecisionWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id, "decision_id");
    assertUuidV7Compatible(record.candidateSellerId, "candidate_seller_id");
    assertUuidV7Compatible(record.matchedSellerId, "matched_seller_id");
    return runStatement(
      this.db,
      `INSERT INTO entity_resolution_decisions (
         id, candidate_seller_id, matched_seller_id, action, score,
         score_breakdown_json, merge_audit_json, rollback_plan_json,
         parser_version, schema_version, status, created_at, decided_at, decided_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(candidate_seller_id, matched_seller_id, parser_version) DO NOTHING`,
      [
        record.id,
        record.candidateSellerId,
        record.matchedSellerId,
        record.action,
        record.score,
        record.scoreBreakdownJson,
        nullable(record.mergeAuditJson),
        nullable(record.rollbackPlanJson),
        record.parserVersion,
        record.schemaVersion ?? 1,
        record.status ?? "pending",
        record.createdAt,
        nullable(record.decidedAt),
        nullable(record.decidedBy)
      ]
    );
  }

  async upsertMergeRedirect(record: SellerMergeRedirectWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.sourceSellerId, "source_seller_id");
    assertUuidV7Compatible(record.targetSellerId, "target_seller_id");
    assertUuidV7Compatible(record.decisionId, "decision_id");
    return runStatement(
      this.db,
      `INSERT INTO seller_merge_redirects (
         source_seller_id, target_seller_id, decision_id, reason, created_at,
         rollback_status, rollback_decision_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_seller_id) DO UPDATE SET
         target_seller_id = excluded.target_seller_id,
         decision_id = excluded.decision_id,
         reason = excluded.reason,
         rollback_status = excluded.rollback_status,
         rollback_decision_id = excluded.rollback_decision_id`,
      [
        record.sourceSellerId,
        record.targetSellerId,
        record.decisionId,
        record.reason,
        record.createdAt,
        record.rollbackStatus ?? "active",
        nullable(record.rollbackDecisionId)
      ]
    );
  }

  async upsertMergeLinkAudit(record: SellerMergeLinkAuditWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.decisionId, "decision_id");
    return runStatement(
      this.db,
      `INSERT INTO seller_merge_link_audit (
         decision_id, table_name, row_id, original_seller_id, target_seller_id,
         created_at, rolled_back_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(decision_id, table_name, row_id) DO NOTHING`,
      [
        record.decisionId,
        record.tableName,
        record.rowId,
        record.originalSellerId,
        record.targetSellerId,
        record.createdAt,
        nullable(record.rolledBackAt)
      ]
    );
  }

  async listCoreSellerLinks(sellerId: string): Promise<Array<{ tableName: string; rowId: string }>> {
    assertUuidV7Compatible(sellerId, "seller_id");
    const tables = ["marketplace_accounts", "seller_aliases", "score_components", "seller_product_links"];
    const rows: Array<{ tableName: string; rowId: string }> = [];
    for (const tableName of tables) {
      const result = await this.db
        .prepare(`SELECT id FROM ${tableName} WHERE seller_id = ?`)
        .bind(sellerId)
        .all<{ id: string }>();
      rows.push(...(result.results ?? []).map((row) => ({ tableName, rowId: row.id })));
    }
    return rows;
  }

  async reassignCoreSellerLinks(sourceSellerId: string, targetSellerId: string): Promise<void> {
    for (const tableName of ["marketplace_accounts", "seller_aliases", "score_components", "seller_product_links"]) {
      await runStatement(this.db, `UPDATE ${tableName} SET seller_id = ? WHERE seller_id = ?`, [targetSellerId, sourceSellerId]);
    }
    await runStatement(this.db, "UPDATE sellers SET status = 'merged', updated_at = ? WHERE id = ?", [new Date().toISOString(), sourceSellerId]);
  }

  async setSellerStatus(sellerId: string, status: string, updatedAt: string): Promise<D1Result> {
    return runStatement(this.db, "UPDATE sellers SET status = ?, updated_at = ? WHERE id = ?", [status, updatedAt, sellerId]);
  }

  async updateResolutionDecision(
    decisionId: string,
    status: string,
    actorId: string,
    decidedAt: string,
    mergeAuditJson?: string | null,
    rollbackPlanJson?: string | null
  ): Promise<D1Result> {
    return runStatement(
      this.db,
      `UPDATE entity_resolution_decisions
       SET status = ?, decided_at = ?, decided_by = ?,
           merge_audit_json = COALESCE(?, merge_audit_json),
           rollback_plan_json = COALESCE(?, rollback_plan_json)
       WHERE id = ?`,
      [status, decidedAt, actorId, nullable(mergeAuditJson), nullable(rollbackPlanJson), decisionId]
    );
  }

  async listMergeLinkAudits(decisionId: string): Promise<MergeLinkRow[]> {
    const result = await this.db
      .prepare(
        `SELECT decision_id, table_name, row_id, original_seller_id, target_seller_id,
                rolled_back_at
         FROM seller_merge_link_audit
         WHERE decision_id = ? AND rolled_back_at IS NULL
         ORDER BY table_name, row_id`
      )
      .bind(decisionId)
      .all<MergeLinkRow>();
    return result.results ?? [];
  }

  async restoreCoreMergeLinks(links: MergeLinkRow[], rolledBackAt: string): Promise<void> {
    const allowedTables = new Set(["marketplace_accounts", "seller_aliases", "score_components", "seller_product_links"]);
    for (const link of links) {
      if (!allowedTables.has(link.table_name)) continue;
      await runStatement(this.db, `UPDATE ${link.table_name} SET seller_id = ? WHERE id = ? AND seller_id = ?`, [link.original_seller_id, link.row_id, link.target_seller_id]);
    }
    if (links[0]) {
      await runStatement(this.db, "UPDATE sellers SET status = 'active', updated_at = ? WHERE id = ?", [rolledBackAt, links[0].original_seller_id]);
    }
  }

  async markMergeRolledBack(decisionId: string, rolledBackAt: string): Promise<void> {
    await runStatement(
      this.db,
      "UPDATE seller_merge_link_audit SET rolled_back_at = ? WHERE decision_id = ? AND rolled_back_at IS NULL",
      [rolledBackAt, decisionId]
    );
    await runStatement(
      this.db,
      `UPDATE seller_merge_redirects
       SET rollback_status = 'rolled_back', rollback_decision_id = ?
       WHERE decision_id = ?`,
      [decisionId, decisionId]
    );
  }
}
