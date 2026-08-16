import type {
  ContactListItem,
  ContactRevealResponse,
  CrawlRunItem,
  DuplicateReviewItem,
  EvidenceListItem,
  ListResponse,
  SellerDetailResponse,
  SellerListItem
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
}

export interface ContactListOptions extends ListOptions {
  contactType?: string;
  sellerId?: string;
  minimumConfidence?: number;
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

    values.push(options.limit, options.offset);
    const result = await core
      .prepare(
        `SELECT s.id, s.canonical_name, s.legal_name, s.country_code, s.province, s.city,
                s.official_domain, s.identity_confidence, s.quality_score, s.status,
                s.first_seen_at, s.last_seen_at, s.updated_at, COUNT(*) OVER() AS total_count
         FROM sellers s
         WHERE ${clauses.join(" AND ")}
         ORDER BY s.last_seen_at DESC, s.id ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<SellerRow>();

    return listResponse(result.results ?? [], options, mapSeller);
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

    const [aliasResult, contacts, evidenceResult, duplicateResult] = await Promise.all([
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
      this.listDuplicates({ limit: MAX_LIMIT, offset: 0, query: sellerId })
    ]);

    return {
      seller: mapSeller(seller),
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
    if (options.query) {
      clauses.push("(c.display_value_masked LIKE ? OR c.classification LIKE ?)");
      const pattern = `%${escapeLike(options.query)}%`;
      values.push(pattern, pattern);
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
    const sellerNames = await this.getSellerNames(rows.map((row) => row.seller_id));
    return listResponse(rows, options, (row) => mapContact(row, sellerNames.get(row.seller_id) ?? null));
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
}

export function parseListOptions(url: URL): ListOptions {
  return {
    limit: boundedInteger(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: boundedInteger(url.searchParams.get("offset"), 0, 0, 10_000),
    query: cleanText(url.searchParams.get("q"), 100),
    status: cleanText(url.searchParams.get("status"), 32)
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
      rawConfidence === null ? undefined : boundedInteger(rawConfidence, 0, 0, 100)
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

function mapSeller(row: SellerRow): SellerListItem {
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
    updatedAt: row.updated_at
  };
}

function mapContact(row: ContactRow, sellerName: string | null): ContactListItem {
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
    status: row.status
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
