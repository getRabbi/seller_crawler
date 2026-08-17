import { afterEach, describe, expect, it, vi } from "vitest";

import { OperatorCrawlService } from "../src/operator-crawl/service";
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "../src/repositories/d1";
import type { RuntimeEnv } from "../src/validation/startup";

type Row = Record<string, unknown>;

class OperatorD1 implements D1Database {
  readonly runs: Row[] = [];
  readonly idempotency: Row[] = [];
  readonly events: Row[] = [];
  readonly runSellers: Row[] = [];

  prepare(query: string): D1PreparedStatement {
    return new OperatorStatement(this, query);
  }
}

class OperatorStatement implements D1PreparedStatement {
  private values: D1Value[] = [];

  constructor(private readonly state: OperatorD1, private readonly query: string) {}

  bind(...values: D1Value[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const rows = this.resolve();
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: this.resolve() as T[] };
  }

  async run(): Promise<D1Result> {
    const query = compact(this.query);
    if (query.startsWith("INSERT INTO operator_crawl_runs") && query.includes("retry_of_run_id")) {
      const [
        id, mode, queryJson, marketplace, countries, filters, seeds, contacts, target,
        maxResults, maxOfficial, depth, stop, retryOf, actor, requestedAt, updatedAt, domains, artifact
      ] = this.values;
      this.state.runs.push({
        id, mode, query_json: queryJson, marketplace, country_codes_json: countries,
        filters_json: filters, seed_urls_json: seeds, contact_types_json: contacts,
        target_seller_count: target, max_result_pages: maxResults,
        max_official_pages: maxOfficial, crawl_depth: depth, stop_after_target: stop,
        status: "queued", stage: "queued", active_unit_slot: null, zyte_job_id: null,
        retry_of_run_id: retryOf, requested_by: actor, requested_at: requestedAt,
        started_at: null, finished_at: null, updated_at: updatedAt,
        approved_domains_json: domains, artifact_version: artifact,
        discovered_sellers: 0, enriched_sellers: 0, contacts_found: 0,
        warnings_json: "[]", error_code: null, error_message: null
      });
    } else if (query.startsWith("INSERT INTO operator_crawl_runs") && query.includes("'queued', 'queued'")) {
      const [
        id, mode, queryJson, marketplace, countries, filters, seeds, contacts, target,
        maxResults, maxOfficial, depth, stop, actor, requestedAt, updatedAt, domains, artifact
      ] = this.values;
      this.state.runs.push({
        id, mode, query_json: queryJson, marketplace, country_codes_json: countries,
        filters_json: filters, seed_urls_json: seeds, contact_types_json: contacts,
        target_seller_count: target, max_result_pages: maxResults,
        max_official_pages: maxOfficial, crawl_depth: depth, stop_after_target: stop,
        status: "queued", stage: "queued", active_unit_slot: null, zyte_job_id: null,
        retry_of_run_id: null, requested_by: actor, requested_at: requestedAt,
        started_at: null, finished_at: null, updated_at: updatedAt,
        approved_domains_json: domains, artifact_version: artifact,
        discovered_sellers: 0, enriched_sellers: 0, contacts_found: 0,
        warnings_json: "[]", error_code: null, error_message: null
      });
    } else if (query.startsWith("INSERT INTO operator_crawl_idempotency")) {
      const [idempotencyKey, requestHash, crawlRunId, createdAt, expiresAt] = this.values;
      this.state.idempotency.push({ idempotency_key: idempotencyKey, request_hash: requestHash, crawl_run_id: crawlRunId, created_at: createdAt, expires_at: expiresAt });
    } else if (query.startsWith("INSERT INTO operator_crawl_events")) {
      this.state.events.push({ id: this.values[0], crawl_run_id: this.values[1], event_type: this.values[2] });
    } else if (query.startsWith("INSERT INTO crawl_run_sellers")) {
      const [crawlRunId, sellerId, stage, firstSeenAt] = this.values;
      if (!this.state.runSellers.some((item) => item.crawl_run_id === crawlRunId && item.seller_id === sellerId && item.stage === stage)) {
        this.state.runSellers.push({ crawl_run_id: crawlRunId, seller_id: sellerId, stage, first_seen_at: firstSeenAt });
      }
    } else if (query.startsWith("UPDATE operator_crawl_runs SET status = 'starting'")) {
      const run = this.state.runs.find((item) => item.id === this.values[3] && item.status === "queued");
      if (run && !this.state.runs.some((item) => item.active_unit_slot === 1)) {
        Object.assign(run, { status: "starting", stage: this.values[0], active_unit_slot: 1, started_at: this.values[1], updated_at: this.values[2] });
      }
    } else if (query.startsWith("UPDATE operator_crawl_runs SET zyte_job_id = ?")) {
      Object.assign(this.requireRun(this.values[2]), { zyte_job_id: this.values[0], status: "running", updated_at: this.values[1] });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET discovered_sellers = ?")) {
      Object.assign(this.requireRun(this.values[4]), {
        discovered_sellers: this.values[0], enriched_sellers: this.values[1],
        contacts_found: Number(this.requireRun(this.values[4]).contacts_found) + Number(this.values[2]),
        updated_at: this.values[3]
      });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET stage = 'enriching'")) {
      Object.assign(this.requireRun(this.values[2]), {
        stage: "enriching", status: "enriching", approved_domains_json: this.values[0],
        zyte_job_id: null, updated_at: this.values[1]
      });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET status = ?, stage = ?, active_unit_slot = ?")) {
      const run = this.requireRun(this.values[9]);
      Object.assign(run, {
        status: this.values[0], stage: this.values[1], active_unit_slot: this.values[2],
        finished_at: this.values[3] ? this.values[4] : run.finished_at,
        updated_at: this.values[5], error_code: this.values[6], error_message: this.values[7],
        warnings_json: this.values[8] ?? run.warnings_json
      });
    }
    return { success: true };
  }

