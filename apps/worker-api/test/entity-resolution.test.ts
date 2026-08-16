import { describe, expect, it } from "vitest";

import { applyDuplicateDecision } from "../src/entity-resolution/decisions";
import { prepareEntityResolution } from "../src/entity-resolution/service";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value
} from "../src/repositories/d1";
import type { UnitOfWorkChanges } from "../src/repositories/unit-of-work";
import type { RuntimeEnv } from "../src/validation/startup";

const candidateId = "018f2d5e-7b3c-7a1d-8f2e-123456789abc";
const matchedId = "018f2d5e-7b3c-7a1d-8f2e-123456789abd";
const contactId = "018f2d5e-7b3c-7a1d-8f2e-123456789abe";
const sourceId = "018f2d5e-7b3c-7a1d-8f2e-123456789abf";
const decisionId = "018f2d5e-7b3c-7a1d-8f2e-123456789aba";

type Resolver = (query: string, values: D1Value[]) => unknown[];

class FixtureD1 implements D1Database {
  calls: Array<{ query: string; values: D1Value[] }> = [];
  constructor(private readonly resolver: Resolver = () => []) {}
  prepare(query: string): D1PreparedStatement {
    let values: D1Value[] = [];
    return {
      bind: (...bound: D1Value[]) => {
        values = bound;
        return this.prepareBound(query, values);
      },
      first: async <T>() => (this.resolver(query, values)[0] as T | undefined) ?? null,
      all: async <T>() => ({ success: true, results: this.resolver(query, values) as T[] }),
      run: async () => ({ success: true })
    };
  }
  private prepareBound(query: string, values: D1Value[]): D1PreparedStatement {
    const record = () => this.calls.push({ query, values });
    return {
      bind: (...bound: D1Value[]) => this.prepareBound(query, bound),
      first: async <T>() => {
        record();
        return (this.resolver(query, values)[0] as T | undefined) ?? null;
      },
      all: async <T>() => {
        record();
        return { success: true, results: this.resolver(query, values) as T[] };
      },
      run: async (): Promise<D1Result> => {
        record();
        return { success: true };
      }
    };
  }
}

describe("ingestion entity resolution", () => {
  it("auto-merges deterministic exact domain/name matches and records rollback links", async () => {
    const core = new FixtureD1((query) =>
      query.includes("FROM sellers")
        ? [existingSeller("same.example", "same seller")]
        : []
    );
    const changes = incomingChanges("same.example", "same seller");

    await prepareEntityResolution(changes, env(core));

    expect(changes.core?.resolutionDecisions?.[0]).toMatchObject({
      candidateSellerId: candidateId,
      matchedSellerId: matchedId,
      action: "auto_merge",
      score: 92,
      status: "merged"
    });
    expect(changes.core?.sellers?.[0].status).toBe("merged");
    expect(changes.contacts?.contacts?.[0].sellerId).toBe(matchedId);
    expect(changes.operations?.sources?.[0].sellerId).toBe(matchedId);
    expect(changes.core?.mergeRedirects).toHaveLength(1);
    expect(changes.core?.mergeLinkAudits?.map((item) => item.tableName).sort()).toEqual([
      "contacts",
      "sources"
    ]);
  });

  it("persists a deterministic review decision for name and contact overlap", async () => {
    const core = new FixtureD1((query) =>
      query.includes("FROM sellers") ? [existingSeller(null, "same seller")] : []
    );
    const contacts = new FixtureD1((query) =>
      query.includes("normalized_hash") ? [{ normalized_hash: "same-contact-hash" }] : []
    );
    const changes = incomingChanges(null, "same seller");

    await prepareEntityResolution(changes, env(core, contacts));
    const firstId = changes.core?.resolutionDecisions?.[0].id;
    const replay = incomingChanges(null, "same seller");
    await prepareEntityResolution(replay, env(core, contacts));

    expect(changes.core?.resolutionDecisions?.[0]).toMatchObject({
      action: "review_queue",
      score: 75,
      status: "pending"
    });
    expect(changes.operations?.reviewQueueItems).toHaveLength(1);
    expect(replay.core?.resolutionDecisions?.[0].id).toBe(firstId);
  });
});

