import type { CrawlRunItem } from "@seller-intelligence/shared-types/dashboard";

export const CRAWL_POLL_INTERVAL_MS = 5_000;

export interface CrawlWarningMessage {
  code: string;
  title: string;
  detail: string;
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "completed_with_warnings",
  "failed",
  "blocked",
  "cooldown",
  "cancelled"
]);

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTerminalCrawlStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

export function isSuccessfulCrawlStatus(status: string): boolean {
  return status === "completed" || status === "completed_with_warnings";
}

export function isValidCrawlRunId(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

export function crawlStageLabel(run: CrawlRunItem): string {
  const status = run.status.toLowerCase();
  const stage = (run.stage ?? "").toLowerCase();
  if (status === "completed") return "Completed";
  if (status === "completed_with_warnings") return "Completed with warnings";
  if (status === "failed") return "Failed";
  if (status === "blocked") return "Stopped by source policy";
  if (status === "cooldown") return "Waiting for source cooldown";
  if (status === "cancelled") return "Cancelled";
  if (status === "queued") return "Waiting for the one-unit slot";
  if (status === "starting" || status === "launching") return "Starting Scrapy Cloud stage";
  if (status === "resolving" || stage === "resolving") return "Resolving official websites";
  if (status === "enriching" || stage === "enriching") return "Collecting public business contacts";
  if (status === "ingesting" || stage === "ingesting") return "Finalizing stored results";
  if (stage === "discovering") return "Discovering seller identities";
  if (status === "running") return "Crawling the approved source";
  return run.stage || run.status;
}

export function crawlStageProgress(run: CrawlRunItem): number {
  const status = run.status.toLowerCase();
  const stage = (run.stage ?? "").toLowerCase();
  if (isSuccessfulCrawlStatus(status)) return 100;
  if (status === "queued") return 5;
  if (status === "starting") return 10;
  if (status === "launching") return 15;
  if (status === "resolving" || stage === "resolving") return 60;
  if (status === "enriching" || stage === "enriching") return 80;
  if (status === "ingesting" || stage === "ingesting") return 92;
  if (status === "cooldown" || status === "blocked") return 35;
  if (stage === "discovering" || status === "running") return 35;
  return 0;
}

export function crawlWarningMessages(run: CrawlRunItem): CrawlWarningMessage[] {
  const codes = [...new Set(run.warnings ?? [])];
  const discoveryFailed = (run.discoveredSellers ?? run.candidatesFound) === 0
    && codes.includes("crawler_errors");
  return codes
    .filter((code) => !(discoveryFailed && code === "official_website_unavailable"))
    .map((code) => warningMessage(code, run, discoveryFailed));
}

export function crawlEmptyResultsMessage(run: CrawlRunItem): string {
  const warnings = new Set(run.warnings ?? []);
  if (warnings.has("amazon_temporarily_unavailable") || run.errorCode === "amazon_temporarily_unavailable") {
    return "Amazon was temporarily unavailable, so seller discovery did not complete. Wait until the displayed retry time, then retry this run.";
  }
  if (
    (run.discoveredSellers ?? run.candidatesFound) === 0
    && warnings.has("crawler_errors")
  ) {
    return "Seller discovery ended after source request errors, so this is not a confirmed zero-match result. Check source health before retrying.";
  }
  if (!isSuccessfulCrawlStatus(run.status)) {
    return "This run ended before it stored a seller result.";
  }
  return "The crawl completed but no seller matched the selected filters and source policies.";
}

export function crawlActivityMessage(
  run: CrawlRunItem,
  message: string | null,
  eventType: string
): string {
  const warnings = new Set(run.warnings ?? []);
  const historicalDiscoveryFailure = (
    (run.discoveredSellers ?? run.candidatesFound) === 0
    && warnings.has("crawler_errors")
    && message?.startsWith("Amazon discovery completed")
  );
  if (historicalDiscoveryFailure) {
    return "Seller discovery ended after source request errors; no official-site enrichment was attempted.";
  }
  return message || eventType.replaceAll("_", " ");
}

function warningMessage(
  code: string,
  run: CrawlRunItem,
  discoveryFailed: boolean
): CrawlWarningMessage {
  if (code === "amazon_temporarily_unavailable") {
    return {
      code,
      title: "Amazon temporarily unavailable",
      detail: run.errorMessage
        ?? "Amazon did not return a usable public page after one bounded retry. No bypass was attempted; retry after the source cooldown expires."
    };
  }
  if (code === "crawler_errors") {
    return {
      code,
      title: discoveryFailed ? "Seller discovery request failed" : "Some crawler requests failed",
      detail: discoveryFailed
        ? "No usable seller discovery response was stored. This is not a completed zero-match search; check source health before retrying."
        : "The run kept valid partial results, but one or more bounded source requests failed."
    };
  }
  if (code === "official_website_unavailable") {
    return {
      code,
      title: "Official website not available",
      detail: "Seller identities were stored, but no credible official website was available for enrichment."
    };
  }
  if (code === "official_domain_not_verified") {
    return {
      code,
      title: "Official domain not verified",
      detail: "Candidate websites were checked, but none passed the conservative identity threshold."
    };
  }
  if (code === "no_public_contacts_found") {
    return {
      code,
      title: "No public business contacts found",
      detail: "The verified official website was checked, but no supported public business contact was found."
    };
  }
  if (code === "source_blocked") {
    return {
      code,
      title: "Stopped by source policy",
      detail: "The source returned an explicit access challenge or policy block. No bypass or provider rotation was attempted."
    };
  }
  return {
    code,
    title: "Crawl warning",
    detail: code.replaceAll("_", " ")
  };
}

export function crawlElapsedLabel(run: CrawlRunItem, now = Date.now()): string {
  const start = Date.parse(run.requestedAt ?? run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const seconds = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.floor((end - start) / 1_000))
    : 0;
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}h ${minutes.toString().padStart(2, "0")}m ${remainder.toString().padStart(2, "0")}s`
    : `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}
