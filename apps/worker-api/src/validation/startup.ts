export type RunnerMode =
  | "development_locked"
  | "zyte_entitlement_pending"
  | "zyte_student_active"
  | "fallback_local"
  | "fallback_actions_burst"
  | "fallback_credit_container"
  | "paused_by_operator"
  | "paused_by_policy"
  | "paused_by_quota";

export interface RuntimeEnv {
  RUNNER_MODE?: string;
  LIVE_CRAWL_ENABLED?: string;
  PAID_SERVICES_ALLOWED?: string;
  MAX_EXTERNAL_MONTHLY_SPEND_AUD?: string;
  ALLOW_EXTRA_SCRAPY_UNITS?: string;
  ALLOW_PAID_GITHUB_ACTIONS_MINUTES?: string;
  ALLOW_PAID_ADDONS?: string;
  ZYTE_STUDENT_ENTITLEMENT_CONFIRMED?: string;
  SCRAPY_CLOUD_DEPLOY_ENABLED?: string;
  SCRAPY_CLOUD_MAX_UNITS?: string;
  ZYTE_API_ENABLED?: string;
  ZYTE_API_DAILY_REQUEST_BUDGET?: string;
  ZYTE_API_MONTHLY_BUDGET_USD?: string;
  GITHUB_ACTIONS_CRAWLER_ENABLED?: string;
  GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED?: string;
  CREDIT_RUNNER_ENABLED?: string;
  CREDIT_RUNNER_MONTHLY_CAP_AUD?: string;
  CREDIT_RUNNER_AUTO_SHUTDOWN?: string;
}

export interface RuntimeState {
  runnerMode: RunnerMode;
  liveCrawlEnabled: boolean;
  paidServicesAllowed: boolean;
  maxExternalMonthlySpendAud: number;
  allowExtraScrapyUnits: boolean;
  allowPaidGithubActionsMinutes: boolean;
  allowPaidAddons: boolean;
  zyteStudentEntitlementConfirmed: boolean;
  scrapyCloudDeployEnabled: boolean;
  scrapyCloudMaxUnits: number;
  zyteApiEnabled: boolean;
  zyteApiDailyRequestBudget: number;
  zyteApiMonthlyBudgetUsd: number;
  githubActionsCrawlerEnabled: boolean;
  githubActionsIncludedMinutesConfirmed: boolean;
  creditRunnerEnabled: boolean;
  creditRunnerMonthlyCapAud: number;
  creditRunnerAutoShutdown: boolean;
}

const runnerModes: ReadonlySet<string> = new Set([
  "development_locked",
  "zyte_entitlement_pending",
  "zyte_student_active",
  "fallback_local",
  "fallback_actions_burst",
  "fallback_credit_container",
  "paused_by_operator",
  "paused_by_policy",
  "paused_by_quota"
]);

function readBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function readRuntimeState(env: RuntimeEnv = {}): RuntimeState {
  const runnerMode = env.RUNNER_MODE ?? "development_locked";
  if (!runnerModes.has(runnerMode)) {
    throw new Error(`Unknown RUNNER_MODE: ${runnerMode}`);
  }

  return {
    runnerMode: runnerMode as RunnerMode,
    liveCrawlEnabled: readBool(env.LIVE_CRAWL_ENABLED, false),
    paidServicesAllowed: readBool(env.PAID_SERVICES_ALLOWED, false),
    maxExternalMonthlySpendAud: readNumber(env.MAX_EXTERNAL_MONTHLY_SPEND_AUD, 0),
    allowExtraScrapyUnits: readBool(env.ALLOW_EXTRA_SCRAPY_UNITS, false),
    allowPaidGithubActionsMinutes: readBool(env.ALLOW_PAID_GITHUB_ACTIONS_MINUTES, false),
    allowPaidAddons: readBool(env.ALLOW_PAID_ADDONS, false),
    zyteStudentEntitlementConfirmed: readBool(env.ZYTE_STUDENT_ENTITLEMENT_CONFIRMED, false),
    scrapyCloudDeployEnabled: readBool(env.SCRAPY_CLOUD_DEPLOY_ENABLED, false),
    scrapyCloudMaxUnits: readNumber(env.SCRAPY_CLOUD_MAX_UNITS, 1),
    zyteApiEnabled: readBool(env.ZYTE_API_ENABLED, false),
    zyteApiDailyRequestBudget: readNumber(env.ZYTE_API_DAILY_REQUEST_BUDGET, 0),
    zyteApiMonthlyBudgetUsd: readNumber(env.ZYTE_API_MONTHLY_BUDGET_USD, 0),
    githubActionsCrawlerEnabled: readBool(env.GITHUB_ACTIONS_CRAWLER_ENABLED, false),
    githubActionsIncludedMinutesConfirmed: readBool(
      env.GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED,
      false
    ),
    creditRunnerEnabled: readBool(env.CREDIT_RUNNER_ENABLED, false),
    creditRunnerMonthlyCapAud: readNumber(env.CREDIT_RUNNER_MONTHLY_CAP_AUD, 0),
    creditRunnerAutoShutdown: readBool(env.CREDIT_RUNNER_AUTO_SHUTDOWN, true)
  };
}

export function startupGateViolations(state: RuntimeState): string[] {
  const violations: string[] = [];

  if (!state.paidServicesAllowed) {
    if (state.maxExternalMonthlySpendAud !== 0) {
      violations.push("MAX_EXTERNAL_MONTHLY_SPEND_AUD must be 0 while paid services are locked.");
    }
    if (state.scrapyCloudMaxUnits > 1 || state.allowExtraScrapyUnits) {
      violations.push("Scrapy Cloud is limited to one unit in the zero-charge baseline.");
    }
    if (
      state.zyteApiEnabled ||
      state.zyteApiDailyRequestBudget !== 0 ||
      state.zyteApiMonthlyBudgetUsd !== 0
    ) {
      violations.push("Zyte API must remain disabled with a zero request and spend budget.");
    }
    if (state.allowPaidGithubActionsMinutes) {
      violations.push("Paid GitHub Actions minutes are not allowed.");
    }
    if (state.allowPaidAddons) {
      violations.push("Paid add-ons are not allowed.");
    }
    if (state.creditRunnerEnabled) {
      violations.push("Credit runner cannot run without explicit credit and overage guards.");
    }
  }

  if (state.runnerMode === "development_locked" && state.liveCrawlEnabled) {
    violations.push("Live crawling cannot be enabled while RUNNER_MODE is development_locked.");
  }

  if (state.runnerMode === "zyte_student_active") {
    if (!state.zyteStudentEntitlementConfirmed || !state.scrapyCloudDeployEnabled) {
      violations.push("Zyte runner requires entitlement confirmation and deploy enablement.");
    }
    if (state.scrapyCloudMaxUnits !== 1) {
      violations.push("Zyte runner must use exactly one Scrapy Cloud unit.");
    }
  }

  if (
    state.runnerMode === "fallback_actions_burst" &&
    !state.githubActionsIncludedMinutesConfirmed
  ) {
    violations.push("Actions burst requires confirmed included-minute availability.");
  }

  return violations;
}