describe("duplicate operator decisions", () => {
  it.each([
    ["keep_separate", "kept_separate"],
    ["ignore", "ignored"]
  ] as const)("applies %s idempotently with an audit trail", async (action, status) => {
    const core = decisionCore("pending");
    const runtime = env(core);

    const result = await applyDuplicateDecision(runtime, decisionId, action, "operator@test", "reviewed");

    expect(result).toMatchObject({ action, status, duplicate: false });
    expect(core.calls.some((call) => call.query.includes("UPDATE entity_resolution_decisions"))).toBe(true);
    expect((runtime.CONTACTS_DB as FixtureD1).calls.some((call) => call.query.includes("INSERT INTO audit_events"))).toBe(true);
  });

  it("returns a duplicate receipt when the same operator decision is replayed", async () => {
    const runtime = env(decisionCore("ignored"));

    const result = await applyDuplicateDecision(
      runtime,
      decisionId,
      "ignore",
      "operator@test",
      "reviewed"
    );

    expect(result).toMatchObject({ action: "ignore", status: "ignored", duplicate: true });
    expect(
      (runtime.CONTACTS_DB as FixtureD1).calls.some((call) =>
        call.query.includes("INSERT INTO audit_events")
      )
    ).toBe(true);
  });

  it("merges linked rows and can roll back only the recorded rows", async () => {
    const mergeCore = decisionCore("pending");
    const runtime = env(
      mergeCore,
      new FixtureD1((query) => (query.includes("SELECT id FROM contacts") ? [{ id: contactId }] : []))
    );
    const contacts = runtime.CONTACTS_DB as FixtureD1;
    contacts.calls = [];

    const merged = await applyDuplicateDecision(runtime, decisionId, "merge", "operator@test", "same seller");

    expect(merged.status).toBe("merged");
    expect(mergeCore.calls.some((call) => call.query.includes("seller_merge_link_audit"))).toBe(true);
    expect(contacts.calls.some((call) => call.query.includes("UPDATE contacts SET seller_id"))).toBe(true);

    const rollbackCore = decisionCore("merged", true);
    const rollbackEnv = env(rollbackCore);
    const rolledBack = await applyDuplicateDecision(
      rollbackEnv,
      decisionId,
      "rollback",
      "operator@test",
      "undo mistaken merge"
    );

    expect(rolledBack.status).toBe("rolled_back");
    const rollbackContacts = rollbackEnv.CONTACTS_DB as FixtureD1;
    const restore = rollbackContacts.calls.find((call) =>
      call.query.includes("UPDATE contacts SET seller_id")
    );
    expect(restore?.values).toEqual([candidateId, contactId, matchedId]);
  });
});

function env(core = new FixtureD1(), contacts = new FixtureD1()): RuntimeEnv {
  return {
    APP_ENV: "local",
    CORE_DB: core,
    CONTACTS_DB: contacts,
    OPS_DB: new FixtureD1(),
    HISTORY_DB: new FixtureD1()
  };
}

function existingSeller(domain: string | null, normalizedName: string): Record<string, unknown> {
  return {
    id: matchedId,
    canonical_name: "Same Seller",
    normalized_name: normalizedName,
    legal_name: null,
    legal_name_local: null,
    country_code: null,
    province: null,
    city: null,
    official_domain: domain,
    status: "active",
    parser_version: "official-site-v1"
  };
}

function incomingChanges(domain: string | null, normalizedName: string): UnitOfWorkChanges {
  return {
    core: {
      sellers: [
        {
          id: candidateId,
          canonicalName: "Same Seller",
          normalizedName,
          officialDomain: domain,
          parserVersion: "official-site-v1",
          firstSeenAt: "2026-08-17T00:00:00Z",
          lastSeenAt: "2026-08-17T00:00:00Z",
          createdAt: "2026-08-17T00:00:00Z",
          updatedAt: "2026-08-17T00:00:00Z"
        }
      ]
    },
    contacts: {
      contacts: [
        {
          id: contactId,
          sellerId: candidateId,
          contactType: "email",
          contactValueCiphertext: "fixture-ciphertext",
          normalizedHash: "same-contact-hash",
          classification: "business_generic",
          confidence: 90,
          sourceId,
          parserVersion: "official-site-v1",
          firstSeenAt: "2026-08-17T00:00:00Z",
          lastSeenAt: "2026-08-17T00:00:00Z"
        }
      ]
    },
    operations: {
      sources: [
        {
          id: sourceId,
          sellerId: candidateId,
          sourceUrl: "https://same.example/",
          canonicalUrl: "https://same.example/",
          sourceDomain: "same.example",
          sourceType: "official_site",
          parserVersion: "official-site-v1",
          firstSeenAt: "2026-08-17T00:00:00Z"
        }
      ]
    }
  };
}

function decisionCore(status: string, withRollbackLink = false): FixtureD1 {
  return new FixtureD1((query) => {
    if (query.includes("FROM entity_resolution_decisions")) {
      return [
        {
          id: decisionId,
          candidate_seller_id: candidateId,
          matched_seller_id: matchedId,
          action: "review_queue",
          score: 75,
          status
        }
      ];
    }
    if (query.includes("FROM seller_merge_link_audit") && withRollbackLink) {
      return [
        {
          decision_id: decisionId,
          table_name: "contacts",
          row_id: contactId,
          original_seller_id: candidateId,
          target_seller_id: matchedId,
          rolled_back_at: null
        }
      ];
    }
    return [];
  });
}
