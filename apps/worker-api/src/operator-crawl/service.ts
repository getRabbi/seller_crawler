import type {
  CreateCrawlRunRequest,
  CrawlRunActionResponse,
  CrawlRunDetailResponse,
  CrawlRunItem,
  SellerListItem
} from "@seller-intelligence/shared-types/dashboard";

import type { D1Database, D1Result, D1Value } from "../repositories/d1";
import { newUuidV7 } from "../repositories/ids";
import { readRuntimeState, startupGateViolations, type RuntimeEnv } from "../validation/startup";

export const SUPPORTED_AMAZON_MARKETPLACES = [
  "amazon.com",
  "amazon.co.uk",
  "amazon.ca",
  "amazon.com.au",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es"
] as const;

const CONTACT_TYPES = new Set(["email", "phone", "whatsapp", "wechat", "contact_form"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "completed_with_warnings",
  "failed",
  "blocked",
  "cooldown",
  "cancelled"
]);
const API_BASE = "https://app.zyte.com/api";
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OFFICIAL_PAGES_PER_RUN = 100;
const MAX_DOMAIN_CANDIDATES_PER_RUN = 25;
const MAX_OFFICIAL_SITES_PER_RUN = 25;
const MAX_AMAZON_RESULT_PAGES_PER_KEYWORD = 15;
const MAX_AMAZON_RESPONSES_PER_RUN = 700;

interface OfficialSellerTarget {
  sellerId: string;
  sellerName: string;
  seedUrl: string;
}

interface DomainCandidateTarget extends OfficialSellerTarget {
  sellerNames: string[];
  candidateBasis: string;
}

interface CrawlerOutcome {
  status: string;
  contacts_verified: number;
  blocked_count: number;
  error_count: number;
}

interface OperatorRunRow {
  id: string;
  mode: "find_sellers" | "known_websites";
  query_json: string;
  marketplace: string | null;
  country_codes_json: string;
  filters_json: string;
  seed_urls_json: string;
  contact_types_json: string;
  target_seller_count: number;
  max_result_pages: number;
  max_official_pages: number;
  crawl_depth: number;
  stop_after_target: number;
  status: string;
  stage: string;
  active_unit_slot: number | null;
  zyte_job_id: string | null;
  retry_of_run_id: string | null;
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  approved_domains_json: string;
  artifact_version: string;
  discovered_sellers: number;
  enriched_sellers: number;
  contacts_found: number;
  warnings_json: string;
  error_code: string | null;
  error_message: string | null;
  search_fingerprint: string | null;
  total_count?: number;
  requests_total?: number;
  responses_success?: number;
  blocked_count?: number;
  error_count?: number;
}

interface EventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
}

interface ExistingIdempotency {
  request_hash: string;
  crawl_run_id: string;
}

interface HistoricalSearchScope {
  id: string;
  query_json: string;
  marketplace: string | null;
  country_codes_json: string;
  filters_json: string;
}

interface CloudJob {
  id?: unknown;
  state?: unknown;
  close_reason?: unknown;
  tags?: unknown;
}

export class OperatorCrawlError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OperatorCrawlError";
  }
}

export class OperatorCrawlService {
  private readonly db: D1Database;

  constructor(private readonly env: RuntimeEnv) {
    if (!env.OPS_DB) throw new OperatorCrawlError(503, "operations_db_missing", "OPS_DB is not configured.");
    this.db = env.OPS_DB;
  }

