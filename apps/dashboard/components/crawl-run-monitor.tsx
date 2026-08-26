"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  CrawlRunDetailResponse,
  CrawlRunItem,
  SellerListItem
} from "@seller-intelligence/shared-types/dashboard";

import {
  CRAWL_POLL_INTERVAL_MS,
  crawlActivityMessage,
  crawlEmptyResultsMessage,
  crawlElapsedLabel,
  crawlStageLabel,
  crawlStageProgress,
  crawlWarningMessages,
  isSuccessfulCrawlStatus,
  isTerminalCrawlStatus
} from "../lib/crawl-monitor";
import { fetchWorkerApi, WorkerApiError, workerApiUrl } from "../lib/api";
import { ScoreBar, StateBlock, StatusPill, TableShell } from "./status";

interface CrawlRunMonitorProps {
  runId: string;
  initialRun?: CrawlRunItem | null;
}

export function CrawlRunMonitor({ runId, initialRun = null }: CrawlRunMonitorProps) {
  const [detail, setDetail] = useState<CrawlRunDetailResponse | null>(
    initialRun ? { run: initialRun, sellers: [], events: [] } : null
  );
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<WorkerApiError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function poll() {
      controller = new AbortController();
      try {
        const next = await fetchWorkerApi<CrawlRunDetailResponse>(
          `/v1/crawl-runs/${runId}`,
          controller.signal
        );
        if (stopped) return;
        setDetail(next);
        setHasFetched(true);
        setError(null);
        if (!isTerminalCrawlStatus(next.run.status)) {
          timer = setTimeout(() => void poll(), CRAWL_POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (stopped || controller.signal.aborted) return;
        setError(
          caught instanceof WorkerApiError
            ? caught
            : new WorkerApiError("Run progress could not be refreshed.", 0, "crawl_monitor_failed")
        );
      } finally {
        if (!stopped) setLoading(false);
      }
    }

    void poll();
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refreshKey, runId]);

  const run = detail?.run ?? initialRun;
  const terminal = run ? isTerminalCrawlStatus(run.status) : false;

  useEffect(() => {
    if (!run || terminal) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [run, terminal]);

  function refreshNow() {
    setLoading(true);
    setError(null);
    setRefreshKey((value) => value + 1);
  }

  if (!run) {
    return error ? (
      <MonitorError error={error} onRetry={refreshNow} />
    ) : (
      <StateBlock title="Loading crawl progress" detail="Reading the latest run state and results." />
    );
  }

  const successful = isSuccessfulCrawlStatus(run.status);
  const found = run.discoveredSellers ?? run.candidatesFound;
  const enriched = run.enrichedSellers ?? run.recordsUpdated;
  const contacts = run.contactsFound ?? run.contactsVerified;
  const stageProgress = crawlStageProgress(run);
  const latestEvents = (detail?.events ?? []).slice(-5).reverse();
  const showResults = terminal && hasFetched && !error;
  const warningMessages = crawlWarningMessages(run);
  const cooldownWarning = run.errorCode === "amazon_temporarily_unavailable";
  const monitorTone = successful && warningMessages.length === 0
    ? "good"
    : run.status === "cooldown"
      ? "warn"
      : terminal
        ? "danger"
        : "warn";

  return (
    <>
      <section className={`crawl-monitor tone-${monitorTone}`} data-testid="crawl-run-monitor" id="crawl-run-progress">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Run {run.id}</p>
            <h2>Live crawl progress</h2>
          </div>
          <StatusPill value={run.status} />
        </div>

        <div aria-live="polite" className="crawl-stage-row" role="status">
          <div>
            <strong>{crawlStageLabel(run)}</strong>
            <small>{terminal ? "Final state recorded" : `Auto-refreshing every ${CRAWL_POLL_INTERVAL_MS / 1_000} seconds`}{run.updatedAt ? ` · Updated ${formatTimestamp(run.updatedAt)}` : ""}</small>
          </div>
          <span>{stageProgress}% workflow stage</span>
        </div>
        <progress aria-label="Crawl workflow stage" max="100" value={stageProgress} />

        <div className="crawl-metric-grid">
          <MonitorMetric label="Elapsed" value={crawlElapsedLabel(run, now)} detail={terminal ? "Total run time" : "Still running"} />
          <MonitorMetric label="Sellers found" value={String(found)} detail={`Target: ${run.requestedSellerCount ?? "--"}`} />
          <MonitorMetric label="Enriched" value={String(enriched)} detail="Official-site records" />
          <MonitorMetric label="Contacts" value={String(contacts)} detail="Masked public contacts" />
          <MonitorMetric label="Responses" value={`${run.responsesSuccess}/${run.requestsTotal}`} detail={`${run.blockedCount} blocked · ${run.errorCount} errors`} />
        </div>

        <div className="crawl-monitor-actions">
          <button disabled={loading} onClick={refreshNow} type="button">{loading ? "REFRESHING..." : "REFRESH NOW"}</button>
          <Link href="/crawl-health">VIEW ALL CRAWL RUNS</Link>
          {!terminal ? <span>You can leave or refresh this page; this run link will resume monitoring.</span> : null}
        </div>

        {error ? <MonitorError error={error} onRetry={refreshNow} /> : null}
        {run.errorMessage && !cooldownWarning ? <StateBlock title={run.errorCode ?? "Crawl error"} detail={run.errorMessage} tone="danger" /> : null}
        {warningMessages.map((warning) => (
          <StateBlock detail={warning.detail} key={warning.code} title={warning.title} tone="warn" />
        ))}

        {latestEvents.length ? (
          <div className="crawl-events">
            <h3>Latest activity</h3>
            <ol>
              {latestEvents.map((event) => (
                <li key={event.id}>
                  <span>{crawlActivityMessage(run, event.message, event.eventType)}</span>
                  <time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {terminal && !hasFetched && !error ? (
        <StateBlock title="Loading crawl results" detail="The run ended; loading its final seller snapshot." />
      ) : null}
      {showResults ? <CrawlResults run={run} sellers={detail?.sellers ?? []} /> : null}
    </>
  );
}

function MonitorMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function MonitorError({ error, onRetry }: { error: WorkerApiError; onRetry: () => void }) {
  const showSignIn = error.locked || ["worker_unreachable", "worker_login_required"].includes(error.code);
  return (
    <StateBlock
      action={
        <div className="button-row">
          <button onClick={onRetry} type="button">RETRY STATUS</button>
          {showSignIn ? <a className="button-link" href={workerApiUrl("/v1/health")} rel="noreferrer" target="_blank">OPEN API SIGN-IN CHECK</a> : null}
        </div>
      }
      detail={error.message}
      title="Crawl status unavailable"
      tone="danger"
    />
  );
}

export function CrawlResults({ run, sellers }: { run: CrawlRunItem; sellers: SellerListItem[] }) {
  const partial = !isSuccessfulCrawlStatus(run.status)
    || (run.warnings ?? []).some((warning) => [
      "crawler_errors",
      "amazon_temporarily_unavailable",
      "source_blocked"
    ].includes(warning));
  const rows = uniqueSellers(sellers);
  return (
    <TableShell
      action={<Link className="button-link" href={`/sellers?source_run=${run.id}`}>OPEN IN SELLER DIRECTORY</Link>}
      title={`${partial ? "Partial results" : "Crawl results"} (${rows.length})`}
    >
      {rows.length ? (
        <table data-testid="crawl-results-table">
          <thead>
            <tr>
              <th scope="col">Seller</th>
              <th scope="col">Location</th>
              <th scope="col">Official website</th>
              <th scope="col">Marketplace</th>
              <th scope="col">Contacts</th>
              <th scope="col">Quality</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((seller) => (
              <tr key={seller.id}>
                <td><Link href={`/sellers/detail?id=${seller.id}`}>{seller.canonicalName}</Link><small>{seller.legalName}</small></td>
                <td>{[seller.city, seller.province, seller.countryCode].filter(Boolean).join(", ") || "--"}</td>
                <td>{seller.officialDomain ? <a href={`https://${seller.officialDomain}`} rel="noreferrer" target="_blank">{seller.officialDomain}</a> : "Not verified"}</td>
                <td>{seller.marketplaceDisplayName ?? seller.marketplace ?? "--"}</td>
                <td>{seller.contactCount ? `${seller.contactCount} (${seller.contactTypes.map(contactLabel).join(", ")})` : "--"}</td>
                <td><ScoreBar value={seller.qualityScore} /></td>
                <td><StatusPill value={seller.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <StateBlock
          title="No seller results"
          detail={crawlEmptyResultsMessage(run)}
          tone={partial ? "warn" : "neutral"}
        />
      )}
    </TableShell>
  );
}

function contactLabel(value: string): string {
  return value === "contact_form" ? "contact form" : value;
}

function uniqueSellers(sellers: SellerListItem[]): SellerListItem[] {
  const seen = new Set<string>();
  return sellers.filter((seller) => {
    if (seen.has(seller.id)) return false;
    seen.add(seller.id);
    return true;
  });
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "--";
}
