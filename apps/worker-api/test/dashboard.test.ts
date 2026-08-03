import { describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value
} from "../src/repositories/d1";
import type { RuntimeEnv } from "../src/validation/startup";

const sellerId = "018f2d5e-7b3c-7a1d-8f2e-123456789abc";
const matchedSellerId = "018f2d5e-7b3c-7a1d-8f2e-123456789abd";

type QueryResolver = (query: string, values: D1Value[]) => unknown[];

class FixtureD1 implements D1Database {
  readonly calls: Array<{ query: string; values: D1Value[] }> = [];

  constructor(private readonly resolver: QueryResolver) {}

  prepare(query: string): D1PreparedStatement {
    return new FixtureStatement(query, this.calls, this.resolver);
  }
}

class FixtureStatement implements D1PreparedStatement {
  private values: D1Value[] = [];

  constructor(
    private readonly query: string,
    private readonly calls: Array<{ query: string; values: D1Value[] }>,
    private readonly resolver: QueryResolver
  ) {}

  bind(...values: D1Value[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    this.calls.push({ query: this.query, values: this.values });
    return (this.resolver(this.query, this.values)[0] as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    this.calls.push({ query: this.query, values: this.values });
    return { success: true, results: this.resolver(this.query, this.values) as T[] };
  }

  async run(): Promise<D1Result> {
    this.calls.push({ query: this.query, values: this.values });
    return { success: true };
  }
}

describe("Solo dashboard API", () => {
  it("lists sellers with bounded pagination and FTS search", async () => {
    const env = dashboardEnv();
    const response = await worker.fetch(
      new Request("http://local.test/v1/search?q=Acme%20Tools&limit=999&offset=2"),
      env
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      total: 1,
      limit: 100,
      offset: 2,
      items: [{ id: sellerId, canonicalName: "Acme Industrial" }]
    });
    const core = env.CORE_DB as FixtureD1;
    expect(core.calls[0].query).toContain("seller_search_fts MATCH ?");
    expect(core.calls[0].values).toEqual(['"acme"* AND "tools"*', 100, 2]);
  });

  it("returns seller detail with masked contacts and compact evidence", async () => {
    const response = await worker.fetch(
      new Request(`http://local.test/v1/sellers/${sellerId}`),
      dashboardEnv()
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seller.id).toBe(sellerId);
    expect(payload.aliases).toEqual(["Acme Export"]);
    expect(payload.contacts[0]).toMatchObject({
      displayValueMasked: "sa***@example.invalid",
      sellerName: "Acme Industrial"
    });
    expect(JSON.stringify(payload)).not.toContain("sealed-contact-value");
    expect(payload.evidence[0]).toMatchObject({
      pageTitle: "Contact Acme",
      evidenceSnippet: "Email: sa***@example.invalid",
      contentHash: "sha256:fixture"
    });
  });

  it("lists duplicate reviews and crawl run status", async () => {
    const env = dashboardEnv();
    const [duplicatesResponse, runsResponse] = await Promise.all([
      worker.fetch(new Request("http://local.test/v1/duplicates?status=pending"), env),
      worker.fetch(new Request("http://local.test/v1/crawl-runs"), env)
    ]);
    const duplicates = await duplicatesResponse.json();
    const runs = await runsResponse.json();

    expect(duplicates.items[0]).toMatchObject({
      candidateName: "Acme Industrial",
      matchedName: "Acme Trading",
      score: 73,
      scoreBreakdown: { domain: 40 }
    });
    expect(runs.items[0]).toMatchObject({
      jobType: "official_site_fixture",
      status: "completed",
      requestsTotal: 8,
      contactsVerified: 4
    });
  });

  it("exports masked contacts and neutralizes CSV formulas", async () => {
    const response = await worker.fetch(
      new Request("http://local.test/v1/export.csv?dataset=contacts"),
      dashboardEnv({ contactDisplay: "=HYPERLINK(\"bad\")" })
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "seller-intelligence-contacts.csv"
    );
    expect(body).toContain("'=HYPERLINK(\"\"bad\"\")");
    expect(body).not.toContain("sealed-contact-value");
  });

  it("fails closed outside local when Access is unconfigured or unauthenticated", async () => {
    const unconfigured = await worker.fetch(
      new Request("https://api.example.invalid/v1/sellers"),
      dashboardEnv({ appEnv: "staging", allowedEmail: undefined })
    );
    const unauthenticated = await worker.fetch(
      new Request("https://api.example.invalid/v1/sellers"),
      dashboardEnv({ appEnv: "staging" })
    );

    expect(unconfigured.status).toBe(503);
    expect((await unconfigured.json()).error.code).toBe("access_not_configured");
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("access_required");
  });

  it("allows exactly the configured Access user and adds exact-origin CORS", async () => {
    const env = dashboardEnv({ appEnv: "production" });
    const request = new Request("https://api.example.invalid/v1/sellers", {
      headers: {
        origin: "https://dashboard.example.invalid",
        "cf-access-jwt-assertion": "fixture-jwt",
        "cf-access-authenticated-user-email": "operator@example.invalid"
      }
    });
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://dashboard.example.invalid"
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not echo unapproved origins and rejects other Access users", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.invalid/v1/sellers", {
        headers: {
          origin: "https://attacker.invalid",
          "cf-access-jwt-assertion": "fixture-jwt",
          "cf-access-authenticated-user-email": "other@example.invalid"
        }
      }),
      dashboardEnv({ appEnv: "production" })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns a controlled error when a required D1 binding is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("http://local.test/v1/sellers"),
      dashboardEnv({ omitCore: true })
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("database_unavailable");
    vi.restoreAllMocks();
  });
});

