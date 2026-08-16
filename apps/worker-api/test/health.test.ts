import { describe, expect, it } from "vitest";

import worker from "../src/index";
import { buildHealthPayload } from "../src/observability/health";
import { readRuntimeState, startupGateViolations } from "../src/validation/startup";

describe("Worker health", () => {
  it("returns 200 in the default locked configuration", async () => {
    const response = await worker.fetch(new Request("http://local.test/v1/health"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "ok",
      service: "seller-intelligence-worker",
      apiVersion: "v1",
      zeroChargeLock: "PAID SERVICES LOCKED",
      runtime: {
        runnerMode: "development_locked",
        liveCrawlEnabled: false,
        paidServicesAllowed: false,
        zyteApiEnabled: false,
        scrapyCloudDeployEnabled: false,
        githubActionsCrawlerEnabled: false,
        creditRunnerEnabled: false
      },
      bindings: {
        coreDb: false,
        contactsDb: false,
        operationsDb: false,
        historyDb: false,
        ingestionHmac: false,
        contactEncryption: false,
        access: false
      },
      violations: []
    });
  });

  it("fails closed when Zyte API is enabled in the zero-charge baseline", () => {
    const state = readRuntimeState({ ZYTE_API_ENABLED: "true" });

    expect(startupGateViolations(state)).toContain(
      "Zyte API must remain disabled with a zero request and spend budget."
    );
  });

  it("marks health blocked for invalid provider activation", () => {
    const payload = buildHealthPayload({
      RUNNER_MODE: "fallback_actions_burst",
      GITHUB_ACTIONS_CRAWLER_ENABLED: "true"
    });

    expect(payload.status).toBe("blocked");
    expect(payload.violations).toContain(
      "Actions burst requires confirmed included-minute availability."
    );
  });

  it("blocks staging health until D1, ingestion, and Access bindings are present", () => {
    const payload = buildHealthPayload({ APP_ENV: "staging" });

    expect(payload.status).toBe("blocked");
    expect(payload.violations[0]).toContain("Required deployment bindings are missing");
  });

  it("keeps Amazon disabled in Solo v1", () => {
    const state = readRuntimeState({ ENABLE_AMAZON: "true" });

    expect(startupGateViolations(state)).toContain(
      "Amazon is outside the Solo v1 scope and must remain disabled."
    );
  });
});
