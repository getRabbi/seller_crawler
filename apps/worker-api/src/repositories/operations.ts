import { nullable, runStatement, type D1Database, type D1Result } from "./d1";
import { assertUuidV7Compatible } from "./ids";
import type {
  CrawlRunWrite,
  FeatureFlagWrite,
  IdempotencyKeyWrite,
  IngestionNonceWrite,
  QuotaStateWrite,
  ReviewQueueWrite,
  SourceRegistryWrite,
  SourceWrite
} from "./types";

export class OperationsRepository {
  constructor(private readonly db: D1Database) {}

  async upsertSource(record: SourceWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    if (record.sellerId) {
      assertUuidV7Compatible(record.sellerId, "seller_id");
    }

    return runStatement(
      this.db,
       `INSERT INTO sources (
         id, seller_id, source_url, canonical_url, source_domain, source_type,
         robots_status, terms_risk, http_status, page_title, evidence_snippet,
         content_hash, r2_object_key, detected_at, last_seen_at, first_seen_at,
         last_fetched_at, last_success_at, next_allowed_at, schema_version,
         parser_version, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         seller_id = excluded.seller_id,
         source_url = excluded.source_url,
         canonical_url = excluded.canonical_url,
         source_domain = excluded.source_domain,
         source_type = excluded.source_type,
         robots_status = excluded.robots_status,
         terms_risk = excluded.terms_risk,
         http_status = excluded.http_status,
         page_title = excluded.page_title,
         evidence_snippet = excluded.evidence_snippet,
         content_hash = excluded.content_hash,
         r2_object_key = excluded.r2_object_key,
         detected_at = COALESCE(sources.detected_at, excluded.detected_at),
         last_seen_at = excluded.last_seen_at,
         last_fetched_at = excluded.last_fetched_at,
         last_success_at = excluded.last_success_at,
         next_allowed_at = excluded.next_allowed_at,
         schema_version = excluded.schema_version,
         parser_version = excluded.parser_version,
         status = excluded.status`,
      [
        record.id,
        nullable(record.sellerId),
        record.sourceUrl,
        record.canonicalUrl,
        record.sourceDomain,
        record.sourceType,
        nullable(record.robotsStatus),
        nullable(record.termsRisk),
        nullable(record.httpStatus),
        nullable(record.pageTitle),
        nullable(record.evidenceSnippet),
        nullable(record.contentHash),
        nullable(record.r2ObjectKey),
        nullable(record.detectedAt),
        nullable(record.lastSeenAt),
        record.firstSeenAt,
        nullable(record.lastFetchedAt),
        nullable(record.lastSuccessAt),
        nullable(record.nextAllowedAt),
        record.schemaVersion ?? 1,
        record.parserVersion,
        record.status ?? "active"
      ]
    );
  }

  async upsertCrawlRun(record: CrawlRunWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    return runStatement(
      this.db,
      `INSERT INTO crawl_runs (
         id, job_type, zyte_job_id, started_at, finished_at, status,
         requests_total, responses_success, candidates_found, records_created,
         records_updated, contacts_verified, blocked_count, error_count, notes
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         zyte_job_id = excluded.zyte_job_id,
         finished_at = excluded.finished_at,
         status = excluded.status,
         requests_total = excluded.requests_total,
         responses_success = excluded.responses_success,
         candidates_found = excluded.candidates_found,
         records_created = excluded.records_created,
         records_updated = excluded.records_updated,
         contacts_verified = excluded.contacts_verified,
         blocked_count = excluded.blocked_count,
         error_count = excluded.error_count,
         notes = excluded.notes`,
      [
        record.id,
        record.jobType,
        nullable(record.zyteJobId),
        record.startedAt,
        nullable(record.finishedAt),
        record.status,
        record.requestsTotal ?? 0,
        record.responsesSuccess ?? 0,
        record.candidatesFound ?? 0,
        record.recordsCreated ?? 0,
        record.recordsUpdated ?? 0,
        record.contactsVerified ?? 0,
        record.blockedCount ?? 0,
        record.errorCount ?? 0,
        nullable(record.notes)
      ]
    );
  }

  async upsertReviewQueueItem(record: ReviewQueueWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    return runStatement(
      this.db,
      `INSERT INTO review_queue (
         id, review_type, entity_id, priority, payload_json, reason, status,
         created_at, reviewed_at, reviewed_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         review_type = excluded.review_type,
         entity_id = excluded.entity_id,
         priority = excluded.priority,
         payload_json = excluded.payload_json,
         reason = excluded.reason,
         status = excluded.status,
         reviewed_at = excluded.reviewed_at,
         reviewed_by = excluded.reviewed_by`,
      [
        record.id,
        record.reviewType,
        record.entityId,
        record.priority ?? 2,
        record.payloadJson,
        record.reason,
        record.status ?? "pending",
        record.createdAt,
        nullable(record.reviewedAt),
        nullable(record.reviewedBy)
      ]
    );
  }