function dashboardEnv(
  options: {
    appEnv?: string;
    allowedEmail?: string;
    contactDisplay?: string;
    omitCore?: boolean;
  } = {}
): RuntimeEnv {
  const core = new FixtureD1((query) => {
    if (query.includes("FROM seller_aliases")) {
      return [{ alias: "Acme Export" }];
    }
    if (query.includes("FROM entity_resolution_decisions")) {
      return [duplicateRow()];
    }
    if (query.includes("SELECT id, canonical_name FROM sellers")) {
      return [
        { id: sellerId, canonical_name: "Acme Industrial" },
        { id: matchedSellerId, canonical_name: "Acme Trading" }
      ];
    }
    if (query.includes("FROM sellers")) {
      return [sellerRow()];
    }
    return [];
  });
  const contacts = new FixtureD1((query) =>
    query.includes("FROM contacts") ? [contactRow(options.contactDisplay)] : []
  );
  const operations = new FixtureD1((query) => {
    if (query.includes("FROM sources")) {
      return [evidenceRow()];
    }
    if (query.includes("FROM crawl_runs")) {
      return [crawlRunRow()];
    }
    return [];
  });

  return {
    APP_ENV: options.appEnv ?? "local",
    ACCESS_AUTH_REQUIRED: "true",
    ACCESS_ALLOWED_EMAIL:
      "allowedEmail" in options ? options.allowedEmail : "operator@example.invalid",
    DASHBOARD_ORIGIN: "https://dashboard.example.invalid",
    CORE_DB: options.omitCore ? undefined : core,
    CONTACTS_DB: contacts,
    OPS_DB: operations,
    HISTORY_DB: new FixtureD1(() => [])
  };
}

function sellerRow(): Record<string, unknown> {
  return {
    id: sellerId,
    canonical_name: "Acme Industrial",
    legal_name: "Acme Industrial Limited",
    country_code: "US",
    province: "WA",
    city: "Seattle",
    official_domain: "example.invalid",
    identity_confidence: 88,
    quality_score: 84,
    status: "active",
    first_seen_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-04T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
    total_count: 1
  };
}

function contactRow(displayValue = "sa***@example.invalid"): Record<string, unknown> {
  return {
    id: "018f2d5e-7b3c-7a1d-8f2e-123456789abe",
    seller_id: sellerId,
    contact_type: "email",
    display_value_masked: displayValue,
    classification: "business_generic",
    confidence: 91,
    source_id: "018f2d5e-7b3c-7a1d-8f2e-123456789abf",
    first_seen_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-04T00:00:00Z",
    last_verified_at: "2026-08-04T00:00:00Z",
    status: "active",
    total_count: 1
  };
}

function evidenceRow(): Record<string, unknown> {
  return {
    id: "018f2d5e-7b3c-7a1d-8f2e-123456789abf",
    source_url: "https://example.invalid/contact",
    canonical_url: "https://example.invalid/contact",
    page_title: "Contact Acme",
    evidence_snippet: "Email: sa***@example.invalid",
    content_hash: "sha256:fixture",
    detected_at: "2026-08-04T00:00:00Z",
    last_seen_at: "2026-08-04T00:00:00Z",
    http_status: 200,
    robots_status: "allowed",
    status: "active"
  };
}

function duplicateRow(): Record<string, unknown> {
  return {
    id: "018f2d5e-7b3c-7a1d-8f2e-123456789aba",
    candidate_seller_id: sellerId,
    candidate_name: "Acme Industrial",
    matched_seller_id: matchedSellerId,
    matched_name: "Acme Trading",
    action: "review_queue",
    score: 73,
    score_breakdown_json: '{"domain":40}',
    status: "pending",
    created_at: "2026-08-04T00:00:00Z",
    total_count: 1
  };
}

function crawlRunRow(): Record<string, unknown> {
  return {
    id: "018f2d5e-7b3c-7a1d-8f2e-123456789aaa",
    job_type: "official_site_fixture",
    zyte_job_id: null,
    started_at: "2026-08-04T00:00:00Z",
    finished_at: "2026-08-04T00:01:00Z",
    status: "completed",
    requests_total: 8,
    responses_success: 8,
    candidates_found: 1,
    records_created: 6,
    records_updated: 0,
    contacts_verified: 4,
    blocked_count: 0,
    error_count: 0,
    notes: null,
    total_count: 1
  };
}
