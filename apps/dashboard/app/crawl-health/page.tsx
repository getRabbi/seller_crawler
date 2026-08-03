"use client";

import type { CrawlRunItem, ListResponse } from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";

export default function CrawlHealthPage() {
  const result = useApiResource<ListResponse<CrawlRunItem>>(
    `${workerApiPaths.crawlRuns}?limit=100`
  );

  return (
    <DashboardShell active="crawl-health" eyebrow="Crawl Runs" title="Runner Status">
      <TableShell title={`Crawl Runs (${result.data?.total ?? 0})`}>
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
                <th scope="col">Mode</th>
                <th scope="col">Status</th>
                <th scope="col">Requests</th>
                <th scope="col">Contacts</th>
                <th scope="col">Blocked</th>
                <th scope="col">Errors</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((run) => (
                <tr key={run.id}>
                  <td>{run.id.slice(0, 12)}</td>
                  <td>{run.jobType}</td>
                  <td><StatusPill value={run.status} /></td>
                  <td>{run.requestsTotal}</td>
                  <td>{run.contactsVerified}</td>
                  <td>{run.blockedCount}</td>
                  <td>{run.errorCount}</td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResourceState>
      </TableShell>
    </DashboardShell>
  );
}
