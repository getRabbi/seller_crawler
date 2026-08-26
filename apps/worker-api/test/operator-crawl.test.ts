import { afterEach, describe, expect, it, vi } from "vitest";

import { operatorCrawlResponse } from "../src/operator-crawl/routes";
import { OperatorCrawlService } from "../src/operator-crawl/service";
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "../src/repositories/d1";
import type { RuntimeEnv } from "../src/validation/startup";

type Row = Record<string, unknown>;

class OperatorD1 implements D1Database {
  readonly runs: Row[] = [];
  readonly idempotency: Row[] = [];
  readonly events: Row[] = [];
  readonly runSellers: Row[] = [];
  readonly runContacts: Row[] = [];
  readonly crawlerRuns: Row[] = [];

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
    let changes = 1;
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
        search_fingerprint: null,
        discovered_sellers: 0, enriched_sellers: 0, contacts_found: 0,
        warnings_json: "[]", error_code: null, error_message: null
      });
    } else if (query.startsWith("INSERT INTO operator_crawl_runs") && query.includes("'queued', 'queued'")) {
      const [
        id, mode, queryJson, marketplace, countries, filters, seeds, contacts, target,
        maxResults, maxOfficial, depth, stop, actor, requestedAt, updatedAt, domains, artifact,
        searchFingerprint
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
        search_fingerprint: searchFingerprint,
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
    } else if (query.startsWith("INSERT INTO crawl_run_contacts")) {
      const [crawlRunId, contactId, sellerId, firstSeenAt] = this.values;
      if (!this.state.runContacts.some((item) => item.crawl_run_id === crawlRunId && item.contact_id === contactId)) {
        this.state.runContacts.push({ crawl_run_id: crawlRunId, contact_id: contactId, seller_id: sellerId, first_seen_at: firstSeenAt });
      }
    } else if (query.startsWith("UPDATE operator_crawl_runs SET status = 'starting'")) {
      const run = this.state.runs.find((item) => item.id === this.values[3] && item.status === "queued");
      if (run && !this.state.runs.some((item) => item.active_unit_slot === 1)) {
        Object.assign(run, { status: "starting", stage: this.values[0], active_unit_slot: 1, started_at: this.values[1], updated_at: this.values[2] });
      } else {
        changes = 0;
      }
    } else if (query.startsWith("UPDATE operator_crawl_runs SET status = 'launching'")) {
      const run = this.state.runs.find((item) =>
        item.id === this.values[1] && item.active_unit_slot === 1 && item.zyte_job_id === null &&
        item.status === this.values[2] && item.updated_at === this.values[3]
      );
      if (run) Object.assign(run, { status: "launching", updated_at: this.values[0] });
      else changes = 0;
    } else if (query.startsWith("UPDATE operator_crawl_runs SET zyte_job_id = ?")) {
      Object.assign(this.requireRun(this.values[2]), { zyte_job_id: this.values[0], status: "running", updated_at: this.values[1] });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET discovered_sellers = ?")) {
      Object.assign(this.requireRun(this.values[4]), {
        discovered_sellers: this.values[0], enriched_sellers: this.values[1],
        contacts_found: Number(this.values[2]),
        updated_at: this.values[3]
      });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET stage = ?, status = ?")) {
      Object.assign(this.requireRun(this.values[5]), {
        stage: this.values[0], status: this.values[1], approved_domains_json: this.values[2],
        warnings_json: this.values[3], zyte_job_id: null, updated_at: this.values[4]
      });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET approved_domains_json = ?")) {
      Object.assign(this.requireRun(this.values[1]), { approved_domains_json: this.values[0] });
    } else if (query.startsWith("UPDATE operator_crawl_runs SET status = ?, stage = ?, active_unit_slot = ?")) {
      const run = this.requireRun(this.values[9]);
      Object.assign(run, {
        status: this.values[0], stage: this.values[1], active_unit_slot: this.values[2],
        finished_at: this.values[3] ? this.values[4] : run.finished_at,
        updated_at: this.values[5], error_code: this.values[6], error_message: this.values[7],
        warnings_json: this.values[8] ?? run.warnings_json
      });
    }
    return { success: true, meta: { changes } };
  }

  private resolve(): Row[] {
    const query = compact(this.query);
    if (query.includes("FROM operator_crawl_idempotency")) {
      return this.state.idempotency.filter((item) => item.idempotency_key === this.values[0]);
    }
    if (query.includes("FROM operator_crawl_runs WHERE search_fingerprint = ?")) {
      return this.state.runs
        .filter((item) => item.search_fingerprint === this.values[0] && item.retry_of_run_id === null)
        .slice(0, 1);
    }
    if (query.includes("search_fingerprint IS NULL") && query.includes("mode = 'find_sellers'")) {
      return this.state.runs.filter((item) =>
        item.mode === "find_sellers" &&
        item.marketplace === this.values[0] &&
        item.search_fingerprint == null
      );
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
    if (query.includes("FROM crawl_runs WHERE id = ?")) {
      return this.state.crawlerRuns.filter((item) => item.id === this.values[0]).slice(0, 1);
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
    if (query.includes("SELECT COUNT(*) AS contacts_found FROM crawl_run_contacts")) {
      return [{ contacts_found: this.state.runContacts.filter((item) => item.crawl_run_id === this.values[0]).length }];
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
  it("hydrates run seller snapshots with active contact aggregates", async () => {
    const service = new OperatorCrawlService(
      operatorEnv(new OperatorD1(), new SellerSnapshotD1(), new ContactSnapshotD1())
    );
    const internal = service as unknown as {
      sellersByIds(ids: string[]): Promise<Array<{ contactCount: number; contactTypes: string[] }>>;
    };

    const sellers = await internal.sellersByIds([
      "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    ]);

    expect(sellers[0]).toMatchObject({ contactCount: 5 });
    expect(new Set(sellers[0].contactTypes)).toEqual(new Set(["email", "phone", "contact_form"]));
  });

  it("caps verified official-site enrichment at 25 sites for the 100-page budget", async () => {
    const db = new OperatorD1();
    const runId = "018f2d5e-7b3c-7a1d-8f2e-123456789abc";
    for (let index = 0; index < 30; index += 1) {
      db.runSellers.push({ crawl_run_id: runId, seller_id: `seller-${index}`, stage: "discovered" });
    }
    const service = new OperatorCrawlService(operatorEnv(db, new ManyOfficialDomainsD1()));
    const internal = service as unknown as {
      officialTargetsForRun(id: string): Promise<Array<{ seedUrl: string }>>;
    };

    const targets = await internal.officialTargetsForRun(runId);

    expect(targets).toHaveLength(25);
    expect(new Set(targets.map((target) => target.seedUrl)).size).toBe(25);
  });

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
    const second = await service.create({
      ...findRequest("crawl-two"),
      keywords: ["insulated lunch box"]
    }, "operator@example.test");

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
    expect(typeof settings.SELLERINTEL_OBSERVED_AT).toBe("string");
    expect(settings.SELLERINTEL_OBSERVED_AT).not.toBe("None");
    expect(Number.isNaN(Date.parse(String(settings.SELLERINTEL_OBSERVED_AT)))).toBe(false);
  });

  it("launches the 300-seller preset with a bounded derived discovery budget", async () => {
    const db = new OperatorD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      launches.push(new URLSearchParams(String(init?.body ?? "")));
      return Response.json({ status: "ok", jobid: "871778/1/102" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));

    await service.create({
      ...findRequest("largest-preset"),
      keywords: ["commercial food container"],
      targetSellerCount: 300,
      maxResultPages: 13
    }, "operator@example.test");

    expect(launches[0].get("target_sellers")).toBe("300");
    expect(launches[0].get("max_result_pages")).toBe("13");
    const settings = JSON.parse(String(launches[0].get("job_settings"))) as Record<string, unknown>;
    expect(settings.CLOSESPIDER_PAGECOUNT).toBe(615);
    expect(settings.SCRAPY_CLOUD_MAX_UNITS).toBe(1);
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
    const second = await service.create({
      ...findRequest("cancel-two"),
      keywords: ["insulated lunch box"]
    }, "operator@example.test");

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

  it("skips the same normalized search even when target and keyword formatting change", async () => {
    const db = new OperatorD1();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      return Response.json({ status: "ok", jobid: "871778/1/302" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new OperatorCrawlService(operatorEnv(db));

    const first = await service.create(findRequest("semantic-search-one"), "operator@example.test");
    const duplicate = await service.create({
      ...findRequest("semantic-search-two"),
      keywords: ["  STAINLESS   STEEL BOTTLE  "],
      targetSellerCount: 300,
      maxResultPages: 13
    }, "operator@example.test");

    expect(duplicate).toMatchObject({
      skipped: true,
      skipReason: "duplicate_search",
      duplicateOfRunId: first.run.id
    });
    expect(duplicate.run.id).toBe(first.run.id);
    expect(db.runs).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/run.json"))).toHaveLength(1);
  });

  it("returns HTTP 200 rather than 201 when the create route skips an existing search", async () => {
    const db = new OperatorD1();
    const env = operatorEnv(db);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      return Response.json({ status: "ok", jobid: "871778/1/303" });
    }));
    await new OperatorCrawlService(env).create(findRequest("route-search-one"), "operator@example.test");

    const response = await operatorCrawlResponse(new Request("https://api.example.test/v1/crawl-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...findRequest("route-search-two"),
        targetSellerCount: 200,
        maxResultPages: 9
      })
    }), env, "operator@example.test");
    const payload = await response.json() as { skipped?: boolean; duplicateOfRunId?: string };

    expect(response.status).toBe(200);
    expect(payload.skipped).toBe(true);
    expect(payload.duplicateOfRunId).toBe(db.runs[0].id);
  });

  it("also skips an equivalent pre-migration search without a stored fingerprint", async () => {
    const db = new OperatorD1();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("jobs/list.json")) return Response.json({ jobs: [{ state: "running" }] });
      return Response.json({ status: "ok", jobid: "871778/1/304" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));
    const first = await service.create(findRequest("legacy-search-one"), "operator@example.test");
    db.runs[0].search_fingerprint = null;

    const duplicate = await service.create({
      ...findRequest("legacy-search-two"),
      keywords: ["Stainless Steel Bottle"],
      targetSellerCount: 200,
      maxResultPages: 9
    }, "operator@example.test");

    expect(duplicate.skipped).toBe(true);
    expect(duplicate.run.id).toBe(first.run.id);
    expect(db.runs).toHaveLength(1);
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
      []
    );
    await service.recordIngestion(
      created.run.id,
      ["018f2d5e-7b3c-7a1d-8f2e-123456789abc"],
      ["official_domain_discovery"],
      []
    );
    expect(db.runs[0].enriched_sellers).toBe(0);

    await service.pump();

    expect(launches).toHaveLength(2);
    expect(launches[0].get("spider")).toBe("amazon_discovery");
    expect(launches[1].get("spider")).toBe("official_website");
    expect(launches[1].get("seed_urls")).toBe("https://official.example/");
    expect(JSON.parse(String(launches[1].get("seller_targets")))).toEqual([{
      seller_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      seller_name: "Official Example",
      seed_url: "https://official.example/"
    }]);
    expect(db.runs[0].active_unit_slot).toBe(1);
  });

  it("recovers an accepted stage launch by its unique tag without launching twice", async () => {
    const db = new OperatorD1();
    let launchRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("jobs/list.json") && url.includes("has_tag=")) {
        const tag = new URL(url).searchParams.get("has_tag");
        return Response.json({
          status: "ok",
          jobs: [{ id: "871778/1/777", state: "running", tags: [tag] }]
        });
      }
      launchRequests += 1;
      return Response.json({ status: "ok", jobid: "871778/1/700" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));
    const created = await service.create(findRequest("recover-launch-run"), "operator@example.test");
    const run = db.runs[0];
    Object.assign(run, {
      status: "launching",
      zyte_job_id: null,
      active_unit_slot: 1,
      updated_at: "2026-01-01T00:00:00.000Z"
    });

    await service.pump();

    expect(launchRequests).toBe(1);
    expect(run.zyte_job_id).toBe("871778/1/777");
    expect(run.status).toBe("running");
    expect(db.events.some((event) =>
      event.crawl_run_id === created.run.id && event.event_type === "launch_recovered"
    )).toBe(true);
  });

  it("verifies a deterministic domain candidate before linked contact enrichment", async () => {
    const db = new OperatorD1();
    const core = new ResolvingDomainD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("jobs/list.json")) {
        return Response.json({ jobs: [{ state: "finished", close_reason: "finished" }] });
      }
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: `871778/1/${550 + launches.length}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, core));
    const created = await service.create(findRequest("domain-resolution-run"), "operator@example.test");
    await service.recordIngestion(
      created.run.id,
      ["018f2d5e-7b3c-7a1d-8f2e-123456789abc"],
      ["amazon_seller"],
      []
    );

    await service.pump();

    expect(launches).toHaveLength(2);
    expect(launches[1].get("spider")).toBe("official_domain_discovery");
    expect(JSON.parse(String(launches[1].get("candidate_targets")))).toEqual([
      {
        seller_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        seller_name: "Watersy Bottle",
        seller_names: ["watersy bottle"],
        seed_url: "https://watersybottle.com/",
        candidate_basis: "identity_exact_compact"
      },
      {
        seller_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        seller_name: "Watersy Bottle",
        seller_names: ["watersy bottle"],
        seed_url: "https://watersy-bottle.com/",
        candidate_basis: "identity_exact_hyphenated"
      }
    ]);
    expect(JSON.parse(String(db.runs[0].approved_domains_json))).toContain("watersybottle.com");

    core.verified = true;
    await service.pump();

    expect(launches).toHaveLength(3);
    expect(launches[2].get("spider")).toBe("official_website");
    expect(launches[2].get("seed_urls")).toBe("https://watersybottle.com/");
    expect(db.runs[0].active_unit_slot).toBe(1);
  });

  it("resolves an existing canonical seller without calling Amazon", async () => {
    const db = new OperatorD1();
    const core = new ResolvingDomainD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("jobs/list.json")) {
        return Response.json({ jobs: [{ state: "finished", close_reason: "finished" }] });
      }
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: `871778/1/${800 + launches.length}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, core));
    const created = await service.create({
      mode: "resolve_seller",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      contactTypes: ["email", "phone", "contact_form"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 8,
      crawlDepth: 2,
      stopAfterTarget: true,
      idempotencyKey: "resolve-existing-seller"
    }, "operator@example.test");

    expect(created.run.mode).toBe("resolve_seller");
    expect(created.run.stage).toBe("resolving");
    expect(launches).toHaveLength(1);
    expect(launches[0].get("spider")).toBe("official_domain_discovery");
    expect(launches[0].get("keywords")).toBeNull();
    expect(JSON.parse(String(db.runs[0].approved_domains_json))).toContain("watersybottle.com");

    core.verified = true;
    await service.pump();

    expect(launches).toHaveLength(2);
    expect(launches[1].get("spider")).toBe("official_website");
    expect(launches[1].get("seed_urls")).toBe("https://watersybottle.com/");
    expect(launches[1].get("contact_types")).toBe("email,phone,contact_form");
  });

  it("uses the normalized brand identity when a marketplace suffix is removed", async () => {
    const db = new OperatorD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: "871778/1/899" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, new GenericSuffixDomainD1()));

    await service.create({
      mode: "resolve_seller",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      contactTypes: ["email", "phone", "contact_form"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 8,
      crawlDepth: 2,
      stopAfterTarget: true,
      idempotencyKey: "resolve-generic-suffix-seller"
    }, "operator@example.test");

    expect(launches).toHaveLength(1);
    expect(JSON.parse(String(launches[0].get("candidate_targets")))).toEqual([{
      seller_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      seller_name: "TOURIT Official Store",
      seller_names: ["tourit"],
      seed_url: "https://tourit.com/",
      candidate_basis: "identity_exact_compact"
    }]);
  });

  it("reconstructs verified enrichment targets after a Worker restart", async () => {
    const db = new OperatorD1();
    const core = new ResolvingDomainD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: `871778/1/${900 + launches.length}` });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, core));
    await service.create({
      mode: "resolve_seller",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      contactTypes: ["phone"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 8,
      crawlDepth: 2,
      stopAfterTarget: true,
      idempotencyKey: "restart-enrichment-targets"
    }, "operator@example.test");
    core.verified = true;
    Object.assign(db.runs[0], {
      stage: "enriching",
      status: "enriching",
      zyte_job_id: null,
      updated_at: "2026-08-24T08:00:00.000Z"
    });

    await service.pump();

    expect(launches).toHaveLength(2);
    expect(launches[1].get("spider")).toBe("official_website");
    expect(launches[1].get("seed_urls")).toBe("https://watersybottle.com/");
  });

  it("links a verified website crawl to an existing seller and preserves one bounded page budget", async () => {
    const db = new OperatorD1();
    const launches: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      launches.push(body);
      return Response.json({ status: "ok", jobid: "871778/1/601" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db, new LinkedSellerD1()));

    await service.create({
      mode: "known_websites",
      seedUrls: ["https://www.official.example/contact"],
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      contactTypes: ["email", "phone", "contact_form"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 4,
      crawlDepth: 1,
      stopAfterTarget: true,
      idempotencyKey: "linked-known-site"
    }, "operator@example.test");

    expect(launches).toHaveLength(1);
    expect(launches[0].get("seed_urls")).toBe("https://official.example/contact");
    expect(launches[0].get("page_budget")).toBe("4");
    expect(launches[0].get("contact_types")).toBe("email,phone,contact_form");
    expect(JSON.parse(String(launches[0].get("seller_targets")))[0].seller_id).toBe(
      "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    );
    const settings = JSON.parse(String(launches[0].get("job_settings"))) as Record<string, unknown>;
    expect(settings.CLOSESPIDER_PAGECOUNT).toBe(6);
  });

  it("rejects linked-seller domain conflicts and oversized official page plans", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const base = {
      mode: "known_websites",
      seedUrls: ["https://new-domain.example/contact"],
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      contactTypes: ["email"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 4,
      crawlDepth: 1,
      stopAfterTarget: true,
      idempotencyKey: "domain-conflict"
    };

    await expect(
      new OperatorCrawlService(operatorEnv(new OperatorD1(), new ConflictingSellerD1()))
        .create(base, "operator@example.test")
    ).rejects.toMatchObject({ status: 409, code: "official_domain_conflict" });

    await expect(
      new OperatorCrawlService(operatorEnv(new OperatorD1())).create({
        ...findRequest("oversized-plan"),
        targetSellerCount: 20,
        maxOfficialPages: 6
      }, "operator@example.test")
    ).rejects.toMatchObject({ status: 400, code: "invalid_crawl_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts crawl contacts idempotently across repeated ingestion bookkeeping", async () => {
    const db = new OperatorD1();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok", jobid: "871778/1/701" })));
    const service = new OperatorCrawlService(operatorEnv(db));
    const created = await service.create(findRequest("contact-idempotency"), "operator@example.test");
    const contact = {
      id: "018f2d5e-7b3c-7a1d-8f2e-123456789abd",
      sellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    };

    await service.recordIngestion(created.run.id, [contact.sellerId], ["official_site"], [contact]);
    await service.recordIngestion(created.run.id, [contact.sellerId], ["official_site"], [contact]);

    expect(db.runContacts).toHaveLength(1);
    expect(db.runs[0].contacts_found).toBe(1);
  });

  it("surfaces a crawler policy stop as blocked instead of completed", async () => {
    const db = new OperatorD1();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("jobs/list.json")) {
        return Response.json({ jobs: [{ state: "finished", close_reason: "finished" }] });
      }
      return Response.json({ status: "ok", jobid: "871778/1/801" });
    }));
    const service = new OperatorCrawlService(operatorEnv(db));
    const created = await service.create({
      mode: "known_websites",
      seedUrls: ["https://official.example/"],
      contactTypes: ["email"],
      targetSellerCount: 1,
      maxResultPages: 1,
      maxOfficialPages: 4,
      crawlDepth: 1,
      stopAfterTarget: true,
      idempotencyKey: "blocked-known-site"
    }, "operator@example.test");
    db.crawlerRuns.push({
      id: created.run.id,
      status: "paused_by_policy",
      contacts_verified: 0,
      blocked_count: 1,
      error_count: 0
    });

    await service.pump();

    expect(db.runs[0].status).toBe("blocked");
    expect(db.runs[0].active_unit_slot).toBeNull();
    expect(db.runs[0].error_code).toBe("source_blocked");
  });
});

