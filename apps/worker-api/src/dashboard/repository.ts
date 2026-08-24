import type {
  ContactListItem,
  ContactRevealResponse,
  CrawlRunItem,
  DuplicateReviewItem,
  EvidenceListItem,
  ListResponse,
  SellerDetailResponse,
  SellerListItem,
  OperatorMetrics
} from "@seller-intelligence/shared-types/dashboard";

import type { D1Database, D1Value } from "../repositories/d1";
import { ContactsRepository } from "../repositories/contacts";
import { newUuidV7 } from "../repositories/ids";
import { decryptContactValue } from "../security/contact-crypto";
import type { RuntimeEnv } from "../validation/startup";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_EXPORT_ROWS = 1_000;

export interface ListOptions {
  limit: number;
  offset: number;
  query?: string;
  status?: string;
  marketplace?: string;
  countryCode?: string;
  category?: string;
  brand?: string;
  sourceType?: string;
  amazonSeller?: string;
  hasOfficialWebsite?: boolean;
  contactType?: string;
  minimumManufacturerScore?: number;
  minimumTraderScore?: number;
  duplicateStatus?: string;
  updatedSince?: string;
  sort?: string;
  sourceRunId?: string;
}

export interface ContactListOptions extends ListOptions {
  contactType?: string;
  sellerId?: string;
  minimumConfidence?: number;
  countryCode?: string;
  sourceType?: string;
  verifiedStatus?: string;
}

interface CountedRow {
  total_count: number;
}

interface SellerRow extends CountedRow {
  id: string;
  canonical_name: string;
  legal_name: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  official_domain: string | null;
  identity_confidence: number;
  quality_score: number;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  marketplace: string | null;
  marketplace_display_name: string | null;
  marketplace_profile_url: string | null;
  manufacturer_score: number;
  trader_score: number;
  duplicate_status: string | null;
}

interface ContactRow extends CountedRow {
  id: string;
  seller_id: string;
  contact_type: string;
  display_value_masked: string | null;
  classification: string;
  confidence: number;
  source_id: string;
  first_seen_at: string;
  last_seen_at: string;
  last_verified_at: string | null;
  status: string;
}

interface SellerNameRow {
  id: string;
  canonical_name: string;
}

interface ContactMetadataRow {
  seller_id: string;
  contact_count: number;
  contact_types: string;
}

interface EvidenceRow {
  id: string;
  source_url: string;
  canonical_url: string;
  page_title: string | null;
  evidence_snippet: string | null;
  content_hash: string | null;
  detected_at: string | null;
  last_seen_at: string | null;
  http_status: number | null;
  robots_status: string | null;
  status: string;
}

interface DuplicateRow extends CountedRow {
  id: string;
  candidate_seller_id: string;
  candidate_name: string;
  matched_seller_id: string;
  matched_name: string;
  action: string;
  score: number;
  score_breakdown_json: string;
  status: string;
  created_at: string;
}

interface CrawlRunRow extends CountedRow {
  id: string;
  job_type: string;
  zyte_job_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  requests_total: number;
  responses_success: number;
  candidates_found: number;
  records_created: number;
  records_updated: number;
  contacts_verified: number;
  blocked_count: number;
  error_count: number;
  notes: string | null;
}

export class DashboardRepository {
  constructor(private readonly env: RuntimeEnv) {}

