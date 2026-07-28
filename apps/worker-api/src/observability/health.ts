import { readRuntimeState, startupGateViolations, type RuntimeEnv } from "../validation/startup";

export interface HealthPayload {
  status: "ok" | "blocked";
  service: "seller-intelligence-worker";
  apiVersion: "v1";
  zeroChargeLock: "PAID SERVICES LOCKED";
  runtime: {
    runnerMode: string;
    liveCrawlEnabled: boolean;
    paidServicesAllowed: boolean;
    zyteApiEnabled: boolean;
    scrapyCloudDeployEnabled: boolean;
    githubActionsCrawlerEnabled: boolean;
    creditRunnerEnabled: boolean;
  };
  violations: string[];
}

export function buildHealthPayload(env: RuntimeEnv = {}): HealthPayload {
  const runtime = readRuntimeState(env);
  const violations = startupGateViolations(runtime);

  return {
    status: violations.length === 0 ? "ok" : "blocked",
    service: "seller-intelligence-worker",
    apiVersion: "v1",
    zeroChargeLock: "PAID SERVICES LOCKED",
    runtime: {
      runnerMode: runtime.runnerMode,
      liveCrawlEnabled: runtime.liveCrawlEnabled,
      paidServicesAllowed: runtime.paidServicesAllowed,
      zyteApiEnabled: runtime.zyteApiEnabled,
      scrapyCloudDeployEnabled: runtime.scrapyCloudDeployEnabled,
      githubActionsCrawlerEnabled: runtime.githubActionsCrawlerEnabled,
      creditRunnerEnabled: runtime.creditRunnerEnabled
    },
    violations
  };
}