class OfficialDomainD1 implements D1Database {
  prepare(query: string): D1PreparedStatement {
    const hasOfficialDomain = query.includes("official_domain IS NOT NULL");
    return {
      bind: () => this.prepare(query),
      first: async <T>() => null as T | null,
      all: async <T>() => ({
        success: true,
        results: (hasOfficialDomain ? [{
          id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
          canonical_name: "Official Example",
          official_domain: "official.example",
          identity_confidence: 90,
          last_seen_at: "2026-08-01T00:00:00Z"
        }] : []) as T[]
      }),
      run: async () => ({ success: true })
    };
  }
}

class ManyOfficialDomainsD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => null as T | null,
      all: async <T>() => ({
        success: true,
        results: Array.from({ length: 30 }, (_, index) => ({
          id: `seller-${index}`,
          canonical_name: `Official Seller ${index}`,
          official_domain: `seller-${index}.example`,
          identity_confidence: 100 - index,
          last_seen_at: "2026-08-24T00:00:00Z"
        })) as T[]
      }),
      run: async () => ({ success: true })
    };
  }
}

class ResolvingDomainD1 implements D1Database {
  verified = false;

  prepare(query: string): D1PreparedStatement {
    return {
      bind: () => this.prepare(query),
      first: async <T>() => (
        query.includes("FROM sellers WHERE id = ?")
          ? {
              id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
              canonical_name: "Watersy Bottle",
              official_domain: this.verified ? "watersybottle.com" : null,
              status: "active"
            } as T
          : null
      ),
      all: async <T>() => {
        if (query.includes("official_domain IS NOT NULL")) {
          return {
            success: true,
            results: (this.verified ? [{
              id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
              canonical_name: "Watersy Bottle",
              official_domain: "watersybottle.com",
              identity_confidence: 90,
              last_seen_at: "2026-08-24T00:00:00Z"
            }] : []) as T[]
          };
        }
        if (query.includes("official_domain IS NULL")) {
          return {
            success: true,
            results: (this.verified ? [] : [{
              id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
              canonical_name: "Watersy Bottle",
              legal_name: null
            }]) as T[]
          };
        }
        return { success: true, results: [] as T[] };
      },
      run: async () => ({ success: true })
    };
  }
}

