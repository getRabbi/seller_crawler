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

export interface ProviderLockState {
  runnerMode: RunnerMode;
  paidServicesAllowed: false;
  liveCrawlEnabled: false;
  zyteApiEnabled: false;
  scrapyCloudDeployEnabled: false;
  githubActionsCrawlerEnabled: false;
  creditRunnerEnabled: false;
}
