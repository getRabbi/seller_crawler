import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWorkerApi, WorkerApiError, workerApiBaseUrl, workerApiUrl } from "../lib/api";
import { dashboardNav, workerApiPaths } from "../lib/dashboard-data";
import { runtimePanels } from "../lib/runtime";

describe("dashboard runtime configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows locked provider state", () => {
    expect(runtimePanels.map((panel) => panel.value)).toContain("development_locked");
    expect(runtimePanels.map((panel) => panel.value)).toContain("disabled");
    expect(runtimePanels.map((panel) => panel.value)).toContain("manual only");
  });

  it("contains only Solo v1 operational pages", () => {
    expect(dashboardNav.map((item) => item.href)).toEqual([
      "/",
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
      "/v1/export.csv"
    ]);
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
});