  private resolve(): Row[] {
    const query = compact(this.query);
    if (query.includes("FROM operator_crawl_idempotency")) {
      return this.state.idempotency.filter((item) => item.idempotency_key === this.values[0]);
    }
    if (query.includes("FROM operator_crawl_runs WHERE active_unit_slot = 1")) {
      return this.state.runs.filter((item) => item.active_unit_slot === 1).slice(0, 1);
    }
    if (query.includes("FROM operator_crawl_runs WHERE status = 'queued'")) {
      return this.state.runs.filter((item) => item.status === "queued").slice(0, 1);
    }
    if (query.includes("FROM operator_crawl_runs WHERE id = ?")) {
      return this.state.runs.filter((item) => item.id === this.values[0]).slice(0, 1);
    }
    if (query.includes("SELECT o.*") && query.includes("FROM operator_crawl_runs o")) {
      return this.state.runs.map((run) => ({ ...run, total_count: this.state.runs.length }));
    }
    if (query.includes("FROM crawl_run_sellers WHERE crawl_run_id = ?") && query.includes("COUNT(DISTINCT")) {
      const matching = this.state.runSellers.filter((item) => item.crawl_run_id === this.values[0]);
      return [{
        discovered: new Set(matching.filter((item) => item.stage === "discovered").map((item) => item.seller_id)).size,
        enriched: new Set(matching.filter((item) => item.stage === "enriched").map((item) => item.seller_id)).size
      }];
    }
    if (query.includes("SELECT DISTINCT seller_id FROM crawl_run_sellers")) {
      return this.state.runSellers
        .filter((item) => item.crawl_run_id === this.values[0])
        .map((item) => ({ seller_id: item.seller_id }));
    }
    if (query.includes("SELECT id FROM operator_crawl_runs WHERE active_unit_slot = 1")) {
      return this.state.runs.filter((item) => item.active_unit_slot === 1).map((item) => ({ id: item.id })).slice(0, 1);
    }
    return [];
  }

