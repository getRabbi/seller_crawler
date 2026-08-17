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
    operatorCrawlEnabled: boolean;
    amazonEnabled: boolean;
    discoveryEnabled: boolean;
    officialWebsiteEnabled: boolean;
    globalCrawlKillSwitch: boolean;
    scrapyCloudMaxUnits: number;
  };
  bindings: {
    coreDb: boolean;
    contactsDb: boolean;
    operationsDb: boolean;
    historyDb: boolean;
    ingestionHmac: boolean;
    contactEncryption: boolean;
    access: boolean;
    scrapyCloudControl: boolean;
  };
  violations: string[];
}

export function buildHealthPayload(env: RuntimeEnv = {}): HealthPayload {
  const runtime = readRuntimeState(env);
  const violations = startupGateViolations(runtime);
  const bindings = {
    coreDb: env.CORE_DB !== undefined,
    contactsDb: env.CONTACTS_DB !== undefined,
    operationsDb: env.OPS_DB !== undefined,
    historyDb: env.HISTORY_DB !== undefined,
    ingestionHmac: Boolean(env.INGESTION_HMAC_SECRET),
    contactEncryption: Boolean(
      env.CONTACT_ENCRYPTION_KEYS && env.CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION
    ),
    access: Boolean(
      env.ACCESS_ALLOWED_EMAIL &&
        env.ACCESS_AUTH_REQUIRED === "true" &&
        env.TEAM_DOMAIN &&
        env.POLICY_AUD
    ),
    scrapyCloudControl: !runtime.operatorCrawlEnabled || Boolean(
      env.SCRAPY_CLOUD_API_KEY && env.SCRAPY_CLOUD_PROJECT_ID &&
      env.SOURCE_COOLDOWN_CHECK_URL && env.INGESTION_ENDPOINT_URL
    )
  };

  if ((env.APP_ENV ?? "local") !== "local") {
    const missingBindings = Object.entries(bindings)
      .filter(([, configured]) => !configured)
      .map(([name]) => name);
    if (missingBindings.length > 0) {
      violations.push(`Required deployment bindings are missing: ${missingBindings.join(", ")}.`);
    }
  }

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
      creditRunnerEnabled: runtime.creditRunnerEnabled,
      operatorCrawlEnabled: runtime.operatorCrawlEnabled,
      amazonEnabled: runtime.amazonEnabled,
      discoveryEnabled: runtime.amazonEnabled,
      officialWebsiteEnabled: runtime.officialWebsiteEnabled,
      globalCrawlKillSwitch: runtime.globalCrawlKillSwitch,
      scrapyCloudMaxUnits: runtime.scrapyCloudMaxUnits
    },
    bindings,
    violations
  };
}
