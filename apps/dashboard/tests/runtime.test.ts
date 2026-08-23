import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { fetchWorkerApi, postWorkerApi, WorkerApiError, workerApiBaseUrl, workerApiUrl } from "../lib/api";
import { validateCrawlForm } from "../lib/crawl-form";
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

  it("ships an operational New Crawl form with bounded custom targets and both modes", () => {
    const source = readFileSync(new URL("../app/crawls/new/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('mode === "find_sellers"');
    expect(source).toContain('"known_websites"');
    expect(source).toContain('list="target-seller-counts"');
    expect(source).toContain('max="100"');
    expect(source).toContain('min="1"');
    expect(source).toContain('<FieldLabel text="Keywords / product queries" />');
    expect(source).toContain('className="required-badge"');
    expect(source).toContain('required type="number"');
    expect(source).toContain("OPEN API SIGN-IN CHECK");
    expect(source).toContain("START CRAWL");
    expect(source).toContain("Existing seller ID (optional)");
    expect(source).toContain("Maximum 100 official pages across the whole run.");
  });

  it("validates mode-specific required crawl fields before submission", () => {
    const base = {
      mode: "find_sellers" as const,
      keywords: "",
      seedUrls: "",
      contacts: ["email"],
      target: "10",
      maxResultPages: "1",
      maxOfficialPages: "6",
      depth: "2"
    };

    expect(validateCrawlForm(base)).toContain("keyword or product query");
    expect(validateCrawlForm({ ...base, mode: "known_websites", keywords: "" })).toContain("HTTPS website URL");
    expect(validateCrawlForm({ ...base, keywords: "bottle", contacts: [] })).toContain("contact priority");
    expect(validateCrawlForm({ ...base, keywords: "bottle", target: "101" })).toContain("1 to 100");
    expect(validateCrawlForm({ ...base, keywords: "bottle", target: "20", maxOfficialPages: "6" })).toContain("100 pages");
    expect(validateCrawlForm({
      ...base,
      mode: "known_websites",
      seedUrls: "https://example.com/\nhttps://example.org/",
      targetSellerId: "018f2d5e-7b3c-7a1d-8f2e-123456789abc"
    })).toContain("exactly one website URL");
    expect(validateCrawlForm({ ...base, keywords: "bottle" })).toBeNull();
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
