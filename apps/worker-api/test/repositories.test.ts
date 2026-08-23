import { describe, expect, it } from "vitest";

import {
  CoreRepository,
  CrossDatabaseUnitOfWork,
  isUuidV7Compatible,
  type RepositorySet
} from "../src/repositories";
import type { D1Result } from "../src/repositories/d1";
import type { D1Database, D1PreparedStatement, D1Value } from "../src/repositories/d1";

const sellerId = "018f2d5e-7b3c-7a1d-8f2e-123456789abc";
const contactId = "018f2d5e-7b3c-7a1d-8f2e-123456789abd";
const sourceId = "018f2d5e-7b3c-7a1d-8f2e-123456789abe";
const historyId = "018f2d5e-7b3c-7a1d-8f2e-123456789abf";

const okResult: D1Result = { success: true };

describe("repository identifiers", () => {
  it("accepts UUIDv7-compatible text identifiers only", () => {
    expect(isUuidV7Compatible(sellerId)).toBe(true);
    expect(isUuidV7Compatible("018f2d5e-7b3c-6a1d-8f2e-123456789abc")).toBe(false);
    expect(isUuidV7Compatible("seller-1")).toBe(false);
  });
});

describe("CoreRepository seller enrichment", () => {
  it("preserves stronger existing identity fields while accepting a missing official domain", async () => {
    const db = new CapturingD1();
    await new CoreRepository(db).upsertSeller({
      id: sellerId,
      canonicalName: "Acme Industrial",
      normalizedName: "acme industrial",
      officialDomain: "acme.example",
      identityConfidence: 80,
      parserVersion: "official-site-v1",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z"
    });

    expect(db.query).toContain("COALESCE(excluded.legal_name, sellers.legal_name)");
    expect(db.query).toContain("MAX(sellers.identity_confidence, excluded.identity_confidence)");
    expect(db.query).toContain("sellers.official_domain IS NULL");
  });
});

class CapturingD1 implements D1Database {
  query = "";

  prepare(query: string): D1PreparedStatement {
    this.query = query;
    return {
      bind: (..._values: D1Value[]) => this.prepare(query),
      first: async <T>() => null as T | null,
      all: async <T>() => ({ success: true, results: [] as T[] }),
      run: async () => ({ success: true })
    };
  }
}

describe("CrossDatabaseUnitOfWork", () => {
  it("writes partitions in the documented order", async () => {
    const calls: string[] = [];
    const unitOfWork = new CrossDatabaseUnitOfWork(
      {
        core: {
          sellerExists: async () => {
            calls.push("core.exists");
            return true;
          },
          upsertSeller: async () => {
            calls.push("core.seller");
            return okResult;
          }
        },
        contacts: {
          upsertContact: async () => {
            calls.push("contacts.contact");
            return okResult;
          }
        },
        operations: {
          upsertSource: async () => {
            calls.push("operations.source");
            return okResult;
          }
        },
        history: {
          insertFieldHistory: async () => {
            calls.push("history.field");
            return okResult;
          }
        }
      } as unknown as RepositorySet
    );

    const result = await unitOfWork.commit({
      core: {
        sellers: [
          {
            id: sellerId,
            canonicalName: "Acme Industrial",
            normalizedName: "acme industrial",
            parserVersion: "parser-1",
            firstSeenAt: "2026-07-31T00:00:00Z",
            lastSeenAt: "2026-07-31T00:00:00Z",
            createdAt: "2026-07-31T00:00:00Z",
            updatedAt: "2026-07-31T00:00:00Z"
          }
        ]
      },
      contacts: {
        contacts: [
          {
            id: contactId,
            sellerId,
            contactType: "email",
            contactValueCiphertext: "ciphertext",
            normalizedHash: "hash",
            classification: "business_generic",
            confidence: 90,
            sourceId,
            parserVersion: "parser-1",
            firstSeenAt: "2026-07-31T00:00:00Z",
            lastSeenAt: "2026-07-31T00:00:00Z"
          }
        ]
      },
      operations: {
        sources: [
          {
            id: sourceId,
            sourceUrl: "https://example.invalid",
            canonicalUrl: "https://example.invalid/",
            sourceDomain: "example.invalid",
            sourceType: "official_site",
            parserVersion: "parser-1",
            firstSeenAt: "2026-07-31T00:00:00Z"
          }
        ]
      },
      history: {
        fieldHistory: [
          {
            id: historyId,
            entityType: "seller",
            entityId: sellerId,
            fieldName: "canonical_name",
            observedAt: "2026-07-31T00:00:00Z"
          }
        ]
      }
    });

    expect(result).toEqual({
      ok: true,
      completedStages: ["core", "contacts", "operations", "history"]
    });
    expect(calls).toEqual([
      "core.seller",
      "core.exists",
      "contacts.contact",
      "operations.source",
      "history.field"
    ]);
  });

  it("reports contact writes for unknown sellers as retryable failures", async () => {
    const unitOfWork = new CrossDatabaseUnitOfWork(
      {
        core: {
          sellerExists: async () => false
        },
        contacts: {},
        operations: {},
        history: {}
      } as unknown as RepositorySet
    );

    const result = await unitOfWork.commit({
      contacts: {
        contacts: [
          {
            id: contactId,
            sellerId,
            contactType: "email",
            contactValueCiphertext: "ciphertext",
            normalizedHash: "hash",
            classification: "business_generic",
            confidence: 90,
            sourceId,
            parserVersion: "parser-1",
            firstSeenAt: "2026-07-31T00:00:00Z",
            lastSeenAt: "2026-07-31T00:00:00Z"
          }
        ]
      }
    });

    expect(result).toMatchObject({
      ok: false,
      completedStages: ["core"],
      failedStage: "contacts",
      retryable: true
    });
  });
});