  private requireRun(id: D1Value): Row {
    const run = this.state.runs.find((item) => item.id === id);
    if (!run) throw new Error("fixture run missing");
    return run;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("operator crawl control", () => {
  it("launches exactly one bounded Student job and queues the second run", async () => {
    const db = new OperatorD1();
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = new URLSearchParams(String(init?.body ?? ""));
      requests.push({ url, body });
      if (url.includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      return Response.json({ status: "ok", jobid: "871778/1/101" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));

    const first = await service.create(findRequest("crawl-one"), "operator@example.test");
    const second = await service.create(findRequest("crawl-two"), "operator@example.test");

    expect(first.run.status).toBe("running");
    expect(second.run.status).toBe("queued");
    const launches = requests.filter((request) => request.url.endsWith("/run.json"));
    expect(launches).toHaveLength(1);
    expect(launches[0].body.get("units")).toBe("1");
    expect(launches[0].body.get("spider")).toBe("amazon_discovery");
    const settings = JSON.parse(String(launches[0].body.get("job_settings"))) as Record<string, unknown>;
    expect(settings).toMatchObject({
      ZYTE_API_ENABLED: false,
      PAID_SERVICES_ALLOWED: false,
      ALLOW_EXTRA_SCRAPY_UNITS: false,
      SCRAPY_CLOUD_MAX_UNITS: 1,
      ENABLE_AMAZON: true,
      LIVE_CRAWL_ENABLED: true
    });
  });

  it("cancels the active job and immediately advances the queued run", async () => {
    const db = new OperatorD1();
    let nextJob = 201;
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      if (url.endsWith("/jobs/stop.json")) return Response.json({ status: "ok" });
      return Response.json({ status: "ok", jobid: `871778/1/${nextJob++}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));
    const first = await service.create(findRequest("cancel-one"), "operator@example.test");
    const second = await service.create(findRequest("cancel-two"), "operator@example.test");

    await service.cancel(first.run.id, "operator@example.test");

    expect(db.runs.find((run) => run.id === first.run.id)?.status).toBe("cancelled");
    expect(db.runs.find((run) => run.id === second.run.id)?.status).toBe("running");
    expect(db.runs.filter((run) => run.active_unit_slot === 1)).toHaveLength(1);
    expect(urls.some((url) => url.endsWith("/jobs/stop.json"))).toBe(true);
  });

  it("rejects direct crawl SSRF targets before any job launch", async () => {
    const db = new OperatorD1();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new OperatorCrawlService(operatorEnv(db));

    await expect(service.create({
      ...findRequest("direct-private"),
      mode: "known_websites",
      keywords: undefined,
      marketplace: undefined,
      seedUrls: ["https://127.0.0.1/private"]
    }, "operator@example.test")).rejects.toMatchObject({
      status: 400,
      code: "invalid_crawl_request"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an idempotent create from launching a duplicate job", async () => {
    const db = new OperatorD1();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      return Response.json({ status: "ok", jobid: "871778/1/301" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OperatorCrawlService(operatorEnv(db));
    const request = findRequest("idempotent-key");

    const first = await service.create(request, "operator@example.test");
    const duplicate = await service.create(request, "operator@example.test");

    expect(duplicate.run.id).toBe(first.run.id);
    expect(db.runs).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/run.json"))).toHaveLength(1);
  });

  it("retries a terminal run as a new audited one-unit request", async () => {
    const db = new OperatorD1();
    let job = 401;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/jobs/stop.json")) return Response.json({ status: "ok" });
      return Response.json({ status: "ok", jobid: `871778/1/${job++}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));
    const first = await service.create(findRequest("retry-source"), "operator@example.test");
    await service.cancel(first.run.id, "operator@example.test");

    const retried = await service.retry(first.run.id, "operator@example.test");

    expect(retried.run.id).not.toBe(first.run.id);
    expect(retried.run.status).toBe("running");
    expect(db.runs.find((run) => run.id === retried.run.id)?.retry_of_run_id).toBe(first.run.id);
    expect(db.runs.filter((run) => run.active_unit_slot === 1)).toHaveLength(1);
  });

  it("hands a discovered credible official domain to enrichment on the same unit", async () => {
    const db = new OperatorD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("jobs/list.json")) return Response.json({ jobs: [{ state: "finished", close_reason: "finished" }] });
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: `871778/1/${500 + launches.length}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, new OfficialDomainD1()));
    const created = await service.create(findRequest("handoff-run"), "operator@example.test");
    await service.recordIngestion(
      created.run.id,
      ["018f2d5e-7b3c-7a1d-8f2e-123456789abc"],
      ["amazon_seller"],
      0
    );

    await service.pump();

    expect(launches).toHaveLength(2);
    expect(launches[0].get("spider")).toBe("amazon_discovery");
    expect(launches[1].get("spider")).toBe("official_website");
    expect(launches[1].get("seed_urls")).toBe("https://official.example/");
    expect(db.runs[0].active_unit_slot).toBe(1);
  });
});

class OfficialDomainD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => null as T | null,
      all: async <T>() => ({ success: true, results: [{ official_domain: "official.example" }] as T[] }),
      run: async () => ({ success: true })
    };
  }
}

function findRequest(idempotencyKey: string): Record<string, unknown> {
  return {
    mode: "find_sellers",
    keywords: ["stainless steel bottle"],
    marketplace: "amazon.com",
    countryCodes: ["US"],
    filters: { requirePublicLocation: true },
    contactTypes: ["email", "phone"],
    targetSellerCount: 1,
    maxResultPages: 1,
    maxOfficialPages: 4,
    crawlDepth: 1,
    stopAfterTarget: true,
    idempotencyKey
  };
}

function operatorEnv(db: D1Database, core?: D1Database): RuntimeEnv {
  return {
    APP_ENV: "local",
    OPS_DB: db,
    CORE_DB: core,
    RUNNER_MODE: "zyte_student_active",
    LIVE_CRAWL_ENABLED: "true",
    OPERATOR_CRAWL_ENABLED: "true",
    GLOBAL_CRAWL_KILL_SWITCH: "false",
    ENABLE_AMAZON: "true",
    ENABLE_OFFICIAL_WEBSITE: "true",
    ENABLE_SEARCH_DISCOVERY: "false",
    PAID_SERVICES_ALLOWED: "false",
    MAX_EXTERNAL_MONTHLY_SPEND_AUD: "0",
    ALLOW_EXTRA_SCRAPY_UNITS: "false",
    ALLOW_PAID_ADDONS: "false",
    SCRAPY_CLOUD_MAX_UNITS: "1",
    SCRAPY_CLOUD_DEPLOY_ENABLED: "true",
    ZYTE_STUDENT_ENTITLEMENT_CONFIRMED: "true",
    ZYTE_API_ENABLED: "false",
    SCRAPY_CLOUD_PROJECT_ID: "871778",
    SCRAPY_CLOUD_ARTIFACT_VERSION: "fixture-sha",
    SCRAPY_CLOUD_API_KEY: "fixture-secret",
    SOURCE_COOLDOWN_CHECK_URL: "https://api-stg.scalemyprints.com/v1/crawl/authorize",
    INGESTION_ENDPOINT_URL: "https://api-stg.scalemyprints.com/v1/ingest/batch",
    INGESTION_HMAC_SECRET: "fixture-hmac",
    CONTACT_ENCRYPTION_KEYS: '{"fixture":"fixture-key"}',
    CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION: "fixture"
  };
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
