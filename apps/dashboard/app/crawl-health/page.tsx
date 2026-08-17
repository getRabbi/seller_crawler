"use client";

import type { CrawlRunActionResponse, CrawlRunItem, ListResponse } from "@seller-intelligence/shared-types/dashboard";
import Link from "next/link";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";
import { postWorkerApi } from "../../lib/api";

export default function CrawlHealthPage() {
  const result = useApiResource<ListResponse<CrawlRunItem>>(
    `${workerApiPaths.crawlRuns}?limit=100`
  );
  async function action(run: CrawlRunItem, type: "cancel" | "retry") {
    if (!window.confirm(`${type} run ${run.id}?`)) return;
    await postWorkerApi<CrawlRunActionResponse>(`/v1/crawl-runs/${run.id}/${type}`, {});
    result.retry();
  }

  return (
    <DashboardShell active="crawl-health" eyebrow="Crawl Runs" title="Runner Status">
      <TableShell action={<Link className="button-link" href="/crawls/new">New Crawl</Link>} title={`Crawl Runs (${result.data?.total ?? 0})`}>
        <ResourceState
          resource={result}
          empty={!result.data?.items.length}
          emptyTitle="No Crawl Runs"
          emptyDetail="No fixture, local, or Scrapy Cloud runs are recorded."
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Query / mode</th>
                <th scope="col">Market / country</th>
                <th scope="col">Status</th>
                <th scope="col">Requested</th>
                <th scope="col">Discovered / enriched</th>
                <th scope="col">Contacts</th>
                <th scope="col">Started</th>
                <th scope="col">Duration</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((run) => (
                <tr key={run.id}>
                  <td><Link href={`/crawl-health?run=${run.id}`}>{run.id.slice(0, 12)}</Link></td>
                  <td>{run.query?.join(", ") || run.jobType}</td>
                  <td>{[run.marketplace, run.countryCodes?.join(", ")].filter(Boolean).join(" / ") || "Direct"}</td>
                  <td><StatusPill value={run.status} /></td>
                  <td>{run.requestedSellerCount ?? "--"}</td>
                  <td>{run.discoveredSellers ?? 0} / {run.enrichedSellers ?? 0}</td>
                  <td>{run.contactsFound ?? run.contactsVerified}</td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{duration(run)}</td>
                  <td><div className="row-actions">{["queued","starting","running","enriching","ingesting"].includes(run.status) ? <button onClick={() => void action(run, "cancel")} type="button">Cancel</button> : null}{["failed","blocked","cooldown","cancelled"].includes(run.status) ? <button onClick={() => void action(run, "retry")} type="button">Retry</button> : null}<Link href={`/sellers?source_run=${run.id}`}>View results</Link></div>{run.errorMessage ? <small>{run.errorMessage}</small> : null}{run.warnings?.map((warning) => <small key={warning}>{warning}</small>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResourceState>
      </TableShell>
    </DashboardShell>
  );
}

function duration(run: CrawlRunItem): string {
  if (!run.finishedAt) return run.status === "queued" ? "--" : "Active";
  const seconds = Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
