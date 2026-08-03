import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "../src/repositories";
import { hmacSha256Hex, sha256Hex } from "../src/ingestion/crypto";
import type { RuntimeEnv } from "../src/validation/startup";

const secret = "local-test-secret";
const runId = "018f2d5e-7b3c-7a1d-8f2e-123456789aaa";
const sellerId = "018f2d5e-7b3c-7a1d-8f2e-123456789abc";
const contactId = "018f2d5e-7b3c-7a1d-8f2e-123456789abd";
const sourceId = "018f2d5e-7b3c-7a1d-8f2e-123456789abe";
const nowIso = "2026-07-31T00:00:00.000Z";

interface StoredIdempotency {
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  createdAt: string;
  expiresAt: string;
}

interface StoredNonce {
  nonce: string;
  idempotencyKey: string;
  requestHash: string;
  createdAt: string;
  expiresAt: string;
}

class MemoryD1State {
  sellers = new Map<string, unknown[]>();
  contacts = new Map<string, unknown[]>();
  sources = new Map<string, unknown[]>();
  idempotencyKeys = new Map<string, StoredIdempotency>();
  nonces = new Map<string, StoredNonce>();
}

class MemoryD1Database implements D1Database {
  constructor(private readonly state: MemoryD1State) {}

  prepare(query: string): D1PreparedStatement {
    return new MemoryD1PreparedStatement(this.state, query);
  }
}

class MemoryD1PreparedStatement implements D1PreparedStatement {
  private values: D1Value[] = [];

  constructor(
    private readonly state: MemoryD1State,
    private readonly query: string
  ) {}

