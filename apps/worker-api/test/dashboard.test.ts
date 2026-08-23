import { describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

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
const contactId = "018f2d5e-7b3c-7a1d-8f2e-123456789abe";
const contactKey = new Uint8Array(32).fill(107);
let accessSigningKeys: Awaited<ReturnType<typeof generateKeyPair>> | undefined;

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
      jobType: "official_website",
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

  it("exports operator crawl runs without operator identity or secrets", async () => {
    const response = await worker.fetch(
      new Request("http://local.test/v1/export.csv?dataset=crawls"),
      dashboardEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "seller-intelligence-crawl-runs.csv"
    );
    expect(body).toContain('"mode","job_type","query","marketplace"');
    expect(body).toContain('"known_websites","official_website"');
    expect(body).toContain('"completed","completed"');
    expect(body).not.toContain("operator@example.invalid");
    expect(body).not.toContain("fixture-secret");
  });

  it("reveals an authenticated contact only through an audited operator mutation", async () => {
    const env = dashboardEnv({ appEnv: "production" });
    const token = await accessToken("operator@example.invalid");
    const response = await worker.fetch(
      new Request(`https://api.example.invalid/v1/contacts/${contactId}/reveal`, {
        method: "POST",
        headers: {
          origin: "https://dashboard.example.invalid",
          "content-type": "application/json",
          "cf-access-jwt-assertion": token
        },
        body: JSON.stringify({ reason: "Operator verification" })
      }),
      env
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: contactId,
      contactType: "email",
      value: "sales@example.test"
    });
    const contacts = env.CONTACTS_DB as FixtureD1;
    const audit = contacts.calls.find((call) => call.query.includes("INSERT INTO audit_events"));
    expect(audit?.values).toContain("operator@example.invalid");
    expect(audit?.values).toContain("Operator verification");
    expect(JSON.stringify(audit)).not.toContain("sales@example.test");
  });

  it("rejects contact reveal from an unapproved origin before decryption", async () => {
    const env = dashboardEnv({ appEnv: "production" });
    const token = await accessToken("operator@example.invalid");
    const response = await worker.fetch(
      new Request(`https://api.example.invalid/v1/contacts/${contactId}/reveal`, {
        method: "POST",
        headers: {
          origin: "https://attacker.invalid",
          "content-type": "application/json",
          "cf-access-jwt-assertion": token
        },
        body: JSON.stringify({ reason: "not allowed" })
      }),
      env
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("origin_denied");
    expect((env.CONTACTS_DB as FixtureD1).calls.some((call) => call.query.includes("audit_events"))).toBe(false);
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

  it("does not enable the local bypass when APP_ENV is missing", async () => {
    const env = dashboardEnv();
    delete env.APP_ENV;

    const response = await worker.fetch(
      new Request("https://api.example.invalid/v1/sellers"),
      env
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("access_required");
  });

  it("allows exactly the configured signed Access user and adds exact-origin CORS", async () => {
    const env = dashboardEnv({ appEnv: "production" });
    const token = await accessToken("operator@example.invalid");
    const request = new Request("https://api.example.invalid/v1/sellers", {
      headers: {
        origin: "https://dashboard.example.invalid",
        "cf-access-jwt-assertion": token
      }
    });
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://dashboard.example.invalid"
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("answers unauthenticated preflight only for the configured dashboard origin", async () => {
    const env = dashboardEnv({ appEnv: "production" });
    const allowed = await worker.fetch(
      new Request("https://api.example.invalid/v1/crawl-runs", {
        method: "OPTIONS",
        headers: {
          origin: "https://dashboard.example.invalid",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      }),
      env
    );
    const denied = await worker.fetch(
      new Request("https://api.example.invalid/v1/crawl-runs", {
        method: "OPTIONS",
        headers: {
          origin: "https://attacker.invalid",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      }),
      env
    );

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://dashboard.example.invalid"
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, OPTIONS"
    );
    expect(allowed.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("does not echo unapproved origins and rejects other Access users", async () => {
    const token = await accessToken("other@example.invalid");
    const response = await worker.fetch(
      new Request("https://api.example.invalid/v1/sellers", {
        headers: {
          origin: "https://attacker.invalid",
          "cf-access-jwt-assertion": token
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
    if (query.includes("JOIN sellers candidate")) {
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
  const contacts = new FixtureD1((query) => {
    if (query.includes("contact_value_ciphertext")) return [contactSecretRow()];
    return query.includes("FROM contacts") ? [contactRow(options.contactDisplay)] : [];
  });
  const operations = new FixtureD1((query) => {
    if (query.includes("FROM sources")) {
      return [evidenceRow()];
    }
    if (query.includes("FROM operator_crawl_runs")) {
      return [operatorCrawlRunRow()];
    }
    return [];
  });

  return {
    APP_ENV: options.appEnv ?? "local",
    ACCESS_AUTH_REQUIRED: "true",
    ACCESS_ALLOWED_EMAIL:
      "allowedEmail" in options ? options.allowedEmail : "operator@example.invalid",
    TEAM_DOMAIN: "https://seller-intelligence.cloudflareaccess.com",
    POLICY_AUD: "fixture-access-audience",
    DASHBOARD_ORIGIN: "https://dashboard.example.invalid",
    CONTACT_ENCRYPTION_KEYS: JSON.stringify({ "test-v1": encodeBase64Url(contactKey) }),
    CORE_DB: options.omitCore ? undefined : core,
    CONTACTS_DB: contacts,
    OPS_DB: operations,
    HISTORY_DB: new FixtureD1(() => [])
  };
}

async function accessToken(email: string): Promise<string> {
  accessSigningKeys ??= await generateKeyPair("RS256");
  const { privateKey, publicKey } = accessSigningKeys;
  const key = { ...(await exportJWK(publicKey)), kid: "fixture-key", alg: "RS256", use: "sig" };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [key] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
  );
  return new SignJWT({ email, type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
    .setIssuer("https://seller-intelligence.cloudflareaccess.com")
    .setAudience("fixture-access-audience")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
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

function contactSecretRow(): Record<string, unknown> {
  return {
    id: contactId,
    seller_id: sellerId,
    contact_type: "email",
    contact_value_ciphertext: sealedContactValue(),
    normalized_hash: "fixture-normalized-hash",
    display_value_masked: "sa***@example.test",
    status: "active"
  };
}

let sealedContact: string | undefined;

function sealedContactValue(): string {
  if (!sealedContact) throw new Error("sealed contact fixture was not initialized");
  return sealedContact;
}

async function initializeSealedContact(): Promise<void> {
  const nonce = new Uint8Array(12).fill(110);
  const key = await crypto.subtle.importKey("raw", contactKey, "AES-GCM", false, ["encrypt"]);
  const aad = new TextEncoder().encode(
    `seller-intelligence-contact|v1|${contactId}|${sellerId}|email`
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
    key,
    new TextEncoder().encode("sales@example.test")
  );
  sealedContact = `si-aesgcm:v1:test-v1:${encodeBase64Url(nonce)}:${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

function encodeBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

await initializeSealedContact();

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

function operatorCrawlRunRow(): Record<string, unknown> {
  return {
    id: "018f2d5e-7b3c-7a1d-8f2e-123456789aaa",
    mode: "known_websites",
    query_json: "[]",
    marketplace: null,
    country_codes_json: "[]",
    filters_json: "{}",
    seed_urls_json: '["https://example.invalid/"]',
    contact_types_json: '["email"]',
    target_seller_count: 1,
    max_result_pages: 1,
    max_official_pages: 8,
    crawl_depth: 2,
    stop_after_target: 1,
    zyte_job_id: null,
    retry_of_run_id: null,
    requested_by: "operator@example.invalid",
    requested_at: "2026-08-04T00:00:00Z",
    started_at: "2026-08-04T00:00:00Z",
    finished_at: "2026-08-04T00:01:00Z",
    status: "completed",
    stage: "completed",
    active_unit_slot: null,
    updated_at: "2026-08-04T00:01:00Z",
    approved_domains_json: '["example.invalid"]',
    artifact_version: "fixture",
    discovered_sellers: 1,
    enriched_sellers: 1,
    contacts_found: 4,
    requests_total: 8,
    responses_success: 8,
    blocked_count: 0,
    error_count: 0,
    warnings_json: "[]",
    error_code: null,
    error_message: null,
    total_count: 1
  };
}
