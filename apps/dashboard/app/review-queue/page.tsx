"use client";

import Link from "next/link";
import type {
  DuplicateReviewItem,
  ListResponse
} from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";

export default function ReviewQueuePage() {
  const result = useApiResource<ListResponse<DuplicateReviewItem>>(
    `${workerApiPaths.duplicates}?limit=100&status=pending`
  );

  return (
    <DashboardShell active="review-queue" eyebrow="Duplicates" title="Duplicate Review">
      <TableShell title={`Pending Candidates (${result.data?.total ?? 0})`}>
        <ResourceState
          resource={result}
          empty={!result.data?.items.length}
          emptyTitle="No Pending Duplicates"
          emptyDetail="The duplicate review queue is empty."
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Potential match</th>
                <th scope="col">Score</th>
                <th scope="col">Signals</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((item) => (
                <tr key={item.id}>
                  <td><Link href={`/sellers/detail?id=${item.candidateSellerId}`}>{item.candidateName}</Link></td>
                  <td><Link href={`/sellers/detail?id=${item.matchedSellerId}`}>{item.matchedName}</Link></td>
                  <td><ScoreBar value={item.score} /></td>
                  <td>{formatSignals(item.scoreBreakdown)}</td>
                  <td><StatusPill value={item.status} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResourceState>
      </TableShell>
    </DashboardShell>
  );
}

function formatSignals(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "--";
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, score]) => `${key}: ${String(score)}`)
    .join(", ");
}
