import { describe, expect, it } from "vitest";

import { cooldownAuthorizationResponse } from "../src/cooldown/route";
import { hmacSha256Hex, sha256Hex } from "../src/ingestion/crypto";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value
} from "../src/repositories/d1";

const secret = "cooldown-test-secret";

class CooldownD1 implements D1Database {
  calls: Array<{ query: string; values: D1Value[] }> = [];
  constructor(
    private readonly blockedUntil: string | null,
    private readonly replayed = false
  ) {}
  prepare(query: string): D1PreparedStatement {
    return this.statement(query, []);
  }
  private statement(query: string, values: D1Value[]): D1PreparedStatement {
    const record = () => this.calls.push({ query, values });
    return {
      bind: (...bound: D1Value[]) => this.statement(query, bound),
      first: async <T>() => {
        record();
        if (query.includes("FROM ingestion_nonces")) {
          return (this.replayed ? ({ nonce: values[0] } as T) : null);
        }
        if (query.includes("FROM source_registry")) {
          return ({ blocked_until: this.blockedUntil } as T);
        }
        return null;
      },
      all: async <T>() => ({ success: true, results: [] as T[] }),
      run: async (): Promise<D1Result> => {
        record();
        return { success: true };
      }
    };
  }
}

describe("signed source cooldown authorization", () => {
  it("denies a new run until the persisted Retry-After cooldown expires", async () => {
    const db = new CooldownD1(new Date(Date.now() + 120_000).toISOString());
    const request = await signedRequest("example.test");

    const response = await cooldownAuthorizationResponse(request, {
      INGESTION_HMAC_SECRET: secret,
      OPS_DB: db
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.allowed).toBe(false);
    expect(payload.blocked_until).toBeTruthy();
    expect(db.calls.some((call) => call.query.includes("INSERT INTO ingestion_nonces"))).toBe(true);
    expect(db.calls.some((call) => call.values.includes("official_site:example.test"))).toBe(true);
  });

  it("fails closed for replayed nonces and missing crawler User-Agent", async () => {
    const replayed = await cooldownAuthorizationResponse(await signedRequest("example.test"), {
      INGESTION_HMAC_SECRET: secret,
      OPS_DB: new CooldownD1(null, true)
    });
    const requestWithoutAgent = await signedRequest("example.test");
    requestWithoutAgent.headers.delete("user-agent");
    const missingAgent = await cooldownAuthorizationResponse(requestWithoutAgent, {
      INGESTION_HMAC_SECRET: secret,
      OPS_DB: new CooldownD1(null)
    });

    expect(replayed.status).toBe(409);
    expect((await replayed.json()).error.code).toBe("replayed_nonce");
    expect(missingAgent.status).toBe(403);
    expect((await missingAgent.json()).error.code).toBe("crawler_user_agent_required");
  });

  it("authorizes Amazon against its marketplace cooldown key", async () => {
    const db = new CooldownD1(new Date(Date.now() + 120_000).toISOString());
    const response = await cooldownAuthorizationResponse(
      await signedRequest("amazon.com", "amazon"),
      { INGESTION_HMAC_SECRET: secret, OPS_DB: db }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).allowed).toBe(false);
    expect(db.calls.some((call) => call.values.includes("amazon:amazon.com"))).toBe(true);
  });
});

async function signedRequest(domain: string, adapter = "official_site"): Promise<Request> {
  const timestamp = new Date().toISOString();
  const nonce = "cooldown-deterministic-test-nonce";
  const emptyHash = await sha256Hex(new Uint8Array());
  const signature = await hmacSha256Hex(secret, `${timestamp}.${nonce}.${emptyHash}`);
  return new Request(
    `https://api.example.test/v1/crawl/authorize?adapter=${adapter}&domain=${domain}`,
    {
      headers: {
        "user-agent": "seller-intelligence-crawler/1.0",
        "x-si-timestamp": timestamp,
        "x-si-nonce": nonce,
        "x-si-signature": signature
      }
    }
  );
}