  async create(raw: unknown, actorId: string): Promise<CrawlRunActionResponse> {
    this.assertOperational();
    const input = validateCreateRequest(raw);
    const requestHash = await sha256Hex(stableJson(input));
    const existing = await this.db
      .prepare(
        "SELECT request_hash, crawl_run_id FROM operator_crawl_idempotency WHERE idempotency_key = ? AND expires_at > ? LIMIT 1"
      )
      .bind(input.idempotencyKey, new Date().toISOString())
      .first<ExistingIdempotency>();
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new OperatorCrawlError(409, "idempotency_conflict", "Idempotency key was reused with different crawl parameters.");
      }
      const run = await this.getRun(existing.crawl_run_id);
      if (!run) throw new OperatorCrawlError(409, "idempotency_orphaned", "The idempotent crawl run is unavailable.");
      return { run: mapRun(run), queued: run.status === "queued" };
    }

    const searchSignature = input.mode === "find_sellers" ? normalizedSearchSignature(input) : null;
    const searchFingerprint = searchSignature ? await sha256Hex(searchSignature) : null;
    if (searchFingerprint && searchSignature) {
      const duplicate = await this.equivalentSearch(searchFingerprint, searchSignature, input.marketplace as string);
      if (duplicate) {
        return {
          run: mapRun(duplicate),
          queued: duplicate.status === "queued",
          skipped: true,
          skipReason: "duplicate_search",
          duplicateOfRunId: duplicate.id
        };
      }
    }

    const knownSellerTarget = await this.resolveKnownSellerTarget(input);
    const resolutionSeller = await this.resolveAutomaticSellerTarget(input);

    const id = newUuidV7();
    const now = new Date();
    const approvedDomains =
      input.mode === "find_sellers"
        ? [input.marketplace as string]
        : input.mode === "known_websites"
          ? (input.seedUrls ?? []).map((value) => new URL(value).hostname.toLowerCase())
          : [];
    const artifactVersion = this.env.SCRAPY_CLOUD_ARTIFACT_VERSION?.trim() || "main";
    try {
      await this.db
        .prepare(
          `INSERT INTO operator_crawl_runs (
            id, mode, query_json, marketplace, country_codes_json, filters_json,
            seed_urls_json, contact_types_json, target_seller_count, max_result_pages,
            max_official_pages, crawl_depth, stop_after_target, status, stage,
            requested_by, requested_at, updated_at, approved_domains_json, artifact_version,
            search_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.mode === "resolve_seller" ? "known_websites" : input.mode,
          JSON.stringify(input.keywords ?? []),
          input.marketplace ?? null,
          JSON.stringify(input.countryCodes ?? []),
          JSON.stringify(
            input.mode === "find_sellers"
              ? input.filters ?? {}
              : knownSellerTarget
                ? {
                    targetSellerId: knownSellerTarget.sellerId,
                    targetSellerName: knownSellerTarget.sellerName
                  }
                : resolutionSeller
                  ? {
                      targetSellerId: resolutionSeller.sellerId,
                      targetSellerName: resolutionSeller.sellerName,
                      automaticResolution: true
                    }
                  : {}
          ),
          JSON.stringify(input.seedUrls ?? []),
          JSON.stringify(input.contactTypes),
          input.targetSellerCount,
          input.maxResultPages,
          input.maxOfficialPages,
          input.crawlDepth,
          input.stopAfterTarget ? 1 : 0,
          actorId,
          now.toISOString(),
          now.toISOString(),
          JSON.stringify([...new Set(approvedDomains)]),
          artifactVersion,
          searchFingerprint
        )
        .run();
    } catch (error) {
      if (searchFingerprint && searchSignature) {
        const duplicate = await this.equivalentSearch(
          searchFingerprint,
          searchSignature,
          input.marketplace as string
        );
        if (duplicate) {
          return {
            run: mapRun(duplicate),
            queued: duplicate.status === "queued",
            skipped: true,
            skipReason: "duplicate_search",
            duplicateOfRunId: duplicate.id
          };
        }
      }
      throw error;
    }
    if (resolutionSeller) {
      await this.linkRunSeller(id, resolutionSeller.sellerId, "discovered", now.toISOString());
    }
    await this.db
      .prepare(
        "INSERT INTO operator_crawl_idempotency (idempotency_key, request_hash, crawl_run_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(
        input.idempotencyKey,
        requestHash,
        id,
        now.toISOString(),
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      )
      .run();
    await this.event(
      id,
      "created",
      actorId,
      null,
      "queued",
      knownSellerTarget
        ? "Operator created a bounded crawl run linked to an existing canonical seller."
        : resolutionSeller
          ? "Operator created bounded automatic domain resolution for an existing canonical seller."
        : "Operator created a bounded crawl run."
    );
    await this.pump();
    const run = await this.getRun(id);
    if (!run) throw new OperatorCrawlError(503, "crawl_create_failed", "Crawl run could not be loaded after creation.");
    return { run: mapRun(run), queued: run.status === "queued" };
  }

  private async equivalentSearch(
    fingerprint: string,
    signature: string,
    marketplace: string
  ): Promise<OperatorRunRow | null> {
    const current = await this.db
      .prepare(
        "SELECT * FROM operator_crawl_runs WHERE search_fingerprint = ? AND retry_of_run_id IS NULL ORDER BY requested_at ASC LIMIT 1"
      )
      .bind(fingerprint)
      .first<OperatorRunRow>();
    if (current) return current;

    const historical = await this.db
      .prepare(
        `SELECT id, query_json, marketplace, country_codes_json, filters_json
         FROM operator_crawl_runs
         WHERE mode = 'find_sellers' AND marketplace = ? AND search_fingerprint IS NULL`
      )
      .bind(marketplace)
      .all<HistoricalSearchScope>();
    for (const row of historical.results ?? []) {
      if (normalizedStoredSearchSignature(row) !== signature) continue;
      return this.getRun(row.id);
    }
    return null;
  }

  async list(limit: number, offset: number, status?: string): Promise<{ items: CrawlRunItem[]; total: number; limit: number; offset: number }> {
    await this.pump();
    return this.listSnapshot(limit, offset, status);
  }

  async listSnapshot(limit: number, offset: number, status?: string): Promise<{ items: CrawlRunItem[]; total: number; limit: number; offset: number }> {
    const clauses: string[] = [];
    const values: D1Value[] = [];
    if (status) {
      clauses.push("status = ?");
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    values.push(limit, offset);
    const result = await this.db
      .prepare(
        `SELECT o.*,
          COALESCE((SELECT requests_total FROM crawl_runs cr WHERE cr.id = o.id), 0) AS requests_total,
          COALESCE((SELECT responses_success FROM crawl_runs cr WHERE cr.id = o.id), 0) AS responses_success,
          COALESCE((SELECT blocked_count FROM crawl_runs cr WHERE cr.id = o.id), 0) AS blocked_count,
          COALESCE((SELECT error_count FROM crawl_runs cr WHERE cr.id = o.id), 0) AS error_count,
          COUNT(*) OVER() AS total_count FROM operator_crawl_runs o ${where}
         ORDER BY requested_at DESC, id ASC LIMIT ? OFFSET ?`
      )
      .bind(...values)
      .all<OperatorRunRow>();
    const rows = result.results ?? [];
    return { items: rows.map(mapRun), total: Number(rows[0]?.total_count ?? 0), limit, offset };
  }

  async detail(id: string): Promise<CrawlRunDetailResponse | null> {
    await this.refreshById(id);
    const run = await this.getRun(id);
    if (!run) return null;
    const [eventResult, sellerIds] = await Promise.all([
      this.db
        .prepare(
          "SELECT id, event_type, from_status, to_status, message, created_at FROM operator_crawl_events WHERE crawl_run_id = ? ORDER BY created_at, id"
        )
        .bind(id)
        .all<EventRow>(),
      this.runSellerIds(id)
    ]);
    return {
      run: mapRun(run),
      sellers: await this.sellersByIds(sellerIds),
      events: (eventResult.results ?? []).map((event) => ({
        id: event.id,
        eventType: event.event_type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        message: event.message,
        createdAt: event.created_at
      }))
    };
  }

  async cancel(id: string, actorId: string): Promise<CrawlRunActionResponse> {
    const run = await this.requireRun(id);
    if (TERMINAL_STATUSES.has(run.status)) {
      return { run: mapRun(run), queued: false };
    }
    let jobId = run.zyte_job_id;
    if (!jobId && run.status === "launching" && run.active_unit_slot === 1) {
      try {
        jobId = await this.taggedStageJob(run);
      } catch {
        throw new OperatorCrawlError(
          503,
          "launch_recovery_unavailable",
          "The launch outcome cannot be verified yet; cancellation was not applied."
        );
      }
      const leaseAge = Date.now() - Date.parse(run.updated_at);
      if (!jobId && (!Number.isFinite(leaseAge) || leaseAge < 120_000)) {
        throw new OperatorCrawlError(
          409,
          "launch_confirmation_pending",
          "Launch confirmation is still pending; retry cancellation after the recovery window."
        );
      }
    }
    if (jobId && run.active_unit_slot === 1) {
      await this.cloudRequest("POST", "/jobs/stop.json", {
        project: this.projectId(),
        job: jobId
      });
    }
    await this.transition(run, "cancelled", "cancelled", actorId, "Operator cancelled the crawl run.", true);
    await this.pump();
    const updated = await this.requireRun(id);
    return { run: mapRun(updated), queued: false };
  }

  async retry(id: string, actorId: string): Promise<CrawlRunActionResponse> {
    this.assertOperational();
    const source = await this.requireRun(id);
    if (!TERMINAL_STATUSES.has(source.status)) {
      throw new OperatorCrawlError(409, "crawl_not_retryable", "Only a terminal crawl run can be retried.");
    }
    const retryId = newUuidV7();
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO operator_crawl_runs (
          id, mode, query_json, marketplace, country_codes_json, filters_json, seed_urls_json,
          contact_types_json, target_seller_count, max_result_pages, max_official_pages,
          crawl_depth, stop_after_target, status, stage, retry_of_run_id, requested_by,
          requested_at, updated_at, approved_domains_json, artifact_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        retryId,
        source.mode,
        source.query_json,
        source.marketplace,
        source.country_codes_json,
        source.filters_json,
        source.seed_urls_json,
        source.contact_types_json,
        source.target_seller_count,
        source.max_result_pages,
        source.max_official_pages,
        source.crawl_depth,
        source.stop_after_target,
        source.id,
        actorId,
        now,
        now,
        source.approved_domains_json,
        source.artifact_version
      )
      .run();
    if (isAutomaticResolutionRun(source)) {
      const filters = parseObject(source.filters_json);
      const sellerId = stringValue(filters.targetSellerId);
      if (UUID_V7_PATTERN.test(sellerId)) {
        await this.linkRunSeller(retryId, sellerId, "discovered", now);
      }
    }
    await this.event(retryId, "retried", actorId, source.status, "queued", `Retry of ${source.id}.`);
    await this.pump();
    const retry = await this.requireRun(retryId);
    return { run: mapRun(retry), queued: retry.status === "queued" };
  }

  async pump(): Promise<void> {
    if (!this.operationalWithoutThrow()) return;
    const active = await this.db
      .prepare("SELECT * FROM operator_crawl_runs WHERE active_unit_slot = 1 LIMIT 1")
      .first<OperatorRunRow>();
    if (active) {
      if (active.zyte_job_id) {
        await this.syncActive(active);
      } else {
        await this.startActiveStage(active);
      }
      const stillActive = await this.db
        .prepare("SELECT id FROM operator_crawl_runs WHERE active_unit_slot = 1 LIMIT 1")
        .first<{ id: string }>();
      if (stillActive) return;
    }

    const queued = await this.db
      .prepare("SELECT * FROM operator_crawl_runs WHERE status = 'queued' ORDER BY requested_at, id LIMIT 1")
      .first<OperatorRunRow>();
    if (!queued) return;
    const queuedCooldownUntil = await this.amazonCooldownUntil(queued);
    if (queuedCooldownUntil) {
      await this.transitionToAmazonCooldown(
        queued,
        queuedCooldownUntil,
        "Amazon cooldown is still active; no Scrapy Cloud job was launched."
      );
      return;
    }
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET status = 'starting', stage = ?, active_unit_slot = 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
         WHERE id = ? AND status = 'queued'
           AND NOT EXISTS (SELECT 1 FROM operator_crawl_runs WHERE active_unit_slot = 1)`
      )
      .bind(
        queued.mode === "find_sellers"
          ? "discovering"
          : isAutomaticResolutionRun(queued)
            ? "resolving"
            : "enriching",
        now,
        now,
        queued.id
      )
      .run();
    const claimed = await this.getRun(queued.id);
    if (claimed?.active_unit_slot !== 1) return;
    await this.event(claimed.id, "starting", null, "queued", "starting", "One-unit slot acquired.");
    await this.startActiveStage(claimed);
  }

  async authorizedDomains(crawlRunId: string): Promise<Set<string>> {
    const row = await this.db
      .prepare("SELECT approved_domains_json FROM operator_crawl_runs WHERE id = ? LIMIT 1")
      .bind(crawlRunId)
      .first<{ approved_domains_json: string }>();
    return new Set(parseStringArray(row?.approved_domains_json));
  }

  async recordIngestion(
    crawlRunId: string,
    sellerIds: string[],
    sourceTypes: string[],
    contacts: Array<{ id: string; sellerId: string }>
  ): Promise<void> {
    const run = await this.getRun(crawlRunId);
    if (!run) return;
    const now = new Date().toISOString();
    const stages: string[] = [];
    if (sourceTypes.some((value) => value.startsWith("amazon"))) stages.push("discovered");
    if (sourceTypes.some((value) => value === "official_site") || contacts.length > 0) {
      stages.push("enriched");
    }
    for (const sellerId of new Set(sellerIds)) {
      for (const stage of stages) {
        await this.db
          .prepare(
            "INSERT INTO crawl_run_sellers (crawl_run_id, seller_id, stage, first_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
          )
          .bind(crawlRunId, sellerId, stage, now)
          .run();
      }
    }
    for (const contact of contacts) {
      await this.db
        .prepare(
          "INSERT INTO crawl_run_contacts (crawl_run_id, contact_id, seller_id, first_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
        )
        .bind(crawlRunId, contact.id, contact.sellerId, now)
        .run();
    }
    const counts = await this.db
      .prepare(
        `SELECT
          COUNT(DISTINCT CASE WHEN stage = 'discovered' THEN seller_id END) AS discovered,
          COUNT(DISTINCT CASE WHEN stage = 'enriched' THEN seller_id END) AS enriched
         FROM crawl_run_sellers WHERE crawl_run_id = ?`
      )
      .bind(crawlRunId)
      .first<{ discovered: number; enriched: number }>();
    const contactCounts = await this.db
      .prepare("SELECT COUNT(*) AS contacts_found FROM crawl_run_contacts WHERE crawl_run_id = ?")
      .bind(crawlRunId)
      .first<{ contacts_found: number }>();
    await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET discovered_sellers = ?, enriched_sellers = ?,
         contacts_found = ?,
         status = CASE WHEN status = 'running' THEN 'ingesting' ELSE status END, updated_at = ? WHERE id = ?`
      )
      .bind(
        Number(counts?.discovered ?? 0),
        Number(counts?.enriched ?? 0),
        Number(contactCounts?.contacts_found ?? 0),
        now,
        crawlRunId
      )
      .run();
  }

  private async syncActive(run: OperatorRunRow): Promise<void> {
    if (!run.zyte_job_id) return;
    let job: CloudJob;
    try {
      const payload = await this.cloudRequest(
        "GET",
        `/jobs/list.json?project=${encodeURIComponent(this.projectId())}&job=${encodeURIComponent(run.zyte_job_id)}&count=1`
      );
      job = Array.isArray(payload.jobs) && payload.jobs[0] && typeof payload.jobs[0] === "object"
        ? (payload.jobs[0] as CloudJob)
        : {};
    } catch {
      return;
    }
    const state = typeof job.state === "string" ? job.state.toLowerCase() : "unknown";
    const closeReason = typeof job.close_reason === "string" ? job.close_reason.toLowerCase() : "";
    if (state === "pending") return;
    if (state === "running") {
      if (run.status !== "running" && run.status !== "ingesting") {
        await this.transition(run, "running", run.stage, null, "Scrapy Cloud job is running.");
      }
      return;
    }
    if (state !== "finished") return;
    if (closeReason.includes("cancel")) {
      await this.transition(run, "cancelled", "cancelled", null, "Scrapy Cloud confirmed cancellation.", true);
      return;
    }
    const outcome = await this.crawlerOutcome(run.id);
    if (closeReason.includes("ingestion_rejected") || closeReason.includes("ingestion_spooled")) {
      await this.transition(
        run,
        "failed",
        "failed",
        null,
        "Crawler output could not be persisted safely.",
        true,
        closeReason.includes("ingestion_spooled") ? "ingestion_spooled" : "ingestion_rejected",
        "Signed ingestion did not reach a durable accepted state."
      );
      return;
    }
    if (outcome?.status === "paused_by_policy" || Number(outcome?.blocked_count ?? 0) > 0) {
      await this.transition(
        run,
        "blocked",
        "blocked",
        null,
        "Source policy stopped the crawl; no bypass or provider rotation was attempted.",
        true,
        "source_blocked",
        "The source returned an explicit access challenge or policy block.",
        ["source_blocked"]
      );
      return;
    }
    if (outcome?.status === "cooldown") {
      await this.transitionToAmazonCooldown(
        run,
        await this.amazonCooldownUntil(run),
        "Amazon returned HTTP 503 after one bounded retry; the source cooldown was recorded."
      );
      return;
    }
    const crawlerWarnings =
      outcome?.status === "completed_with_errors" || Number(outcome?.error_count ?? 0) > 0
        ? ["crawler_errors"]
        : [];
    if (run.mode === "find_sellers" && run.stage === "discovering") {
      const candidates = await this.domainCandidateTargetsForRun(run.id, run.marketplace);
      if (candidates.length > 0) {
        await this.handoff(
          run,
          "resolving",
          candidates.map((target) => target.seedUrl),
          crawlerWarnings,
          "Official-domain verification started on the same one-unit slot.",
          undefined,
          candidates
        );
        return;
      }
      const targets = await this.officialTargetsForRun(run.id);
      if (targets.length > 0) {
        await this.handoff(
          run,
          "enriching",
          targets.map((target) => target.seedUrl),
          crawlerWarnings,
          "Official-site enrichment started on the same one-unit slot.",
          targets
        );
        return;
      }
      await this.transition(
        run,
        "completed_with_warnings",
        "completed",
        null,
        "Amazon discovery completed; no credible official website was available for enrichment.",
        true,
        null,
        null,
        mergedWarnings(run, ...crawlerWarnings, "official_website_unavailable")
      );
      return;
    }
    if (run.stage === "resolving") {
      const targets = await this.officialTargetsForRun(run.id);
      if (targets.length > 0) {
        await this.handoff(
          run,
          "enriching",
          targets.map((target) => target.seedUrl),
          crawlerWarnings,
          "Verified official domains were handed to contact enrichment on the same one-unit slot.",
          targets
        );
        return;
      }
      await this.transition(
        run,
        "completed_with_warnings",
        "completed",
        null,
        "Official-domain candidates were checked, but none passed the conservative identity threshold.",
        true,
        null,
        null,
        mergedWarnings(run, ...crawlerWarnings, "official_domain_not_verified")
      );
      return;
    }
    if (crawlerWarnings.length > 0) {
      await this.transition(
        run,
        "completed_with_warnings",
        "completed",
        null,
        "Crawl finished with one or more bounded crawler errors.",
        true,
        "crawler_errors",
        "Review crawl evidence and source health before retrying.",
        mergedWarnings(run, ...crawlerWarnings)
      );
      return;
    }
    if (Number(outcome?.contacts_verified ?? run.contacts_found) === 0) {
      await this.transition(
        run,
        "completed_with_warnings",
        "completed",
        null,
        "Official-site crawl completed but no supported public business contact was found.",
        true,
        null,
        null,
        mergedWarnings(run, "no_public_contacts_found")
      );
      return;
    }
    await this.transition(run, "completed", "completed", null, "Crawl run completed.", true);
  }

  private async refreshById(id: string): Promise<void> {
    const run = await this.getRun(id);
    if (run?.active_unit_slot === 1) {
      if (run.zyte_job_id) await this.syncActive(run);
      else await this.startActiveStage(run);
    }
  }

  private async startActiveStage(
    run: OperatorRunRow,
    officialTargets?: OfficialSellerTarget[],
    candidateTargets?: DomainCandidateTarget[]
  ): Promise<void> {
    if (run.status === "launching") {
      const leaseAge = Date.now() - Date.parse(run.updated_at);
      if (Number.isFinite(leaseAge) && leaseAge < 120_000) return;
      let recoveredJobId: string | null;
      try {
        recoveredJobId = await this.taggedStageJob(run);
      } catch {
        return;
      }
      if (recoveredJobId) {
        const recoveredAt = new Date().toISOString();
        const recovery = await this.db
          .prepare(
            `UPDATE operator_crawl_runs SET zyte_job_id = ?, status = 'running', updated_at = ?
             WHERE id = ? AND status = 'launching' AND zyte_job_id IS NULL`
          )
          .bind(recoveredJobId, recoveredAt, run.id)
          .run();
        if (statementChanged(recovery)) {
          await this.event(
            run.id,
            "launch_recovered",
            null,
            "launching",
            "running",
            "Recovered the accepted Scrapy Cloud job by its unique stage tag."
          );
        }
        return;
      }
      await this.transition(
        run,
        "failed",
        run.stage,
        null,
        "The external launch outcome could not be proven; automatic relaunch was suppressed.",
        true,
        "launch_outcome_unknown",
        "Retry as a new audited crawl after confirming no Scrapy Cloud job remains active."
      );
      return;
    }
    const cooldownUntil = await this.amazonCooldownUntil(run);
    if (cooldownUntil) {
      await this.transitionToAmazonCooldown(
        run,
        cooldownUntil,
        "Amazon cooldown became active before launch; no Scrapy Cloud job was created."
      );
      return;
    }
    let launchCandidates = candidateTargets;
    if (run.stage === "resolving") {
      launchCandidates = launchCandidates ?? (
        await this.domainCandidateTargetsForRun(run.id, run.marketplace)
      );
      await this.authorizeCandidateTargets(run, launchCandidates);
    }
    const launchStartedAt = new Date().toISOString();
    const claim = await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET status = 'launching', updated_at = ?
         WHERE id = ? AND active_unit_slot = 1 AND zyte_job_id IS NULL
           AND status = ? AND updated_at = ?`
      )
      .bind(launchStartedAt, run.id, run.status, run.updated_at)
      .run();
    if (!statementChanged(claim)) return;
    const launchingRun = { ...run, status: "launching", updated_at: launchStartedAt };
    try {
      const jobId = await this.launch(launchingRun, officialTargets, launchCandidates);
      await this.db
        .prepare("UPDATE operator_crawl_runs SET zyte_job_id = ?, status = 'running', updated_at = ? WHERE id = ?")
        .bind(jobId, new Date().toISOString(), run.id)
        .run();
      await this.event(
        launchingRun.id,
        launchingRun.stage === "resolving" ? "domain_verification_started" : "started",
        null,
        "launching",
        "running",
        "Scrapy Cloud accepted the bounded one-unit stage job."
      );
    } catch (error) {
      const code = launchingRun.stage === "resolving"
        ? "domain_verification_launch_failed"
        : launchingRun.stage === "enriching"
          ? "enrichment_launch_failed"
          : "zyte_launch_failed";
      await this.transition(
        launchingRun,
        "failed",
        launchingRun.stage,
        null,
        "Scrapy Cloud stage launch failed.",
        true,
        code,
        safeError(error)
      );
    }
  }

  private async handoff(
    run: OperatorRunRow,
    stage: "resolving" | "enriching",
    seedUrls: string[],
    warnings: string[],
    message: string,
    officialTargets?: OfficialSellerTarget[],
    candidateTargets?: DomainCandidateTarget[]
  ): Promise<void> {
    const domains = seedUrls.map((value) => normalizeDomain(new URL(value).hostname));
    const approved = [
      ...new Set([...parseStringArray(run.approved_domains_json), ...domains].filter(Boolean))
    ];
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET stage = ?, status = ?, approved_domains_json = ?,
         warnings_json = ?, zyte_job_id = NULL, updated_at = ?
         WHERE id = ? AND stage = ?`
      )
      .bind(
        stage,
        stage,
        JSON.stringify(approved),
        JSON.stringify(mergedWarnings(run, ...warnings)),
        now,
        run.id,
        run.stage
      )
      .run();
    if (!statementChanged(result)) return;
    const next = await this.requireRun(run.id);
    if (next.stage !== stage || next.zyte_job_id) return;
    await this.event(run.id, `${stage}_handoff`, null, run.status, stage, message);
    await this.startActiveStage(next, officialTargets, candidateTargets);
  }

  private async authorizeCandidateTargets(
    run: OperatorRunRow,
    candidates: DomainCandidateTarget[]
  ): Promise<void> {
    const domains = candidates.map((candidate) => normalizeDomain(new URL(candidate.seedUrl).hostname));
    const approved = [
      ...new Set([...parseStringArray(run.approved_domains_json), ...domains].filter(Boolean))
    ];
    await this.db
      .prepare(
        "UPDATE operator_crawl_runs SET approved_domains_json = ? WHERE id = ? AND stage = 'resolving'"
      )
      .bind(JSON.stringify(approved), run.id)
      .run();
  }

  private async launch(
    run: OperatorRunRow,
    overrideTargets?: OfficialSellerTarget[],
    overrideCandidates?: DomainCandidateTarget[]
  ): Promise<string> {
    const commonSettings: Record<string, unknown> = {
      RUNNER_MODE: "zyte_student_active",
      LIVE_CRAWL_ENABLED: true,
      GLOBAL_CRAWL_KILL_SWITCH: false,
      ZYTE_STUDENT_ENTITLEMENT_CONFIRMED: true,
      SCRAPY_CLOUD_DEPLOY_ENABLED: true,
      SCRAPY_CLOUD_MAX_UNITS: 1,
      ZYTE_API_ENABLED: false,
      ZYTE_API_DAILY_REQUEST_BUDGET: 0,
      ZYTE_API_MONTHLY_BUDGET_USD: 0,
      PAID_SERVICES_ALLOWED: false,
      MAX_EXTERNAL_MONTHLY_SPEND_AUD: 0,
      ALLOW_EXTRA_SCRAPY_UNITS: false,
      ALLOW_PAID_ADDONS: false,
      PAID_ADDONS_ALLOWED: false,
      ALLOW_PAID_GITHUB_ACTIONS_MINUTES: false,
      GITHUB_ACTIONS_CRAWLER_ENABLED: false,
      CREDIT_RUNNER_ENABLED: false,
      ENABLE_AMAZON: run.mode === "find_sellers" && run.stage === "discovering",
      ENABLE_OFFICIAL_WEBSITE: true,
      ENABLE_EMAIL_EXTRACTION: true,
      ENABLE_PHONE_EXTRACTION: true,
      ENABLE_WHATSAPP_EXTRACTION: true,
      ENABLE_WECHAT_EXTRACTION: true,
      ENABLE_SEARCH_DISCOVERY: false,
      ENABLE_ALIBABA: false,
      ENABLE_1688: false,
      ENABLE_BUSINESS_REGISTRY: false,
      ENABLE_AI_SUMMARY: false,
      ENABLE_OUTREACH: false,
      ROBOTSTXT_OBEY: true,
      CONCURRENT_REQUESTS: 4,
      CONCURRENT_REQUESTS_PER_DOMAIN: 1,
      DOWNLOAD_TIMEOUT: 30,
      SELLERINTEL_OBSERVED_AT: new Date().toISOString(),
      ITEM_PIPELINES: { "sellerintel.pipelines.SignedIngestionPipeline": 300 },
      SOURCE_COOLDOWN_CHECK_URL: requiredSecret(this.env.SOURCE_COOLDOWN_CHECK_URL, "SOURCE_COOLDOWN_CHECK_URL"),
      INGESTION_ENDPOINT_URL: requiredSecret(this.env.INGESTION_ENDPOINT_URL, "INGESTION_ENDPOINT_URL"),
      INGESTION_HMAC_SECRET: requiredSecret(this.env.INGESTION_HMAC_SECRET, "INGESTION_HMAC_SECRET"),
      CONTACT_ENCRYPTION_KEYS: requiredSecret(this.env.CONTACT_ENCRYPTION_KEYS, "CONTACT_ENCRYPTION_KEYS"),
      CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION: requiredSecret(
        this.env.CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION,
        "CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION"
      )
    };
    const form: Record<string, string> = {
      project: this.projectId(),
      units: "1",
      priority: "1",
      add_tag: this.stageTag(run),
      job_settings: JSON.stringify(commonSettings),
      crawl_run_id: run.id
    };
    if (run.artifact_version && run.artifact_version !== "main") form.version = run.artifact_version;
    if (run.mode === "find_sellers" && run.stage === "discovering") {
      const filters = parseObject(run.filters_json);
      form.spider = "amazon_discovery";
      form.keywords = run.query_json;
      form.marketplace = run.marketplace ?? "amazon.com";
      form.country_codes = parseStringArray(run.country_codes_json).join(",");
      form.target_sellers = String(run.target_seller_count);
      form.max_result_pages = String(run.max_result_pages);
      form.category = stringValue(filters.category);
      form.brand_keyword = stringValue(filters.brandKeyword);
      form.seller_name_keyword = stringValue(filters.sellerNameKeyword);
      form.require_public_location = String(Boolean(filters.requirePublicLocation));
      form.require_official_website = String(Boolean(filters.hasOfficialWebsite));
      form.manufacturer_likelihood = stringValue(filters.manufacturerLikelihood) || "any";
      form.trader_likelihood = stringValue(filters.traderLikelihood) || "any";
      commonSettings.CLOSESPIDER_PAGECOUNT = Math.min(
        MAX_AMAZON_RESPONSES_PER_RUN,
        Math.max(1, parseStringArray(run.query_json).length) * run.max_result_pages +
          run.target_seller_count * 2 +
          2
      );
    } else if (run.stage === "resolving") {
      const candidates =
        overrideCandidates ?? (await this.domainCandidateTargetsForRun(run.id, run.marketplace));
      if (candidates.length === 0) {
        throw new Error("No bounded official-domain candidates remain for verification.");
      }
      form.spider = "official_domain_discovery";
      form.candidate_targets = JSON.stringify(
        candidates.map((target) => ({
          seller_id: target.sellerId,
          seller_name: target.sellerName,
          seller_names: target.sellerNames,
          seed_url: target.seedUrl,
          candidate_basis: target.candidateBasis
        }))
      );
      commonSettings.CLOSESPIDER_PAGECOUNT = candidates.length * 3 + 2;
      commonSettings.ENABLE_AMAZON = false;
    } else {
      const storedTarget = this.storedKnownSellerTarget(run);
      const targets = overrideTargets ?? (
        run.stage === "enriching" && (run.mode === "find_sellers" || isAutomaticResolutionRun(run))
          ? await this.officialTargetsForRun(run.id)
          : storedTarget
            ? [storedTarget]
            : []
      );
      const seeds = targets.length > 0
        ? targets.map((target) => target.seedUrl)
        : parseStringArray(run.seed_urls_json);
      form.spider = "official_website";
      form.seed_urls = seeds.map((domain) => (domain.startsWith("https://") ? domain : `https://${domain}/`)).join(",");
      form.page_budget = String(Math.min(25, run.max_official_pages));
      form.max_depth = String(run.crawl_depth);
      form.contact_types = parseStringArray(run.contact_types_json).join(",");
      if (targets.length > 0) {
        form.seller_targets = JSON.stringify(
          targets.map((target) => ({
            seller_id: target.sellerId,
            seller_name: target.sellerName,
            seed_url: target.seedUrl
          }))
        );
      }
      const seedCount = Math.max(1, seeds.length);
      commonSettings.CLOSESPIDER_PAGECOUNT =
        Number(form.page_budget) * seedCount + 2 * seedCount;
      commonSettings.ENABLE_AMAZON = false;
    }
    form.job_settings = JSON.stringify(commonSettings);
    const payload = await this.cloudRequest("POST", "/run.json", form);
    const jobId = typeof payload.jobid === "string" ? payload.jobid : "";
    if (payload.status !== "ok" || !/^\d+\/\d+\/\d+$/.test(jobId)) {
      throw new Error("Scrapy Cloud did not return a valid one-unit job identifier.");
    }
    if (!jobId.startsWith(`${this.projectId()}/`)) throw new Error("Scrapy Cloud returned a job from another project.");
    return jobId;
  }

  private async taggedStageJob(run: OperatorRunRow): Promise<string | null> {
    const tag = this.stageTag(run);
    const payload = await this.cloudRequest(
      "GET",
      `/jobs/list.json?project=${encodeURIComponent(this.projectId())}` +
        `&has_tag=${encodeURIComponent(tag)}&count=2`
    );
    if (payload.status !== "ok" || !Array.isArray(payload.jobs)) {
      throw new Error("Scrapy Cloud returned an invalid tagged-job response.");
    }
    const jobs: CloudJob[] = [];
    for (const value of payload.jobs) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Scrapy Cloud returned an invalid tagged job.");
      }
      const job = value as CloudJob;
      const tags = Array.isArray(job.tags)
        ? job.tags.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (
        typeof job.id !== "string" ||
        !/^\d+\/\d+\/\d+$/.test(job.id) ||
        !job.id.startsWith(`${this.projectId()}/`) ||
        !Array.isArray(job.tags) ||
        tags.length !== job.tags.length ||
        !tags.includes(tag)
      ) {
        throw new Error("Scrapy Cloud returned a tagged job outside the expected schema.");
      }
      jobs.push(job);
    }
    if (jobs.length > 1) {
      throw new Error("More than one Scrapy Cloud job has the unique stage tag.");
    }
    return typeof jobs[0]?.id === "string" ? jobs[0].id : null;
  }

  private stageTag(run: Pick<OperatorRunRow, "id" | "stage">): string {
    return `operator:${run.id}:${run.stage}`;
  }

  private async cloudRequest(method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
    const key = requiredSecret(this.env.SCRAPY_CLOUD_API_KEY, "SCRAPY_CLOUD_API_KEY");
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${key}:`)}`,
        ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {})
      },
      body: form ? new URLSearchParams(form).toString() : undefined
    });
    if (!response.ok) throw new Error(`Scrapy Cloud control request failed with HTTP ${response.status}.`);
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Scrapy Cloud returned invalid JSON.");
    return payload as Record<string, unknown>;
  }

  private assertOperational(): void {
    const state = readRuntimeState(this.env);
    const violations = startupGateViolations(state);
    if (!state.operatorCrawlEnabled || state.globalCrawlKillSwitch) {
      throw new OperatorCrawlError(503, "operator_crawl_paused", "Operator crawling is not available in this environment.");
    }
    if (violations.length > 0) {
      throw new OperatorCrawlError(503, "runtime_safety_gate", violations.join(" "));
    }
    requiredSecret(this.env.SCRAPY_CLOUD_API_KEY, "SCRAPY_CLOUD_API_KEY");
    this.projectId();
  }

  private operationalWithoutThrow(): boolean {
    try {
      this.assertOperational();
      return true;
    } catch {
      return false;
    }
  }

  private projectId(): string {
    const value = this.env.SCRAPY_CLOUD_PROJECT_ID?.trim() ?? "";
    if (!/^\d+$/.test(value)) throw new OperatorCrawlError(503, "scrapy_cloud_project_missing", "SCRAPY_CLOUD_PROJECT_ID is invalid.");
    return value;
  }

  private async transition(
    run: OperatorRunRow,
    status: string,
    stage: string,
    actorId: string | null,
    message: string,
    releaseUnit = false,
    errorCode: string | null = null,
    errorMessage: string | null = null,
    warnings: string[] | null = null
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET status = ?, stage = ?, active_unit_slot = ?,
         finished_at = CASE WHEN ? THEN ? ELSE finished_at END, updated_at = ?,
         error_code = ?, error_message = ?, warnings_json = COALESCE(?, warnings_json)
         WHERE id = ?`
      )
      .bind(
        status,
        stage,
        releaseUnit ? null : run.active_unit_slot,
        releaseUnit ? 1 : 0,
        now,
        now,
        errorCode,
        errorMessage,
        warnings ? JSON.stringify(warnings) : null,
        run.id
      )
      .run();
    await this.event(run.id, status, actorId, run.status, status, message);
  }

  private async amazonCooldownUntil(run: OperatorRunRow): Promise<string | null> {
    if (
      run.mode !== "find_sellers" ||
      run.stage !== "discovering" && run.stage !== "queued" ||
      !run.marketplace
    ) {
      return null;
    }
    const row = await this.db
      .prepare("SELECT blocked_until FROM source_registry WHERE adapter_name = ? LIMIT 1")
      .bind(`amazon:${run.marketplace}`)
      .first<{ blocked_until: string | null }>();
    const blockedUntil = row?.blocked_until ?? null;
    return blockedUntil && Number.isFinite(Date.parse(blockedUntil)) && Date.parse(blockedUntil) > Date.now()
      ? blockedUntil
      : null;
  }

  private async transitionToAmazonCooldown(
    run: OperatorRunRow,
    blockedUntil: string | null,
    eventMessage: string
  ): Promise<void> {
    const retryDetail = blockedUntil
      ? ` Retry after ${blockedUntil}.`
      : " Retry only after the persisted source cooldown expires.";
    await this.transition(
      run,
      "cooldown",
      "cooldown",
      null,
      eventMessage,
      true,
      "amazon_temporarily_unavailable",
      `Amazon is temporarily unavailable.${retryDetail} No bypass or provider rotation was attempted.`,
      mergedWarnings(run, "amazon_temporarily_unavailable")
    );
  }

  private async event(
    runId: string,
    eventType: string,
    actorId: string | null,
    fromStatus: string | null,
    toStatus: string | null,
    message: string
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO operator_crawl_events
         (id, crawl_run_id, event_type, actor_id, from_status, to_status, message, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`
      )
      .bind(newUuidV7(), runId, eventType, actorId, fromStatus, toStatus, message, new Date().toISOString())
      .run();
  }

  private async getRun(id: string): Promise<OperatorRunRow | null> {
    return this.db.prepare("SELECT * FROM operator_crawl_runs WHERE id = ? LIMIT 1").bind(id).first<OperatorRunRow>();
  }

  private async requireRun(id: string): Promise<OperatorRunRow> {
    const run = await this.getRun(id);
    if (!run) throw new OperatorCrawlError(404, "crawl_run_not_found", "Crawl run was not found.");
    return run;
  }

  private async runSellerIds(id: string): Promise<string[]> {
    const result = await this.db
      .prepare("SELECT DISTINCT seller_id FROM crawl_run_sellers WHERE crawl_run_id = ? ORDER BY first_seen_at")
      .bind(id)
      .all<{ seller_id: string }>();
    return (result.results ?? []).map((row) => row.seller_id);
  }

  private async linkRunSeller(
    crawlRunId: string,
    sellerId: string,
    stage: "discovered" | "enriched",
    firstSeenAt: string
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO crawl_run_sellers (crawl_run_id, seller_id, stage, first_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
      )
      .bind(crawlRunId, sellerId, stage, firstSeenAt)
      .run();
  }

  private async officialTargetsForRun(id: string): Promise<OfficialSellerTarget[]> {
    const ids = await this.runSellerIds(id);
    if (!this.env.CORE_DB || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.env.CORE_DB
      .prepare(
        `SELECT id, canonical_name, official_domain, identity_confidence, last_seen_at
         FROM sellers WHERE id IN (${placeholders}) AND official_domain IS NOT NULL
         ORDER BY identity_confidence DESC, last_seen_at DESC, id ASC`
      )
      .bind(...ids)
      .all<{
        id: string;
        canonical_name: string;
        official_domain: string;
        identity_confidence: number;
        last_seen_at: string;
      }>();
    const targets = new Map<string, OfficialSellerTarget>();
    for (const row of result.results ?? []) {
      const domain = normalizeDomain(row.official_domain);
      if (!domain || targets.has(domain)) continue;
      targets.set(domain, {
        sellerId: row.id,
        sellerName: row.canonical_name,
        seedUrl: `https://${domain}/`
      });
    }
    return [...targets.values()].slice(0, MAX_OFFICIAL_SITES_PER_RUN);
  }

  private async domainCandidateTargetsForRun(
    id: string,
    marketplace: string | null
  ): Promise<DomainCandidateTarget[]> {
    const ids = await this.runSellerIds(id);
    if (!this.env.CORE_DB || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [sellerResult, aliasResult] = await Promise.all([
      this.env.CORE_DB
        .prepare(
          `SELECT id, canonical_name, legal_name
           FROM sellers
           WHERE id IN (${placeholders}) AND status = 'active' AND official_domain IS NULL
           ORDER BY last_seen_at DESC, id ASC`
        )
        .bind(...ids)
        .all<{ id: string; canonical_name: string; legal_name: string | null }>(),
      this.env.CORE_DB
        .prepare(
          `SELECT seller_id, alias AS identity_value
           FROM seller_aliases WHERE seller_id IN (${placeholders})
           ORDER BY last_seen_at DESC, id ASC`
        )
        .bind(...ids)
        .all<{ seller_id: string; identity_value: string }>(),
    ]);
    const extraNames = new Map<string, string[]>();
    for (const row of aliasResult.results ?? []) {
      if (!row.identity_value?.trim()) continue;
      const names = extraNames.get(row.seller_id) ?? [];
      if (!names.some((value) => value.toLowerCase() === row.identity_value.toLowerCase())) {
        names.push(row.identity_value.trim());
      }
      extraNames.set(row.seller_id, names);
    }

    const targets: DomainCandidateTarget[] = [];
    const claimedDomains = new Set<string>();
    for (const seller of sellerResult.results ?? []) {
      const sellerNames = uniqueIdentityNames([
        seller.canonical_name,
        seller.legal_name ?? "",
        ...(extraNames.get(seller.id) ?? [])
      ]).slice(0, 6);
      let sellerCandidateCount = 0;
      for (const candidate of candidateDomainsForIdentities(sellerNames, marketplace)) {
        if (claimedDomains.has(candidate.domain)) continue;
        claimedDomains.add(candidate.domain);
        targets.push({
          sellerId: seller.id,
          sellerName: seller.canonical_name,
          sellerNames: [
            candidate.identity,
            ...sellerNames.filter(
              (name) => identityLabel(name) !== identityLabel(candidate.identity)
            )
          ].slice(0, 6),
          seedUrl: `https://${candidate.domain}/`,
          candidateBasis: candidate.basis
        });
        sellerCandidateCount += 1;
        if (sellerCandidateCount >= 2 || targets.length >= MAX_DOMAIN_CANDIDATES_PER_RUN) break;
      }
      if (targets.length >= MAX_DOMAIN_CANDIDATES_PER_RUN) break;
    }
    return targets;
  }

  private async resolveKnownSellerTarget(
    input: CreateCrawlRunRequest
  ): Promise<OfficialSellerTarget | null> {
    if (input.mode !== "known_websites" || !input.targetSellerId) return null;
    if (!this.env.CORE_DB) {
      throw new OperatorCrawlError(503, "core_db_missing", "CORE_DB is required to link an official website.");
    }
    const row = await this.env.CORE_DB
      .prepare(
        "SELECT id, canonical_name, official_domain, status FROM sellers WHERE id = ? LIMIT 1"
      )
      .bind(input.targetSellerId)
      .first<{ id: string; canonical_name: string; official_domain: string | null; status: string }>();
    if (!row || row.status !== "active") {
      throw new OperatorCrawlError(404, "target_seller_not_found", "The target canonical seller is unavailable.");
    }
    const seedUrl = input.seedUrls?.[0];
    if (!seedUrl) throw invalid("A linked seller crawl requires exactly one approved website URL.");
    const requestedDomain = normalizeDomain(new URL(seedUrl).hostname);
    const existingDomain = normalizeDomain(row.official_domain ?? "");
    if (existingDomain && existingDomain !== requestedDomain) {
      throw new OperatorCrawlError(
        409,
        "official_domain_conflict",
        "The seller already has a different official domain; review the identity before crawling."
      );
    }
    return { sellerId: row.id, sellerName: row.canonical_name, seedUrl };
  }

  private async resolveAutomaticSellerTarget(
    input: CreateCrawlRunRequest
  ): Promise<{ sellerId: string; sellerName: string } | null> {
    if (input.mode !== "resolve_seller" || !input.targetSellerId) return null;
    if (!this.env.CORE_DB) {
      throw new OperatorCrawlError(503, "core_db_missing", "CORE_DB is required to resolve an existing seller.");
    }
    const row = await this.env.CORE_DB
      .prepare(
        "SELECT id, canonical_name, official_domain, status FROM sellers WHERE id = ? LIMIT 1"
      )
      .bind(input.targetSellerId)
      .first<{ id: string; canonical_name: string; official_domain: string | null; status: string }>();
    if (!row || row.status !== "active") {
      throw new OperatorCrawlError(404, "target_seller_not_found", "The target canonical seller is unavailable.");
    }
    if (row.official_domain) {
      throw new OperatorCrawlError(
        409,
        "official_domain_already_resolved",
        "The seller already has an official domain; use the verified website crawl instead."
      );
    }
    return { sellerId: row.id, sellerName: row.canonical_name };
  }

  private storedKnownSellerTarget(run: OperatorRunRow): OfficialSellerTarget | null {
    if (run.mode !== "known_websites") return null;
    const filters = parseObject(run.filters_json);
    const sellerId = stringValue(filters.targetSellerId);
    const sellerName = stringValue(filters.targetSellerName);
    const seedUrl = parseStringArray(run.seed_urls_json)[0] ?? "";
    if (!UUID_V7_PATTERN.test(sellerId) || !sellerName || !seedUrl) return null;
    return { sellerId, sellerName, seedUrl };
  }

  private async crawlerOutcome(id: string): Promise<CrawlerOutcome | null> {
    return this.db
      .prepare(
        `SELECT status, contacts_verified, blocked_count, error_count
         FROM crawl_runs WHERE id = ? LIMIT 1`
      )
      .bind(id)
      .first<CrawlerOutcome>();
  }

  private async sellersByIds(ids: string[]): Promise<SellerListItem[]> {
    if (!this.env.CORE_DB || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.env.CORE_DB
      .prepare(
        `SELECT s.id, s.canonical_name, s.legal_name, s.country_code, s.province, s.city,
         s.official_domain, s.identity_confidence, s.quality_score, s.manufacturer_score,
         s.trader_score, s.status, s.first_seen_at, s.last_seen_at, s.updated_at,
         ma.marketplace, ma.display_name AS marketplace_display_name,
         ma.profile_url AS marketplace_profile_url
         FROM sellers s LEFT JOIN marketplace_accounts ma ON ma.seller_id = s.id
         WHERE s.id IN (${placeholders}) ORDER BY s.last_seen_at DESC`
      )
      .bind(...ids)
      .all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const contactMetadata = await this.contactMetadataBySellerIds(
      rows.map((row) => String(row.id))
    );
    return rows.map((row) => {
      const metadata = contactMetadata.get(String(row.id));
      return {
        id: String(row.id),
        canonicalName: String(row.canonical_name),
        legalName: nullableString(row.legal_name),
        countryCode: nullableString(row.country_code),
        province: nullableString(row.province),
        city: nullableString(row.city),
        officialDomain: nullableString(row.official_domain),
        identityConfidence: Number(row.identity_confidence ?? 0),
        qualityScore: Number(row.quality_score ?? 0),
        manufacturerScore: Number(row.manufacturer_score ?? 0),
        traderScore: Number(row.trader_score ?? 0),
        status: String(row.status),
        firstSeenAt: String(row.first_seen_at),
        lastSeenAt: String(row.last_seen_at),
        updatedAt: String(row.updated_at),
        marketplace: nullableString(row.marketplace),
        marketplaceDisplayName: nullableString(row.marketplace_display_name),
        marketplaceProfileUrl: nullableString(row.marketplace_profile_url),
        contactCount: Number(metadata?.contact_count ?? 0),
        contactTypes: metadata?.contact_types ? metadata.contact_types.split(",") : [],
        duplicateStatus: null
      };
    });
  }

  private async contactMetadataBySellerIds(
    ids: string[]
  ): Promise<Map<string, { contact_count: number; contact_types: string }>> {
    if (!this.env.CONTACTS_DB || ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.env.CONTACTS_DB
      .prepare(
        `SELECT seller_id, COUNT(*) AS contact_count,
         group_concat(DISTINCT contact_type) AS contact_types
         FROM contacts WHERE status = 'active' AND seller_id IN (${placeholders})
         GROUP BY seller_id`
      )
      .bind(...ids)
      .all<{ seller_id: string; contact_count: number; contact_types: string }>();
    return new Map((result.results ?? []).map((row) => [row.seller_id, row]));
  }
}

function validateCreateRequest(raw: unknown): CreateCrawlRunRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("Request body must be an object.");
  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (mode !== "find_sellers" && mode !== "resolve_seller" && mode !== "known_websites") {
    throw invalid("mode must be find_sellers, resolve_seller, or known_websites.");
  }
  const contactTypes = stringArray(value.contactTypes, 5, 16).map((item) => item.toLowerCase());
  if (contactTypes.length === 0 || contactTypes.some((item) => !CONTACT_TYPES.has(item))) throw invalid("At least one supported contact type is required.");
  const request: CreateCrawlRunRequest = {
    mode,
    contactTypes: [...new Set(contactTypes)] as CreateCrawlRunRequest["contactTypes"],
    targetSellerCount: integer(value.targetSellerCount, 1, 300, "targetSellerCount"),
    maxResultPages: integer(value.maxResultPages, 1, MAX_AMAZON_RESULT_PAGES_PER_KEYWORD, "maxResultPages"),
    maxOfficialPages: integer(value.maxOfficialPages, 1, 25, "maxOfficialPages"),
    crawlDepth: integer(value.crawlDepth, 0, 3, "crawlDepth"),
    stopAfterTarget: value.stopAfterTarget !== false,
    idempotencyKey: text(value.idempotencyKey, 8, 128, "idempotencyKey")
  };
  if (!/^[A-Za-z0-9._:-]+$/.test(request.idempotencyKey)) throw invalid("idempotencyKey contains unsupported characters.");
  if (mode === "find_sellers") {
    request.keywords = uniqueNormalizedQueries(stringArray(value.keywords, 5, 120));
    if (request.keywords.length === 0) throw invalid("At least one keyword query is required.");
    const marketplace = text(value.marketplace, 3, 32, "marketplace").toLowerCase();
    if (!(SUPPORTED_AMAZON_MARKETPLACES as readonly string[]).includes(marketplace)) throw invalid("marketplace is not supported.");
    request.marketplace = marketplace;
    request.countryCodes = [...new Set(stringArray(value.countryCodes, 20, 2).map((code) => code.toUpperCase()))];
    request.filters = validateFilters(value.filters);
  } else if (mode === "known_websites") {
    request.seedUrls = stringArray(value.seedUrls, 20, 2048).map(validatePublicHttpsUrl);
    if (request.seedUrls.length === 0) throw invalid("At least one approved HTTPS website URL is required.");
    const targetSellerId = optionalText(value.targetSellerId, 36);
    if (targetSellerId) {
      if (!UUID_V7_PATTERN.test(targetSellerId)) throw invalid("targetSellerId must be UUIDv7-compatible.");
      if (request.seedUrls.length !== 1) throw invalid("A linked seller crawl requires exactly one website URL.");
      request.targetSellerId = targetSellerId;
    }
  } else {
    const targetSellerId = optionalText(value.targetSellerId, 36);
    if (!targetSellerId || !UUID_V7_PATTERN.test(targetSellerId)) {
      throw invalid("resolve_seller requires a UUIDv7 targetSellerId.");
    }
    if (request.targetSellerCount !== 1) {
      throw invalid("resolve_seller requires targetSellerCount=1.");
    }
    request.targetSellerId = targetSellerId;
  }
  const plannedOfficialPages =
    request.maxOfficialPages *
    (request.mode === "find_sellers"
      ? Math.min(request.targetSellerCount, MAX_OFFICIAL_SITES_PER_RUN)
      : request.mode === "known_websites"
        ? request.seedUrls?.length ?? 1
        : 1);
  if (plannedOfficialPages > MAX_OFFICIAL_PAGES_PER_RUN) {
    throw invalid(`Official website page budget must not exceed ${MAX_OFFICIAL_PAGES_PER_RUN} pages per run.`);
  }
  return request;
}

function validateFilters(raw: unknown): CreateCrawlRunRequest["filters"] {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("filters must be an object.");
  const value = raw as Record<string, unknown>;
  const likelihood = (field: string): "any" | "likely" | undefined => {
    const entry = value[field];
    if (entry === undefined || entry === "") return undefined;
    if (entry !== "any" && entry !== "likely") throw invalid(`${field} must be any or likely.`);
    return entry;
  };
  return {
    category: optionalText(value.category, 80),
    brandKeyword: optionalText(value.brandKeyword, 80),
    sellerNameKeyword: optionalText(value.sellerNameKeyword, 120),
    requirePublicLocation: Boolean(value.requirePublicLocation),
    hasOfficialWebsite: Boolean(value.hasOfficialWebsite),
    manufacturerLikelihood: likelihood("manufacturerLikelihood"),
    traderLikelihood: likelihood("traderLikelihood")
  };
}

function validatePublicHttpsUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid("Each website must be a valid URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) throw invalid("Website URLs must be credential-free HTTPS origins or paths without port, query, or fragment.");
  const host = normalizeDomain(url.hostname);
  if (isPrivateHost(host)) throw invalid("Website URLs may not target local, private, or reserved hosts.");
  url.hostname = host;
  return url.toString();
}

function isPrivateHost(host: string): boolean {
  if (["localhost", "0.0.0.0", "::1"].includes(host) || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || parts[0] >= 224;
  }
  return host.includes(":");
}

function mapRun(row: OperatorRunRow): CrawlRunItem {
  return {
    id: row.id,
    jobType: row.mode === "find_sellers"
      ? "amazon_identity_discovery"
      : isAutomaticResolutionRun(row)
        ? "official_domain_discovery"
        : "official_website",
    zyteJobId: row.zyte_job_id,
    startedAt: row.started_at ?? row.requested_at,
    finishedAt: row.finished_at,
    status: row.status,
    requestsTotal: Number(row.requests_total ?? 0),
    responsesSuccess: Number(row.responses_success ?? 0),
    candidatesFound: row.discovered_sellers,
    recordsCreated: row.discovered_sellers,
    recordsUpdated: row.enriched_sellers,
    contactsVerified: row.contacts_found,
    blockedCount: Number(row.blocked_count ?? (row.status === "blocked" ? 1 : 0)),
    errorCount: Number(row.error_count ?? (row.error_code ? 1 : 0)),
    notes: row.error_message,
    mode: isAutomaticResolutionRun(row) ? "resolve_seller" : row.mode,
    query: parseStringArray(row.query_json),
    marketplace: row.marketplace,
    countryCodes: parseStringArray(row.country_codes_json),
    requestedSellerCount: row.target_seller_count,
    discoveredSellers: row.discovered_sellers,
    enrichedSellers: row.enriched_sellers,
    contactsFound: row.contacts_found,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    stage: row.stage,
    warnings: parseStringArray(row.warnings_json),
    errorCode: row.error_code,
    errorMessage: row.error_message
  };
}

function parseStringArray(raw: string | undefined): string[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function uniqueNormalizedQueries(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = normalizedSearchText(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function normalizedSearchSignature(request: CreateCrawlRunRequest): string {
  return searchSignature(
    request.keywords ?? [],
    request.marketplace ?? "",
    request.countryCodes ?? [],
    request.filters as Record<string, unknown> | undefined
  );
}

function normalizedStoredSearchSignature(row: HistoricalSearchScope): string {
  return searchSignature(
    parseStringArray(row.query_json),
    row.marketplace ?? "",
    parseStringArray(row.country_codes_json),
    parseObject(row.filters_json)
  );
}

function searchSignature(
  keywords: string[],
  marketplace: string,
  countryCodes: string[],
  filters: Record<string, unknown> = {}
): string {
  return stableJson({
    version: 1,
    keywords: [...new Set(keywords.map(normalizedSearchText))].sort(),
    marketplace: normalizedSearchText(marketplace),
    countryCodes: [...new Set(countryCodes.map((value) => value.trim().toUpperCase()))].sort(),
    filters: {
      category: normalizedSearchText(filters.category),
      brandKeyword: normalizedSearchText(filters.brandKeyword),
      sellerNameKeyword: normalizedSearchText(filters.sellerNameKeyword),
      requirePublicLocation: Boolean(filters.requirePublicLocation),
      hasOfficialWebsite: Boolean(filters.hasOfficialWebsite),
      manufacturerLikelihood: normalizedSearchText(filters.manufacturerLikelihood) || "any",
      traderLikelihood: normalizedSearchText(filters.traderLikelihood) || "any"
    }
  });
}

function normalizedSearchText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

function stringArray(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > maximumItems) throw invalid(`A maximum of ${maximumItems} values is allowed.`);
  return value.map((item) => text(item, 1, maximumLength, "list item"));
}

function text(value: unknown, minimum: number, maximum: number, field: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) throw invalid(`${field} must be ${minimum}-${maximum} characters.`);
  return result;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (value === undefined || value === "") return undefined;
  return text(value, 1, maximum, "filter");
}

function integer(value: unknown, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw invalid(`${field} must be an integer from ${minimum} to ${maximum}.`);
  return Number(value);
}

function invalid(message: string): OperatorCrawlError { return new OperatorCrawlError(400, "invalid_crawl_request", message); }
function nullableString(value: unknown): string | null { return typeof value === "string" ? value : null; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function requiredSecret(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new OperatorCrawlError(503, "operator_secret_missing", `${name} is not configured.`);
  return value;
}
function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 300) : "Unknown external error."; }
function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function uniqueIdentityNames(values: string[]): string[] {
  const names: string[] = [];
  const keys = new Set<string>();
  for (const value of values) {
    const name = value.trim().slice(0, 200);
    const key = identityLabel(name);
    if (key.length < 5 || keys.has(key)) continue;
    keys.add(key);
    names.push(name);
  }
  return names;
}

function candidateDomainsForIdentities(
  names: string[],
  marketplace: string | null
): Array<{ domain: string; basis: string; identity: string }> {
  const localSuffix: Record<string, string> = {
    "amazon.co.uk": "co.uk",
    "amazon.ca": "ca",
    "amazon.com.au": "com.au",
    "amazon.de": "de",
    "amazon.fr": "fr",
    "amazon.it": "it",
    "amazon.es": "es"
  };
  const suffixes = [...new Set([localSuffix[marketplace ?? ""], "com"].filter(Boolean))];
  const result: Array<{ domain: string; basis: string; identity: string }> = [];
  const seen = new Set<string>();
  for (const name of names) {
    const tokens = identityTokens(name);
    if (tokens.length === 0) continue;
    const identity = tokens.join(" ");
    const compactLabel = tokens.join("");
    const hyphenatedLabel = tokens.join("-");
    for (const [label, basis] of [
      [compactLabel, "identity_exact_compact"],
      [hyphenatedLabel, "identity_exact_hyphenated"]
    ] as const) {
      if (!validCandidateLabel(label)) continue;
      for (const suffix of suffixes) {
        const domain = `${label}.${suffix}`;
        if (seen.has(domain)) continue;
        seen.add(domain);
        result.push({ domain, basis, identity });
      }
    }
  }
  return result;
}

function identityTokens(value: string): string[] {
  const genericSuffixes = new Set([
    "amazon", "seller", "store", "shop", "official", "storefront",
    "ltd", "limited", "inc", "llc", "corp", "corporation", "company", "co"
  ]);
  const ascii = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tokens = ascii.match(/[a-z0-9]+/g) ?? [];
  while (tokens.length > 1 && genericSuffixes.has(tokens.at(-1) ?? "")) tokens.pop();
  while (tokens.length > 1 && genericSuffixes.has(tokens[0] ?? "")) tokens.shift();
  return tokens;
}

function identityLabel(value: string): string {
  return identityTokens(value).join("");
}

function validCandidateLabel(value: string): boolean {
  const genericLabels = new Set([
    "amazon", "business", "company", "official", "online", "seller", "shop", "store", "the"
  ]);
  return (
    value.length >= 5 &&
    value.length <= 63 &&
    !genericLabels.has(value) &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value) &&
    /[a-z]/.test(value)
  );
}

function mergedWarnings(run: Pick<OperatorRunRow, "warnings_json">, ...values: string[]): string[] {
  return [...new Set([...parseStringArray(run.warnings_json), ...values.filter(Boolean)])];
}

function isAutomaticResolutionRun(
  run: Pick<OperatorRunRow, "mode" | "filters_json" | "seed_urls_json">
): boolean {
  return (
    run.mode === "known_websites" &&
    parseStringArray(run.seed_urls_json).length === 0 &&
    parseObject(run.filters_json).automaticResolution === true
  );
}

function statementChanged(result: D1Result): boolean {
  const changes = (result.meta as { changes?: unknown } | undefined)?.changes;
  return typeof changes === "number" ? changes > 0 : result.success;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