  bind(...values: D1Value[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query.includes("FROM sellers")) {
      return this.state.sellers.has(String(this.values[0])) ? ({ found: 1 } as T) : null;
    }

    if (this.query.includes("FROM idempotency_keys")) {
      return (this.state.idempotencyKeys.get(String(this.values[0])) as T | undefined) ?? null;
    }

    if (this.query.includes("FROM ingestion_nonces")) {
      return (this.state.nonces.get(String(this.values[0])) as T | undefined) ?? null;
    }

    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1Result> {
    if (this.query.includes("INSERT INTO sellers")) {
      this.state.sellers.set(String(this.values[0]), this.values);
    } else if (this.query.includes("INSERT INTO contacts")) {
      this.state.contacts.set(String(this.values[0]), this.values);
    } else if (this.query.includes("INSERT INTO sources")) {
      this.state.sources.set(String(this.values[0]), this.values);
    } else if (this.query.includes("INSERT INTO idempotency_keys")) {
      const idempotencyKey = String(this.values[0]);
      if (!this.state.idempotencyKeys.has(idempotencyKey)) {
        this.state.idempotencyKeys.set(idempotencyKey, {
          idempotencyKey,
          requestHash: String(this.values[1]),
          responseStatus: Number(this.values[2]),
          createdAt: String(this.values[3]),
          expiresAt: String(this.values[4])
        });
      }
    } else if (this.query.includes("INSERT INTO ingestion_nonces")) {
      const nonce = String(this.values[0]);
      if (!this.state.nonces.has(nonce)) {
        this.state.nonces.set(nonce, {
          nonce,
          idempotencyKey: String(this.values[1]),
          requestHash: String(this.values[2]),
          createdAt: String(this.values[3]),
          expiresAt: String(this.values[4])
        });
      }
    }

    return { success: true };
  }
}

describe("POST /v1/ingest/batch", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts a valid gzip signed batch and writes idempotent partition state", async () => {
    const state = new MemoryD1State();
    const env = ingestionEnv(state);
    const request = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:1`,
      nonce: "nonce-valid"
    });

    const response = await worker.fetch(request, env);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      accepted: true,
      duplicate: false,
      completed_stages: ["core", "contacts", "operations", "history"]
    });
    expect(state.sellers.has(sellerId)).toBe(true);
    expect(state.contacts.has(contactId)).toBe(true);
    expect(state.sources.has(sourceId)).toBe(true);
    expect(state.idempotencyKeys.has(`${runId}:1`)).toBe(true);
  });

  it("rejects schema-invalid signed batches", async () => {
    const state = new MemoryD1State();
    const invalid = validBatch();
    delete invalid.contacts[0].parser_version;
    const request = await signedIngestionRequest(invalid, {
      idempotencyKey: `${runId}:2`,
      nonce: "nonce-invalid-schema"
    });

    const response = await worker.fetch(request, ingestionEnv(state));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_schema");
    expect(state.contacts.size).toBe(0);
  });

  it("rejects wrong primitive types before partition writes", async () => {
    const state = new MemoryD1State();
    const invalid = validBatch();
    invalid.sellers[0].id = 123;
    invalid.contacts[0].parser_version = 42;
    invalid.contacts[0].status = "";
    const request = await signedIngestionRequest(invalid, {
      idempotencyKey: `${runId}:schema-types`,
      nonce: "nonce-schema-types"
    });

    const response = await worker.fetch(request, ingestionEnv(state));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_schema");
    expect(payload.error.details).toContain("$.sellers[0].id must be a string");
    expect(payload.error.details).toContain("$.contacts[0].parser_version must be a string");
    expect(payload.error.details).toContain("$.contacts[0].status must be a non-empty string");
    expect(state.sellers.size).toBe(0);
    expect(state.contacts.size).toBe(0);
  });

  it("rejects unexpected batch and record properties", async () => {
    const state = new MemoryD1State();
    const invalid = validBatch();
    (invalid as Record<string, unknown>).unexpected = "value";
    invalid.sellers[0].unexpected = "value";
    const request = await signedIngestionRequest(invalid, {
      idempotencyKey: `${runId}:schema-extra`,
      nonce: "nonce-schema-extra"
    });

    const response = await worker.fetch(request, ingestionEnv(state));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_schema");
    expect(payload.error.details).toContain("$.unexpected is not allowed");
    expect(payload.error.details).toContain("$.sellers[0].unexpected is not allowed");
    expect(state.sellers.size).toBe(0);
    expect(state.contacts.size).toBe(0);
  });

  it("rejects invalid signatures", async () => {
    const state = new MemoryD1State();
    const request = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:3`,
      nonce: "nonce-invalid-signature",
      signatureOverride: "00"
    });

    const response = await worker.fetch(request, ingestionEnv(state));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("invalid_signature");
    expect(state.nonces.size).toBe(0);
  });

  it("rejects replayed nonces", async () => {
    const state = new MemoryD1State();
    const env = ingestionEnv(state);
    const request = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:4`,
      nonce: "nonce-replay"
    });
    const replay = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:4`,
      nonce: "nonce-replay"
    });

    expect((await worker.fetch(request, env)).status).toBe(202);
    const response = await worker.fetch(replay, env);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("replayed_nonce");
  });

  it("rejects expired timestamps", async () => {
    const state = new MemoryD1State();
    const request = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:5`,
      nonce: "nonce-expired",
      timestamp: "2026-07-30T23:45:00.000Z"
    });

    const response = await worker.fetch(request, ingestionEnv(state));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("expired_timestamp");
    expect(state.nonces.size).toBe(0);
  });

  it("rejects oversized compressed bodies", async () => {
    const state = new MemoryD1State();
    const request = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:6`,
      nonce: "nonce-oversized"
    });

    const response = await worker.fetch(
      request,
      ingestionEnv(state, { MAX_COMPRESSED_BODY_BYTES: "8" })
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe("compressed_body_too_large");
    expect(state.nonces.size).toBe(0);
  });

  it("returns idempotent duplicates when the key is reused with a new nonce", async () => {
    const state = new MemoryD1State();
    const env = ingestionEnv(state);
    const first = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:7`,
      nonce: "nonce-idempotent-1"
    });
    const second = await signedIngestionRequest(validBatch(), {
      idempotencyKey: `${runId}:7`,
      nonce: "nonce-idempotent-2"
    });

    expect((await worker.fetch(first, env)).status).toBe(202);
    const response = await worker.fetch(second, env);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      accepted: true,
      duplicate: true,
      idempotency_key: `${runId}:7`
    });
  });
});

function ingestionEnv(state: MemoryD1State, overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  const db = new MemoryD1Database(state);
  return {
    APP_ENV: "local",
    INGESTION_HMAC_SECRET: secret,
    CORE_DB: db,
    CONTACTS_DB: db,
    OPS_DB: db,
    HISTORY_DB: db,
    INGESTION_ALLOWED_SOURCE_DOMAINS: "example.invalid",
    ...overrides
  };
}

function validBatch(): {
  schema_version: number;
  parser_version: string;
  crawl_run_id: string;
  batch_number: number;
  generated_at: string;
  sellers: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  sources: Record<string, unknown>[];
} {
  return {
    schema_version: 1,
    parser_version: "parser-1",
    crawl_run_id: runId,
    batch_number: 1,
    generated_at: nowIso,
    sellers: [
      {
        id: sellerId,
        canonical_name: "Acme Industrial",
        normalized_name: "acme industrial",
        schema_version: 1,
        parser_version: "parser-1",
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      }
    ],
    contacts: [
      {
        id: contactId,
        seller_id: sellerId,
        contact_type: "email",
        contact_value_ciphertext: "sealed-contact-value",
        normalized_hash: "contact-hash",
        display_value_masked: "sa***@example.invalid",
        classification: "business_generic",
        confidence: 90,
        source_id: sourceId,
        schema_version: 1,
        parser_version: "parser-1",
        first_seen_at: nowIso,
        last_seen_at: nowIso
      }
    ],
    sources: [
      {
        id: sourceId,
        seller_id: sellerId,
        source_url: "https://example.invalid/seller",
        canonical_url: "https://example.invalid/seller",
        source_domain: "example.invalid",
        source_type: "official_site",
        schema_version: 1,
        parser_version: "parser-1",
        first_seen_at: nowIso
      }
    ]
  };
}

async function signedIngestionRequest(
  payload: Record<string, unknown>,
  options: {
    idempotencyKey: string;
    nonce: string;
    timestamp?: string;
    signatureOverride?: string;
  }
): Promise<Request> {
  const timestamp = options.timestamp ?? nowIso;
  const body = gzipSync(JSON.stringify(payload));
  const bodyBytes = new Uint8Array(body);
  const bodyHash = await sha256Hex(bodyBytes);
  const signature =
    options.signatureOverride ??
    (await hmacSha256Hex(secret, `${timestamp}.${options.nonce}.${bodyHash}`));

  return new Request("http://local.test/v1/ingest/batch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      "idempotency-key": options.idempotencyKey,
      "x-si-timestamp": timestamp,
      "x-si-nonce": options.nonce,
      "x-si-signature": signature
    },
    body: toArrayBuffer(bodyBytes)
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
