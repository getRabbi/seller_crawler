import type {
  CreateCrawlRunRequest,
  CrawlRunActionResponse,
  CrawlRunDetailResponse,
  CrawlRunItem,
  SellerListItem
} from "@seller-intelligence/shared-types/dashboard";

import type { D1Database, D1Value } from "../repositories/d1";
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

const CONTACT_TYPES = new Set(["email", "phone", "whatsapp", "wechat"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "completed_with_warnings",
  "failed",
  "blocked",
  "cooldown",
  "cancelled"
]);
const API_BASE = "https://app.zyte.com/api";

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

interface CloudJob {
  state?: unknown;
  close_reason?: unknown;
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

    const id = newUuidV7();
    const now = new Date();
    const approvedDomains =
      input.mode === "find_sellers"
        ? [input.marketplace as string]
        : (input.seedUrls ?? []).map((value) => new URL(value).hostname.toLowerCase());
    const artifactVersion = this.env.SCRAPY_CLOUD_ARTIFACT_VERSION?.trim() || "main";
    await this.db
      .prepare(
        `INSERT INTO operator_crawl_runs (
          id, mode, query_json, marketplace, country_codes_json, filters_json,
          seed_urls_json, contact_types_json, target_seller_count, max_result_pages,
          max_official_pages, crawl_depth, stop_after_target, status, stage,
          requested_by, requested_at, updated_at, approved_domains_json, artifact_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.mode,
        JSON.stringify(input.keywords ?? []),
        input.marketplace ?? null,
        JSON.stringify(input.countryCodes ?? []),
        JSON.stringify(input.filters ?? {}),
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
        artifactVersion
      )
      .run();
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
    await this.event(id, "created", actorId, null, "queued", "Operator created a bounded crawl run.");
    await this.pump();
    const run = await this.getRun(id);
    if (!run) throw new OperatorCrawlError(503, "crawl_create_failed", "Crawl run could not be loaded after creation.");
    return { run: mapRun(run), queued: run.status === "queued" };
  }

  async list(limit: number, offset: number, status?: string): Promise<{ items: CrawlRunItem[]; total: number; limit: number; offset: number }> {
    await this.pump();
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
    if (run.zyte_job_id && run.active_unit_slot === 1) {
      await this.cloudRequest("POST", "/jobs/stop.json", {
        project: this.projectId(),
        job: run.zyte_job_id
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
      await this.syncActive(active);
      const stillActive = await this.db
        .prepare("SELECT id FROM operator_crawl_runs WHERE active_unit_slot = 1 LIMIT 1")
        .first<{ id: string }>();
      if (stillActive) return;
    }

    const queued = await this.db
      .prepare("SELECT * FROM operator_crawl_runs WHERE status = 'queued' ORDER BY requested_at, id LIMIT 1")
      .first<OperatorRunRow>();
    if (!queued) return;
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET status = 'starting', stage = ?, active_unit_slot = 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
         WHERE id = ? AND status = 'queued'
           AND NOT EXISTS (SELECT 1 FROM operator_crawl_runs WHERE active_unit_slot = 1)`
      )
      .bind(queued.mode === "find_sellers" ? "discovering" : "enriching", now, now, queued.id)
      .run();
    const claimed = await this.getRun(queued.id);
    if (claimed?.active_unit_slot !== 1) return;
    await this.event(claimed.id, "starting", null, "queued", "starting", "One-unit slot acquired.");
    try {
      const jobId = await this.launch(claimed);
      await this.db
        .prepare("UPDATE operator_crawl_runs SET zyte_job_id = ?, status = 'running', updated_at = ? WHERE id = ?")
        .bind(jobId, new Date().toISOString(), claimed.id)
        .run();
      await this.event(claimed.id, "started", null, "starting", "running", "Scrapy Cloud accepted the one-unit job.");
    } catch (error) {
      await this.transition(
        claimed,
        "failed",
        claimed.stage,
        null,
        "Scrapy Cloud job launch failed.",
        true,
        "zyte_launch_failed",
        safeError(error)
      );
    }
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
    contactCount: number
  ): Promise<void> {
    const run = await this.getRun(crawlRunId);
    if (!run) return;
    const now = new Date().toISOString();
    const stage = sourceTypes.some((value) => value.startsWith("amazon")) ? "discovered" : "enriched";
    for (const sellerId of new Set(sellerIds)) {
      await this.db
        .prepare(
          "INSERT INTO crawl_run_sellers (crawl_run_id, seller_id, stage, first_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
        )
        .bind(crawlRunId, sellerId, stage, now)
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
    await this.db
      .prepare(
        `UPDATE operator_crawl_runs SET discovered_sellers = ?, enriched_sellers = ?,
         contacts_found = contacts_found + ?,
         status = CASE WHEN status = 'running' THEN 'ingesting' ELSE status END, updated_at = ? WHERE id = ?`
      )
      .bind(
        Number(counts?.discovered ?? 0),
        Number(counts?.enriched ?? 0),
        Math.max(0, contactCount),
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
    if (run.mode === "find_sellers" && run.stage === "discovering") {
      const domains = await this.officialDomainsForRun(run.id);
      if (domains.length > 0) {
        const approved = [...new Set([...parseStringArray(run.approved_domains_json), ...domains])];
        await this.db
          .prepare(
            "UPDATE operator_crawl_runs SET stage = 'enriching', status = 'enriching', approved_domains_json = ?, zyte_job_id = NULL, updated_at = ? WHERE id = ?"
          )
          .bind(JSON.stringify(approved), new Date().toISOString(), run.id)
          .run();
        const enriching = await this.requireRun(run.id);
        try {
          const jobId = await this.launch(enriching, domains);
          await this.db
            .prepare("UPDATE operator_crawl_runs SET zyte_job_id = ?, status = 'running', updated_at = ? WHERE id = ?")
            .bind(jobId, new Date().toISOString(), run.id)
            .run();
          await this.event(run.id, "enrichment_started", null, run.status, "running", "Official-site enrichment started on the same one-unit slot.");
        } catch (error) {
          await this.transition(enriching, "failed", "enriching", null, "Official-site enrichment launch failed.", true, "enrichment_launch_failed", safeError(error));
        }
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
        ["official_website_unavailable"]
      );
      return;
    }
    await this.transition(run, "completed", "completed", null, "Crawl run completed.", true);
  }

  private async refreshById(id: string): Promise<void> {
    const run = await this.getRun(id);
    if (run?.active_unit_slot === 1) await this.syncActive(run);
  }

  private async launch(run: OperatorRunRow, overrideSeeds?: string[]): Promise<string> {
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
      add_tag: `operator:${run.id}`,
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
        250,
        run.max_result_pages + run.target_seller_count * 2
      );
    } else {
      const seeds = overrideSeeds ?? parseStringArray(run.seed_urls_json);
      form.spider = "official_website";
      form.seed_urls = seeds.map((domain) => (domain.startsWith("https://") ? domain : `https://${domain}/`)).join(",");
      form.page_budget = String(Math.min(25, run.max_official_pages * Math.max(1, seeds.length)));
      form.max_depth = String(run.crawl_depth);
      commonSettings.CLOSESPIDER_PAGECOUNT = Number(form.page_budget);
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

  private async officialDomainsForRun(id: string): Promise<string[]> {
    const ids = await this.runSellerIds(id);
    if (!this.env.CORE_DB || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.env.CORE_DB
      .prepare(`SELECT DISTINCT official_domain FROM sellers WHERE id IN (${placeholders}) AND official_domain IS NOT NULL`)
      .bind(...ids)
      .all<{ official_domain: string }>();
    return (result.results ?? []).map((row) => row.official_domain.toLowerCase());
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
    return (result.results ?? []).map((row) => ({
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
      contactCount: 0,
      contactTypes: [],
      duplicateStatus: null
    }));
  }
}

function validateCreateRequest(raw: unknown): CreateCrawlRunRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("Request body must be an object.");
  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (mode !== "find_sellers" && mode !== "known_websites") throw invalid("mode must be find_sellers or known_websites.");
  const contactTypes = stringArray(value.contactTypes, 4, 16).map((item) => item.toLowerCase());
  if (contactTypes.length === 0 || contactTypes.some((item) => !CONTACT_TYPES.has(item))) throw invalid("At least one supported contact type is required.");
  const request: CreateCrawlRunRequest = {
    mode,
    contactTypes: [...new Set(contactTypes)] as CreateCrawlRunRequest["contactTypes"],
    targetSellerCount: integer(value.targetSellerCount, 1, 100, "targetSellerCount"),
    maxResultPages: integer(value.maxResultPages, 1, 3, "maxResultPages"),
    maxOfficialPages: integer(value.maxOfficialPages, 1, 25, "maxOfficialPages"),
    crawlDepth: integer(value.crawlDepth, 0, 3, "crawlDepth"),
    stopAfterTarget: value.stopAfterTarget !== false,
    idempotencyKey: text(value.idempotencyKey, 8, 128, "idempotencyKey")
  };
  if (!/^[A-Za-z0-9._:-]+$/.test(request.idempotencyKey)) throw invalid("idempotencyKey contains unsupported characters.");
  if (mode === "find_sellers") {
    request.keywords = stringArray(value.keywords, 5, 120);
    if (request.keywords.length === 0) throw invalid("At least one keyword query is required.");
    const marketplace = text(value.marketplace, 3, 32, "marketplace").toLowerCase();
    if (!(SUPPORTED_AMAZON_MARKETPLACES as readonly string[]).includes(marketplace)) throw invalid("marketplace is not supported.");
    request.marketplace = marketplace;
    request.countryCodes = stringArray(value.countryCodes, 20, 2).map((code) => code.toUpperCase());
    request.filters = validateFilters(value.filters);
  } else {
    request.seedUrls = stringArray(value.seedUrls, 20, 2048).map(validatePublicHttpsUrl);
    if (request.seedUrls.length === 0) throw invalid("At least one approved HTTPS website URL is required.");
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
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
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
    jobType: row.mode === "find_sellers" ? "amazon_identity_discovery" : "official_website",
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
    mode: row.mode,
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