class GenericSuffixDomainD1 implements D1Database {
  prepare(query: string): D1PreparedStatement {
    return {
      bind: () => this.prepare(query),
      first: async <T>() => (
        query.includes("FROM sellers WHERE id = ?")
          ? {
              id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
              canonical_name: "TOURIT Official Store",
              official_domain: null,
              status: "active"
            } as T
          : null
      ),
      all: async <T>() => ({
        success: true,
        results: (query.includes("official_domain IS NULL") ? [{
          id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
          canonical_name: "TOURIT Official Store",
          legal_name: null
        }] : []) as T[]
      }),
      run: async () => ({ success: true })
    };
  }
}

class LinkedSellerD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => ({
        id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        canonical_name: "Official Example",
        official_domain: null,
        status: "active"
      }) as T,
      all: async <T>() => ({ success: true, results: [] as T[] }),
      run: async () => ({ success: true })
    };
  }
}

class SellerSnapshotD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => null as T | null,
      all: async <T>() => ({
        success: true,
        results: [{
          id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
          canonical_name: "Official Example",
          legal_name: null,
          country_code: "US",
          province: null,
          city: null,
          official_domain: "example.test",
          identity_confidence: 90,
          quality_score: 80,
          manufacturer_score: 70,
          trader_score: 10,
          status: "active",
          first_seen_at: "2026-08-01T00:00:00Z",
          last_seen_at: "2026-08-24T00:00:00Z",
          updated_at: "2026-08-24T00:00:00Z",
          marketplace: "amazon.com",
          marketplace_display_name: "Official Example",
          marketplace_profile_url: null
        }] as T[]
      }),
      run: async () => ({ success: true })
    };
  }
}

class ContactSnapshotD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => null as T | null,
      all: async <T>() => ({
        success: true,
        results: [{
          seller_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
          contact_count: 5,
          contact_types: "email,phone,contact_form"
        }] as T[]
      }),
      run: async () => ({ success: true })
    };
  }
}

class ConflictingSellerD1 implements D1Database {
  prepare(): D1PreparedStatement {
    return {
      bind: () => this.prepare(),
      first: async <T>() => ({
        id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        canonical_name: "Official Example",
        official_domain: "existing.example",
        status: "active"
      }) as T,
      all: async <T>() => ({ success: true, results: [] as T[] }),
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

function operatorEnv(db: D1Database, core?: D1Database, contacts?: D1Database): RuntimeEnv {
  return {
    APP_ENV: "local",
    OPS_DB: db,
    CORE_DB: core,
    CONTACTS_DB: contacts,
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
