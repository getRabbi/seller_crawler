import type { CrawlRunItem } from "@seller-intelligence/shared-types/dashboard";

export const CRAWL_POLL_INTERVAL_MS = 5_000;

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
  if (stage === "discovering" || status === "running") return 35;
  return 0;
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
