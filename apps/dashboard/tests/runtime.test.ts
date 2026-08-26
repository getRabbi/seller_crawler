import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CrawlResults, CrawlRunMonitor } from "../components/crawl-run-monitor";
import { fetchWorkerApi, postWorkerApi, WorkerApiError, workerApiBaseUrl, workerApiUrl } from "../lib/api";
import { resultPageLimit, searchQueries, validateCrawlForm } from "../lib/crawl-form";
import {
  CRAWL_POLL_INTERVAL_MS,
  crawlElapsedLabel,
  crawlStageLabel,
  crawlStageProgress,
  isTerminalCrawlStatus,
  isValidCrawlRunId
} from "../lib/crawl-monitor";
import { dashboardNav, workerApiPaths } from "../lib/dashboard-data";
import { runtimePanels } from "../lib/runtime";

describe("dashboard runtime configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows the accepted operator runtime and billing lock", () => {
    expect(runtimePanels.map((panel) => panel.value)).toContain("Zyte Student — Active");
    expect(runtimePanels.map((panel) => panel.value)).toContain("Operator Controlled");
    expect(runtimePanels.map((panel) => panel.value)).toContain("Locked");
  });

  it("contains only Solo v1 operational pages", () => {
    expect(dashboardNav.map((item) => item.href)).toEqual([
      "/",
      "/crawls/new",
      "/sellers",
      "/contacts",
      "/review-queue",
      "/crawl-health",
      "/export"
    ]);
  });

  it("maps every dashboard request to a versioned Worker route", () => {
    expect(Object.values(workerApiPaths)).toEqual([
      "/v1/health",
      "/v1/sellers",
      "/v1/contacts",
      "/v1/duplicates",
      "/v1/crawl-runs",
      "/v1/search",
      "/v1/export.csv",
      "/v1/metrics"
    ]);
  });

  it("offers crawl runs as an authenticated CSV export dataset", () => {
    const source = readFileSync(new URL("../app/export/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('<option value="crawls">Crawl runs</option>');
    expect(source).toContain("Crawl runs include operational status");
  });

  it("offers a user-initiated Google verification link for unresolved seller domains", () => {
    const source = readFileSync(new URL("../app/sellers/page.tsx", import.meta.url), "utf8");

    expect(source).toContain("Verify via Google");
    expect(source).toContain("https://www.google.com/search?q=");
    expect(source).toContain('rel="noreferrer"');
    expect(source).toContain("Crawl verified website");
    expect(source).toContain("sellerId");
  });

  it("ships an operational New Crawl form with one seller target control and all modes", () => {
    const source = readFileSync(new URL("../app/crawls/new/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('mode === "find_sellers"');
    expect(source).toContain('"resolve_seller"');
    expect(source).toContain('"known_websites"');
    expect(source).toContain('text="Seller information target"');
    expect(source).toContain("SELLER_TARGET_OPTIONS.map");
    expect(source).toContain('<FieldLabel text="Keywords / product queries" />');
    expect(source).toContain('className="required-badge"');
    expect(source).not.toContain("Amazon result pages");
    expect(source).not.toContain("Official pages / seller");
    expect(source).not.toContain("Crawl depth");
    expect(source).toContain("OPEN API SIGN-IN CHECK");
    expect(source).toContain("START CRAWL");
    expect(source).toContain("Existing seller ID (optional)");
    expect(source).toContain("Resolve Existing Seller");
    expect(source).toContain('"contact_form"');
    expect(source).toContain("<CrawlRunMonitor");
    expect(source).toContain("rememberRunId(created.run.id)");
    expect(source).toContain('params.get("runId")');
    expect(source).toContain("Search already exists — skipped");
  });

  it("ships same-page live monitoring and terminal seller results", () => {
    const source = readFileSync(new URL("../components/crawl-run-monitor.tsx", import.meta.url), "utf8");

    expect(source).toContain("Live crawl progress");
    expect(source).toContain("Auto-refreshing every");
    expect(source).toContain("crawlElapsedLabel");
    expect(source).toContain("Latest activity");
    expect(source).toContain('data-testid="crawl-results-table"');
    expect(source).toContain("OPEN IN SELLER DIRECTORY");
    expect(source).toContain("Masked public contacts");
  });

  it("renders the active monitor and completed seller table", () => {
    vi.stubGlobal("React", React);
    const run = {
      id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      jobType: "amazon_identity_discovery",
      zyteJobId: "871778/1/1",
      startedAt: "2026-08-26T00:00:00.000Z",
      finishedAt: null,
      status: "running",
      stage: "discovering",
      requestsTotal: 20,
      responsesSuccess: 18,
      candidatesFound: 8,
      recordsCreated: 8,
      recordsUpdated: 0,
      contactsVerified: 0,
      blockedCount: 0,
      errorCount: 0,
      notes: null,
      requestedSellerCount: 100,
      discoveredSellers: 8,
      enrichedSellers: 0,
      contactsFound: 0,
      requestedAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:01:00.000Z"
    };
    const monitor = renderToStaticMarkup(React.createElement(CrawlRunMonitor, { runId: run.id, initialRun: run }));
    const seller = {
      id: "018f2d5e-7b3c-7a1d-8f2e-123456789abd",
      canonicalName: "Acme Bottles",
      legalName: "Acme Bottles Ltd",
      countryCode: "BD",
      province: "Dhaka",
      city: "Dhaka",
      officialDomain: "acme.example",
      identityConfidence: 96,
      qualityScore: 91,
      status: "active",
      firstSeenAt: "2026-08-26T00:00:00.000Z",
      lastSeenAt: "2026-08-26T01:00:00.000Z",
      updatedAt: "2026-08-26T01:00:00.000Z",
      marketplace: "amazon.com",
      marketplaceDisplayName: "Acme Store",
      marketplaceProfileUrl: null,
      manufacturerScore: 80,
      traderScore: 20,
      contactCount: 2,
      contactTypes: ["email", "contact_form"],
      duplicateStatus: null
    };
    const results = renderToStaticMarkup(React.createElement(CrawlResults, {
      run: { ...run, status: "completed", finishedAt: "2026-08-26T01:02:03.000Z" },
      sellers: [seller, { ...seller, marketplace: "amazon.co.uk" }]
    }));

    expect(monitor).toContain("Live crawl progress");
    expect(monitor).toContain("Discovering seller identities");
    expect(monitor).toContain("Sellers found");
    expect(results).toContain("Crawl results (1)");
    expect(results).toContain("Acme Bottles");
    expect(results).toContain("acme.example");
    expect(results).toContain("2 (email, contact form)");
  });

  it("classifies crawl stages, terminal states, and refresh-safe run IDs", () => {
    const run = {
      id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      jobType: "amazon_identity_discovery",
      zyteJobId: "871778/1/1",
      startedAt: "2026-08-26T00:00:00.000Z",
      finishedAt: null,
      status: "running",
      stage: "discovering",
      requestsTotal: 20,
      responsesSuccess: 18,
      candidatesFound: 8,
      recordsCreated: 8,
      recordsUpdated: 0,
      contactsVerified: 0,
      blockedCount: 0,
      errorCount: 0,
      notes: null
    };

    expect(CRAWL_POLL_INTERVAL_MS).toBe(5_000);
    expect(isTerminalCrawlStatus(run.status)).toBe(false);
    expect(crawlStageLabel(run)).toBe("Discovering seller identities");
    expect(crawlStageProgress(run)).toBe(35);
    expect(crawlStageLabel({ ...run, status: "running", stage: "resolving" })).toBe("Resolving official websites");
    expect(crawlStageProgress({ ...run, status: "enriching", stage: "enriching" })).toBe(80);
    expect(isTerminalCrawlStatus("completed_with_warnings")).toBe(true);
    expect(crawlStageProgress({ ...run, status: "completed", finishedAt: "2026-08-26T01:02:03.000Z" })).toBe(100);
    expect(isValidCrawlRunId(run.id)).toBe(true);
    expect(isValidCrawlRunId("not-a-run-id")).toBe(false);
  });

  it("shows elapsed run time live and freezes it at completion", () => {
    const run = {
      id: "018f2d5e-7b3c-7a1d-8f2e-123456789abc",
      jobType: "amazon_identity_discovery",
      zyteJobId: null,
      startedAt: "2026-08-26T00:00:00.000Z",
      finishedAt: null,
      status: "running",
      requestsTotal: 0,
      responsesSuccess: 0,
      candidatesFound: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      contactsVerified: 0,
      blockedCount: 0,
      errorCount: 0,
      notes: null
    };

    expect(crawlElapsedLabel(run, Date.parse("2026-08-26T00:02:09.000Z"))).toBe("2m 09s");
    expect(crawlElapsedLabel({ ...run, status: "completed", finishedAt: "2026-08-26T01:02:03.000Z" }, Date.parse("2026-08-27T00:00:00.000Z"))).toBe("1h 02m 03s");
  });

  it("validates mode-specific required crawl fields before submission", () => {
    const base = {
      mode: "find_sellers" as const,
      keywords: "",
      seedUrls: "",
      contacts: ["email"],
      target: "100"
    };

    expect(validateCrawlForm(base)).toContain("keyword or product query");
    expect(validateCrawlForm({ ...base, mode: "known_websites", keywords: "" })).toContain("HTTPS website URL");
    expect(validateCrawlForm({ ...base, mode: "resolve_seller" })).toContain("UUIDv7 ID");
    expect(validateCrawlForm({
      ...base,
      mode: "resolve_seller",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    })).toBeNull();
    expect(validateCrawlForm({ ...base, keywords: "bottle", contacts: [] })).toContain("contact priority");
    expect(validateCrawlForm({ ...base, keywords: "bottle", target: "50" })).toContain("100, 200, or 300");
    expect(validateCrawlForm({
      ...base,
      mode: "known_websites",
      seedUrls: "https://example.com/\nhttps://example.org/",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    })).toContain("exactly one website URL");
    expect(validateCrawlForm({ ...base, keywords: "bottle" })).toBeNull();
  });

  it("derives enough bounded Amazon result pages from the seller target", () => {
    expect(resultPageLimit(100, 1)).toBe(5);
    expect(resultPageLimit(200, 1)).toBe(9);
    expect(resultPageLimit(300, 1)).toBe(13);
    expect(resultPageLimit(300, 5)).toBe(3);
    expect(searchQueries(" Bottle  Rack\nbottle rack")).toEqual(["Bottle Rack"]);
    expect(resultPageLimit(300, searchQueries("Bottle Rack\nbottle rack").length)).toBe(13);
  });

  it("uses the configured public Worker origin without exposing secrets", () => {
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "https://api.example.invalid/");

    expect(workerApiBaseUrl()).toBe("https://api.example.invalid");
    expect(workerApiUrl("/v1/sellers")).toBe("https://api.example.invalid/v1/sellers");
    expect(() => workerApiUrl("v1/sellers")).toThrow("must start with '/'");
  });

  it("keeps the localhost fallback only for explicit local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "");

    expect(workerApiBaseUrl()).toBe("http://127.0.0.1:8787");
  });

  it("fails closed when a non-local build has no Worker origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "");

    expect(() => workerApiBaseUrl()).toThrow("required outside local development");
  });

  it("sends credentialed no-store requests to the Worker", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWorkerApi("/v1/sellers");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/sellers",
      expect.objectContaining({ credentials: "include", cache: "no-store", method: "GET" })
    );
  });

  it("classifies Cloudflare Access failures as locked", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "https://api.example.invalid");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "access_required", message: "Access required." } }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
      )
    );

    const error = await fetchWorkerApi("/v1/sellers").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorkerApiError);
    expect((error as WorkerApiError).locked).toBe(true);
    expect((error as WorkerApiError).code).toBe("access_required");
  });

  it("turns a browser fetch failure into an actionable API session error", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "https://api.example.invalid");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await postWorkerApi("/v1/crawl-runs", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorkerApiError);
    expect((error as WorkerApiError).code).toBe("worker_unreachable");
    expect((error as WorkerApiError).message).toContain("Open the API sign-in check");
  });

  it("treats a successful HTML Access page as a missing API login", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORKER_API_BASE_URL", "https://api.example.invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>Access login</html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    ));

    const error = await postWorkerApi("/v1/crawl-runs", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorkerApiError);
    expect((error as WorkerApiError).code).toBe("worker_login_required");
  });
});