  async upsertSourceRegistry(record: SourceRegistryWrite): Promise<D1Result> {
    return runStatement(
      this.db,
      `INSERT INTO source_registry (
         adapter_name, source_family, enabled, risk_level, robots_policy,
         terms_review_status, daily_request_budget, concurrency_per_domain,
         minimum_delay_seconds, blocked_until, parser_version, last_success_at,
         last_failure_at, operator_notes
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(adapter_name) DO UPDATE SET
         source_family = excluded.source_family,
         enabled = excluded.enabled,
         risk_level = excluded.risk_level,
         robots_policy = excluded.robots_policy,
         terms_review_status = excluded.terms_review_status,
         daily_request_budget = excluded.daily_request_budget,
         concurrency_per_domain = excluded.concurrency_per_domain,
         minimum_delay_seconds = excluded.minimum_delay_seconds,
         blocked_until = excluded.blocked_until,
         parser_version = excluded.parser_version,
         last_success_at = excluded.last_success_at,
         last_failure_at = excluded.last_failure_at,
         operator_notes = excluded.operator_notes`,
      [
        record.adapterName,
        record.sourceFamily,
        record.enabled ? 1 : 0,
        record.riskLevel,
        record.robotsPolicy,
        record.termsReviewStatus,
        record.dailyRequestBudget ?? 0,
        record.concurrencyPerDomain ?? 1,
        record.minimumDelaySeconds ?? 2.5,
        nullable(record.blockedUntil),
        record.parserVersion,
        nullable(record.lastSuccessAt),
        nullable(record.lastFailureAt),
        nullable(record.operatorNotes)
      ]
    );
  }

  async getIdempotencyKey(idempotencyKey: string): Promise<IdempotencyKeyWrite | null> {
    return this.db
      .prepare(
        `SELECT idempotency_key AS idempotencyKey,
                request_hash AS requestHash,
                response_status AS responseStatus,
                created_at AS createdAt,
                expires_at AS expiresAt
         FROM idempotency_keys
         WHERE idempotency_key = ?
         LIMIT 1`
      )
      .bind(idempotencyKey)
      .first<IdempotencyKeyWrite>();
  }

  async recordIdempotencyKey(record: IdempotencyKeyWrite): Promise<D1Result> {
    return runStatement(
      this.db,
      `INSERT INTO idempotency_keys (
         idempotency_key, request_hash, response_status, created_at, expires_at
       )
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        record.idempotencyKey,
        record.requestHash,
        record.responseStatus,
        record.createdAt,
        record.expiresAt
      ]
    );
  }

  async getIngestionNonce(nonce: string): Promise<IngestionNonceWrite | null> {
    return this.db
      .prepare(
        `SELECT nonce,
                idempotency_key AS idempotencyKey,
                request_hash AS requestHash,
                created_at AS createdAt,
                expires_at AS expiresAt
         FROM ingestion_nonces
         WHERE nonce = ?
         LIMIT 1`
      )
      .bind(nonce)
      .first<IngestionNonceWrite>();
  }

  async recordIngestionNonce(record: IngestionNonceWrite): Promise<D1Result> {
    return runStatement(
      this.db,
      `INSERT INTO ingestion_nonces (
         nonce, idempotency_key, request_hash, created_at, expires_at
       )
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(nonce) DO NOTHING`,
      [
        record.nonce,
        record.idempotencyKey,
        record.requestHash,
        record.createdAt,
        record.expiresAt
      ]
    );
  }

  async upsertQuotaState(record: QuotaStateWrite): Promise<D1Result> {
    return runStatement(
      this.db,
      `INSERT INTO quota_state (
         quota_name, window_start, used, soft_limit, hard_limit, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(quota_name) DO UPDATE SET
         window_start = excluded.window_start,
         used = excluded.used,
         soft_limit = excluded.soft_limit,
         hard_limit = excluded.hard_limit,
         updated_at = excluded.updated_at`,
      [
        record.quotaName,
        record.windowStart,
        record.used ?? 0,
        record.softLimit,
        record.hardLimit,
        record.updatedAt
      ]
    );
  }

  async upsertFeatureFlag(record: FeatureFlagWrite): Promise<D1Result> {
    return runStatement(
      this.db,
      `INSERT INTO feature_flags (
         flag_name, enabled, source, updated_at, operator_notes
       )
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(flag_name) DO UPDATE SET
         enabled = excluded.enabled,
         source = excluded.source,
         updated_at = excluded.updated_at,
         operator_notes = excluded.operator_notes`,
      [
        record.flagName,
        record.enabled ? 1 : 0,
        record.source ?? "env_default",
        record.updatedAt,
        nullable(record.operatorNotes)
      ]
    );
  }
}