  async listSellers(options: ListOptions): Promise<ListResponse<SellerListItem>> {
    const core = requireDb(this.env.CORE_DB, "CORE_DB");
    const clauses = ["s.status <> 'merged'"];
    const values: D1Value[] = [];
    const ftsQuery = toFtsQuery(options.query);

    if (ftsQuery) {
      clauses.push("s.id IN (SELECT seller_id FROM seller_search_fts WHERE seller_search_fts MATCH ?)");
      values.push(ftsQuery);
    }
    if (options.status) {
      clauses.push("s.status = ?");
      values.push(options.status);
    }
    if (options.countryCode) {
      clauses.push("s.country_code = ?");
      values.push(options.countryCode.toUpperCase());
    }
    if (options.hasOfficialWebsite !== undefined) {
      clauses.push(options.hasOfficialWebsite ? "s.official_domain IS NOT NULL" : "s.official_domain IS NULL");
    }
    if (options.marketplace) {
      clauses.push("EXISTS (SELECT 1 FROM marketplace_accounts ma WHERE ma.seller_id = s.id AND ma.marketplace = ?)");
      values.push(options.marketplace);
    }
    if (options.amazonSeller) {
      clauses.push(
        "EXISTS (SELECT 1 FROM marketplace_accounts ma WHERE ma.seller_id = s.id AND (ma.display_name LIKE ? ESCAPE '\\' OR ma.merchant_token LIKE ? ESCAPE '\\'))"
      );
      const pattern = `%${escapeLike(options.amazonSeller)}%`;
      values.push(pattern, pattern);
    }
    if (options.category) {
      clauses.push("EXISTS (SELECT 1 FROM seller_product_links pl WHERE pl.seller_id = s.id AND pl.category LIKE ? ESCAPE '\\')");
      values.push(`%${escapeLike(options.category)}%`);
    }
    if (options.brand) {
      clauses.push("EXISTS (SELECT 1 FROM seller_product_links pl WHERE pl.seller_id = s.id AND pl.brand LIKE ? ESCAPE '\\')");
      values.push(`%${escapeLike(options.brand)}%`);
    }
    if (options.minimumManufacturerScore !== undefined) {
      clauses.push("s.manufacturer_score >= ?");
      values.push(options.minimumManufacturerScore);
    }
    if (options.minimumTraderScore !== undefined) {
      clauses.push("s.trader_score >= ?");
      values.push(options.minimumTraderScore);
    }
    if (options.duplicateStatus) {
      clauses.push("EXISTS (SELECT 1 FROM entity_resolution_decisions d WHERE (d.candidate_seller_id = s.id OR d.matched_seller_id = s.id) AND d.status = ?)");
      values.push(options.duplicateStatus);
    }
    if (options.updatedSince) {
      clauses.push("s.updated_at >= ?");
      values.push(options.updatedSince);
    }
    const prefilteredIds = await this.prefilterSellerIds(options);
    if (prefilteredIds !== null) {
      if (prefilteredIds.length === 0) return { items: [], total: 0, limit: options.limit, offset: options.offset };
      clauses.push(`s.id IN (${prefilteredIds.map(() => "?").join(",")})`);
      values.push(...prefilteredIds);
    }

    let orderBy = sellerSort(options.sort);
    if (options.sort === "most_contacts") {
      const rank = await this.contactSellerRank();
      if (rank.length > 0) {
        orderBy = `CASE s.id ${rank.map((_, index) => `WHEN ? THEN ${index}`).join(" ")} ELSE ${rank.length} END`;
        values.push(...rank);
      }
    }
    values.push(options.limit, options.offset);
    const result = await core
      .prepare(
        `SELECT s.id, s.canonical_name, s.legal_name, s.country_code, s.province, s.city,
                s.official_domain, s.identity_confidence, s.quality_score, s.manufacturer_score,
                s.trader_score, s.status, s.first_seen_at, s.last_seen_at, s.updated_at,
                (SELECT ma.marketplace FROM marketplace_accounts ma WHERE ma.seller_id = s.id ORDER BY ma.last_seen_at DESC LIMIT 1) AS marketplace,
                (SELECT ma.display_name FROM marketplace_accounts ma WHERE ma.seller_id = s.id ORDER BY ma.last_seen_at DESC LIMIT 1) AS marketplace_display_name,
                (SELECT ma.profile_url FROM marketplace_accounts ma WHERE ma.seller_id = s.id ORDER BY ma.last_seen_at DESC LIMIT 1) AS marketplace_profile_url,
                (SELECT d.status FROM entity_resolution_decisions d WHERE d.candidate_seller_id = s.id OR d.matched_seller_id = s.id ORDER BY d.created_at DESC LIMIT 1) AS duplicate_status,
                COUNT(*) OVER() AS total_count
         FROM sellers s
         WHERE ${clauses.join(" AND ")}
         ORDER BY ${orderBy}, s.id ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<SellerRow>();

    const rows = result.results ?? [];
    const metadata = await this.getContactMetadata(rows.map((row) => row.id));
    return listResponse(rows, options, (row) => mapSeller(row, metadata.get(row.id)));
  }

  async getSeller(sellerId: string): Promise<SellerDetailResponse | null> {
    const core = requireDb(this.env.CORE_DB, "CORE_DB");
    const operations = requireDb(this.env.OPS_DB, "OPS_DB");
    const seller = await core
      .prepare(
        `SELECT id, canonical_name, legal_name, country_code, province, city, official_domain,
                identity_confidence, quality_score, status, first_seen_at, last_seen_at, updated_at,
                1 AS total_count
         FROM sellers WHERE id = ? LIMIT 1`
      )
      .bind(sellerId)
      .first<SellerRow>();
    if (!seller) {
      return null;
    }

    const [aliasResult, contacts, evidenceResult, duplicateResult, contactMetadata] = await Promise.all([
      core
        .prepare("SELECT alias FROM seller_aliases WHERE seller_id = ? ORDER BY alias LIMIT 100")
        .bind(sellerId)
        .all<{ alias: string }>(),
      this.listContacts({ limit: MAX_LIMIT, offset: 0, sellerId }),
      operations
        .prepare(
          `SELECT id, source_url, canonical_url, page_title, evidence_snippet, content_hash,
                  detected_at, last_seen_at, http_status, robots_status, status
           FROM sources WHERE seller_id = ? ORDER BY last_seen_at DESC, id ASC LIMIT 100`
        )
        .bind(sellerId)
        .all<EvidenceRow>(),
      this.listDuplicates({ limit: MAX_LIMIT, offset: 0, query: sellerId }),
      this.getContactMetadata([sellerId])
    ]);

    return {
      seller: mapSeller(seller, contactMetadata.get(sellerId)),
      aliases: (aliasResult.results ?? []).map((row) => row.alias),
      contacts: contacts.items,
      evidence: (evidenceResult.results ?? []).map(mapEvidence),
      duplicateReviews: duplicateResult.items
    };
  }

  async listContacts(options: ContactListOptions): Promise<ListResponse<ContactListItem>> {
    const contactsDb = requireDb(this.env.CONTACTS_DB, "CONTACTS_DB");
    const clauses = [
      "c.status = 'active'",
      `NOT EXISTS (
        SELECT 1 FROM suppression_list sl
        WHERE (sl.seller_id = c.seller_id OR sl.contact_hash = c.normalized_hash)
          AND (sl.expires_at IS NULL OR sl.expires_at > datetime('now'))
      )`
    ];
    const values: D1Value[] = [];
    if (options.sellerId) {
      clauses.push("c.seller_id = ?");
      values.push(options.sellerId);
    }
    if (options.contactType) {
      clauses.push("c.contact_type = ?");
      values.push(options.contactType);
    }
    if (options.minimumConfidence !== undefined) {
      clauses.push("c.confidence >= ?");
      values.push(options.minimumConfidence);
    }
    if (options.verifiedStatus === "verified") {
      clauses.push("c.last_verified_at IS NOT NULL");
    } else if (options.verifiedStatus === "unverified") {
      clauses.push("c.last_verified_at IS NULL");
    }
    const contactSellerIds = await this.contactSellerFilterIds(options);
    if (contactSellerIds !== null) {
      if (contactSellerIds.length === 0) return { items: [], total: 0, limit: options.limit, offset: options.offset };
      clauses.push(`c.seller_id IN (${contactSellerIds.map(() => "?").join(",")})`);
      values.push(...contactSellerIds);
    }
    const sourceIds = await this.contactSourceFilterIds(options.sourceType);
    if (sourceIds !== null) {
      if (sourceIds.length === 0) return { items: [], total: 0, limit: options.limit, offset: options.offset };
      clauses.push(`c.source_id IN (${sourceIds.map(() => "?").join(",")})`);
      values.push(...sourceIds);
    }
    values.push(options.limit, options.offset);

    const result = await contactsDb
      .prepare(
        `SELECT c.id, c.seller_id, c.contact_type, c.display_value_masked, c.classification,
                c.confidence, c.source_id, c.first_seen_at, c.last_seen_at, c.last_verified_at,
                c.status, COUNT(*) OVER() AS total_count
         FROM contacts c
         WHERE ${clauses.join(" AND ")}
         ORDER BY c.last_seen_at DESC, c.id ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<ContactRow>();

    const rows = result.results ?? [];
    const [sellerNames, sellerCountries, sourceTypes] = await Promise.all([
      this.getSellerNames(rows.map((row) => row.seller_id)),
      this.getSellerCountries(rows.map((row) => row.seller_id)),
      this.getSourceTypes(rows.map((row) => row.source_id))
    ]);
    return listResponse(rows, options, (row) =>
      mapContact(
        row,
        sellerNames.get(row.seller_id) ?? null,
        sellerCountries.get(row.seller_id) ?? null,
        sourceTypes.get(row.source_id) ?? null
      )
    );
  }

  async metrics(): Promise<OperatorMetrics> {
    const core = requireDb(this.env.CORE_DB, "CORE_DB");
    const contacts = requireDb(this.env.CONTACTS_DB, "CONTACTS_DB");
    const operations = requireDb(this.env.OPS_DB, "OPS_DB");
    const [sellers, contactsCount, duplicates, active, queued, failures, cooldowns] = await Promise.all([
      core.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN first_seen_at >= date('now') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN official_domain IS NOT NULL THEN 1 ELSE 0 END) AS official,
        (SELECT COUNT(DISTINCT seller_id) FROM marketplace_accounts WHERE marketplace LIKE 'amazon.%') AS amazon
        FROM sellers WHERE status <> 'merged'`).first<Record<string, number>>(),
      contacts.prepare("SELECT COUNT(*) AS total FROM contacts WHERE status = 'active'").first<{ total: number }>(),
      core.prepare("SELECT COUNT(*) AS total FROM entity_resolution_decisions WHERE action = 'review_queue' AND status = 'pending'").first<{ total: number }>(),
      operations.prepare("SELECT COUNT(*) AS total FROM operator_crawl_runs WHERE active_unit_slot = 1").first<{ total: number }>(),
      operations.prepare("SELECT COUNT(*) AS total FROM operator_crawl_runs WHERE status = 'queued'").first<{ total: number }>(),
      operations.prepare("SELECT COUNT(*) AS total FROM operator_crawl_runs WHERE status IN ('failed','blocked') AND updated_at >= datetime('now','-7 days')").first<{ total: number }>(),
      operations.prepare("SELECT COUNT(DISTINCT source_domain) AS total FROM sources WHERE next_allowed_at > datetime('now')").first<{ total: number }>()
    ]);
    return {
      totalSellers: Number(sellers?.total ?? 0),
      newSellersToday: Number(sellers?.today ?? 0),
      amazonIdentitiesDiscovered: Number(sellers?.amazon ?? 0),
      officialWebsitesResolved: Number(sellers?.official ?? 0),
      contactsFound: Number(contactsCount?.total ?? 0),
      pendingDuplicates: Number(duplicates?.total ?? 0),
      activeCrawls: Number(active?.total ?? 0),
      queuedRuns: Number(queued?.total ?? 0),
      recentFailures: Number(failures?.total ?? 0),
      cooldownDomains: Number(cooldowns?.total ?? 0)
    };
  }

  async revealContact(
    contactId: string,
    actorId: string,
    reason: string
  ): Promise<ContactRevealResponse | null> {
    const contactsDb = requireDb(this.env.CONTACTS_DB, "CONTACTS_DB");
    if (!this.env.CONTACT_ENCRYPTION_KEYS) {
      throw new Error("CONTACT_ENCRYPTION_KEYS is not configured.");
    }
    const contacts = new ContactsRepository(contactsDb);
    const record = await contacts.getActiveContactForReveal(contactId);
    if (!record) {
      return null;
    }
    const decrypted = await decryptContactValue(
      record.contact_value_ciphertext,
      this.env.CONTACT_ENCRYPTION_KEYS,
      {
        contactId: record.id,
        sellerId: record.seller_id,
        contactType: record.contact_type
      }
    );
    const revealedAt = new Date().toISOString();
    await contacts.insertAuditEvent({
      id: newUuidV7(),
      eventType: "contact_revealed",
      entityType: "contact",
      entityId: record.id,
      actorId,
      oldValueHash: record.normalized_hash,
      oldValueMasked: record.display_value_masked,
      reason,
      metadataJson: JSON.stringify({ key_version: decrypted.keyVersion, access: "single_operator" }),
      createdAt: revealedAt
    });
    return {
      id: record.id,
      contactType: record.contact_type,
      value: decrypted.value,
      revealedAt
    };
  }

  async listDuplicates(options: ListOptions): Promise<ListResponse<DuplicateReviewItem>> {
    const core = requireDb(this.env.CORE_DB, "CORE_DB");
    const clauses = ["d.action = 'review_queue'"];
    const values: D1Value[] = [];
    if (options.status) {
      clauses.push("d.status = ?");
      values.push(options.status);
    }
    if (options.query) {
      clauses.push("(d.candidate_seller_id = ? OR d.matched_seller_id = ?)");
      values.push(options.query, options.query);
    }
    values.push(options.limit, options.offset);
    const result = await core
      .prepare(
        `SELECT d.id, d.candidate_seller_id, candidate.canonical_name AS candidate_name,
                d.matched_seller_id, matched.canonical_name AS matched_name, d.action, d.score,
                d.score_breakdown_json, d.status, d.created_at, COUNT(*) OVER() AS total_count
         FROM entity_resolution_decisions d
         JOIN sellers candidate ON candidate.id = d.candidate_seller_id
         JOIN sellers matched ON matched.id = d.matched_seller_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY d.created_at DESC, d.id ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<DuplicateRow>();

    return listResponse(result.results ?? [], options, mapDuplicate);
  }

  async listCrawlRuns(options: ListOptions): Promise<ListResponse<CrawlRunItem>> {
    const operations = requireDb(this.env.OPS_DB, "OPS_DB");
    const clauses: string[] = [];
    const values: D1Value[] = [];
    if (options.status) {
      clauses.push("status = ?");
      values.push(options.status);
    }
    values.push(options.limit, options.offset);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await operations
      .prepare(
        `SELECT id, job_type, zyte_job_id, started_at, finished_at, status, requests_total,
                responses_success, candidates_found, records_created, records_updated,
                contacts_verified, blocked_count, error_count, notes,
                COUNT(*) OVER() AS total_count
         FROM crawl_runs ${where}
         ORDER BY started_at DESC, id ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<CrawlRunRow>();

    return listResponse(result.results ?? [], options, mapCrawlRun);
  }

  exportLimit(): number {
    return MAX_EXPORT_ROWS;
  }

  private async getSellerNames(sellerIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(sellerIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const core = requireDb(this.env.CORE_DB, "CORE_DB");
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const result = await core
      .prepare(`SELECT id, canonical_name FROM sellers WHERE id IN (${placeholders})`)
      .bind(...uniqueIds)
      .all<SellerNameRow>();
    return new Map((result.results ?? []).map((row) => [row.id, row.canonical_name]));
  }

  private async getSellerCountries(sellerIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(sellerIds)];
    if (!ids.length) return new Map();
    const result = await requireDb(this.env.CORE_DB, "CORE_DB")
      .prepare(`SELECT id, country_code FROM sellers WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string; country_code: string | null }>();
    return new Map((result.results ?? []).flatMap((row) => row.country_code ? [[row.id, row.country_code] as const] : []));
  }

  private async getSourceTypes(sourceIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(sourceIds)];
    if (!ids.length) return new Map();
    const result = await requireDb(this.env.OPS_DB, "OPS_DB")
      .prepare(`SELECT id, source_type FROM sources WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string; source_type: string }>();
    return new Map((result.results ?? []).map((row) => [row.id, row.source_type]));
  }

  private async getContactMetadata(sellerIds: string[]): Promise<Map<string, ContactMetadataRow>> {
    const ids = [...new Set(sellerIds)];
    if (!ids.length) return new Map();
    const result = await requireDb(this.env.CONTACTS_DB, "CONTACTS_DB")
      .prepare(`SELECT seller_id, COUNT(*) AS contact_count, group_concat(DISTINCT contact_type) AS contact_types
        FROM contacts WHERE status = 'active' AND seller_id IN (${ids.map(() => "?").join(",")}) GROUP BY seller_id`)
      .bind(...ids)
      .all<ContactMetadataRow>();
    return new Map((result.results ?? []).map((row) => [row.seller_id, row]));
  }

  private async prefilterSellerIds(options: ListOptions): Promise<string[] | null> {
    const sets: string[][] = [];
    if (options.contactType) {
      const result = await requireDb(this.env.CONTACTS_DB, "CONTACTS_DB")
        .prepare("SELECT DISTINCT seller_id FROM contacts WHERE status = 'active' AND contact_type = ? LIMIT 5000")
        .bind(options.contactType)
        .all<{ seller_id: string }>();
      sets.push((result.results ?? []).map((row) => row.seller_id));
    }
    if (options.sourceType) {
      const result = await requireDb(this.env.OPS_DB, "OPS_DB")
        .prepare("SELECT DISTINCT seller_id FROM sources WHERE seller_id IS NOT NULL AND source_type = ? LIMIT 5000")
        .bind(options.sourceType)
        .all<{ seller_id: string }>();
      sets.push((result.results ?? []).map((row) => row.seller_id));
    }
    if (options.sourceRunId) {
      const result = await requireDb(this.env.OPS_DB, "OPS_DB")
        .prepare("SELECT DISTINCT seller_id FROM crawl_run_sellers WHERE crawl_run_id = ? LIMIT 5000")
        .bind(options.sourceRunId)
        .all<{ seller_id: string }>();
      sets.push((result.results ?? []).map((row) => row.seller_id));
    }
    if (!sets.length) return null;
    return sets.slice(1).reduce((current, next) => current.filter((id) => next.includes(id)), sets[0]);
  }

  private async contactSellerFilterIds(options: ContactListOptions): Promise<string[] | null> {
    if (!options.countryCode && !options.query) return null;
    const clauses: string[] = [];
    const values: D1Value[] = [];
    if (options.countryCode) { clauses.push("country_code = ?"); values.push(options.countryCode.toUpperCase()); }
    if (options.query) {
      const fts = toFtsQuery(options.query);
      if (fts) { clauses.push("id IN (SELECT seller_id FROM seller_search_fts WHERE seller_search_fts MATCH ?)"); values.push(fts); }
    }
    const result = await requireDb(this.env.CORE_DB, "CORE_DB")
      .prepare(`SELECT id FROM sellers WHERE ${clauses.join(" AND ")} LIMIT 5000`)
      .bind(...values)
      .all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }

  private async contactSourceFilterIds(sourceType: string | undefined): Promise<string[] | null> {
    if (!sourceType) return null;
    const result = await requireDb(this.env.OPS_DB, "OPS_DB")
      .prepare("SELECT id FROM sources WHERE source_type = ? LIMIT 5000")
      .bind(sourceType)
      .all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }

  private async contactSellerRank(): Promise<string[]> {
    const result = await requireDb(this.env.CONTACTS_DB, "CONTACTS_DB")
      .prepare("SELECT seller_id FROM contacts WHERE status = 'active' GROUP BY seller_id ORDER BY COUNT(*) DESC, seller_id LIMIT 5000")
      .all<{ seller_id: string }>();
    return (result.results ?? []).map((row) => row.seller_id);
  }
}

export function parseListOptions(url: URL): ListOptions {
  return {
    limit: boundedInteger(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: boundedInteger(url.searchParams.get("offset"), 0, 0, 10_000),
    query: cleanText(url.searchParams.get("q"), 100),
    status: cleanText(url.searchParams.get("status"), 32),
    marketplace: cleanText(url.searchParams.get("marketplace"), 32),
    countryCode: cleanText(url.searchParams.get("country"), 2),
    category: cleanText(url.searchParams.get("category"), 80),
    brand: cleanText(url.searchParams.get("brand"), 80),
    sourceType: cleanText(url.searchParams.get("source"), 40),
    amazonSeller: cleanText(url.searchParams.get("amazon_seller"), 120),
    hasOfficialWebsite: optionalBoolean(url.searchParams.get("has_official_website")),
    contactType: cleanText(url.searchParams.get("contact_type"), 32),
    minimumManufacturerScore: optionalBoundedInteger(url.searchParams.get("manufacturer_score"), 0, 100),
    minimumTraderScore: optionalBoundedInteger(url.searchParams.get("trader_score"), 0, 100),
    duplicateStatus: cleanText(url.searchParams.get("duplicate_status"), 32),
    updatedSince: cleanText(url.searchParams.get("updated_since"), 40),
    sort: cleanText(url.searchParams.get("sort"), 32),
    sourceRunId: cleanText(url.searchParams.get("source_run"), 64)
  };
}

export function parseContactListOptions(url: URL): ContactListOptions {
  const options = parseListOptions(url);
  const rawConfidence = url.searchParams.get("minimum_confidence");
  return {
    ...options,
    sellerId: cleanText(url.searchParams.get("seller_id"), 64),
    contactType: cleanText(url.searchParams.get("contact_type"), 32),
    minimumConfidence:
      rawConfidence === null ? undefined : boundedInteger(rawConfidence, 0, 0, 100),
    countryCode: cleanText(url.searchParams.get("country"), 2),
    sourceType: cleanText(url.searchParams.get("source"), 40),
    verifiedStatus: cleanText(url.searchParams.get("verified"), 16)
  };
}

export function exportListOptions(url: URL): ListOptions {
  return {
    ...parseListOptions(url),
    limit: MAX_EXPORT_ROWS,
    offset: 0
  };
}

function requireDb(database: D1Database | undefined, binding: string): D1Database {
  if (!database) {
    throw new Error(`${binding} is not configured.`);
  }
  return database;
}

function listResponse<TRow extends CountedRow, TItem>(
  rows: TRow[],
  options: Pick<ListOptions, "limit" | "offset">,
  mapper: (row: TRow) => TItem
): ListResponse<TItem> {
  return {
    items: rows.map(mapper),
    total: Number(rows[0]?.total_count ?? 0),
    limit: options.limit,
    offset: options.offset
  };
}

function mapSeller(row: SellerRow, metadata?: ContactMetadataRow): SellerListItem {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    legalName: row.legal_name,
    countryCode: row.country_code,
    province: row.province,
    city: row.city,
    officialDomain: row.official_domain,
    identityConfidence: row.identity_confidence,
    qualityScore: row.quality_score,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
    marketplace: row.marketplace ?? null,
    marketplaceDisplayName: row.marketplace_display_name ?? null,
    marketplaceProfileUrl: row.marketplace_profile_url ?? null,
    manufacturerScore: Number(row.manufacturer_score ?? 0),
    traderScore: Number(row.trader_score ?? 0),
    contactCount: Number(metadata?.contact_count ?? 0),
    contactTypes: metadata?.contact_types ? metadata.contact_types.split(",") : [],
    duplicateStatus: row.duplicate_status ?? null
  };
}

function mapContact(
  row: ContactRow,
  sellerName: string | null,
  sellerCountryCode: string | null,
  sourceType: string | null
): ContactListItem {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName,
    contactType: row.contact_type,
    displayValueMasked: row.display_value_masked,
    classification: row.classification,
    confidence: row.confidence,
    sourceId: row.source_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastVerifiedAt: row.last_verified_at,
    status: row.status,
    sellerCountryCode,
    sourceType
  };
}

function mapEvidence(row: EvidenceRow): EvidenceListItem {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    canonicalUrl: row.canonical_url,
    pageTitle: row.page_title,
    evidenceSnippet: row.evidence_snippet,
    contentHash: row.content_hash,
    detectedAt: row.detected_at,
    lastSeenAt: row.last_seen_at,
    httpStatus: row.http_status,
    robotsStatus: row.robots_status,
    status: row.status
  };
}

function mapDuplicate(row: DuplicateRow): DuplicateReviewItem {
  return {
    id: row.id,
    candidateSellerId: row.candidate_seller_id,
    candidateName: row.candidate_name,
    matchedSellerId: row.matched_seller_id,
    matchedName: row.matched_name,
    action: row.action,
    score: row.score,
    scoreBreakdown: parseJson(row.score_breakdown_json),
    status: row.status,
    createdAt: row.created_at
  };
}

function mapCrawlRun(row: CrawlRunRow): CrawlRunItem {
  return {
    id: row.id,
    jobType: row.job_type,
    zyteJobId: row.zyte_job_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    requestsTotal: row.requests_total,
    responsesSuccess: row.responses_success,
    candidatesFound: row.candidates_found,
    recordsCreated: row.records_created,
    recordsUpdated: row.records_updated,
    contactsVerified: row.contacts_verified,
    blockedCount: row.blocked_count,
    errorCount: row.error_count,
    notes: row.notes
  };
}

function boundedInteger(raw: string | null, fallback: number, minimum: number, maximum: number): number {
  if (raw === null || !/^\d+$/.test(raw)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Number(raw)));
}

function optionalBoundedInteger(raw: string | null, minimum: number, maximum: number): number | undefined {
  return raw === null ? undefined : boundedInteger(raw, minimum, minimum, maximum);
}

function optionalBoolean(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

function sellerSort(value: string | undefined): string {
  return {
    newest: "s.first_seen_at DESC",
    recently_updated: "s.updated_at DESC",
    highest_confidence: "s.identity_confidence DESC",
    most_contacts: "s.last_seen_at DESC",
    seller_name: "s.canonical_name COLLATE NOCASE ASC"
  }[value ?? ""] ?? "s.last_seen_at DESC";
}

function cleanText(raw: string | null, maximumLength: number): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  return value.slice(0, maximumLength);
}

function toFtsQuery(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const tokens = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  if (tokens.length === 0) {
    return undefined;
  }
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
