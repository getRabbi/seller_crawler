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
import { postWorkerApi } from "../../lib/api";
import { useState } from "react";
import type { DuplicateDecisionAction } from "@seller-intelligence/shared-types/dashboard";

export default function ReviewQueuePage() {
  const [decisionError, setDecisionError] = useState("");
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const result = useApiResource<ListResponse<DuplicateReviewItem>>(
    `${workerApiPaths.duplicates}?limit=100&status=pending`
  );

  async function decide(id: string, action: DuplicateDecisionAction) {
    const reason = window.prompt(`Reason for ${action.replace("_", " ")}:`, "Solo operator review");
    if (!reason?.trim()) return;
    setDecisionError("");
    try {
      const response = await postWorkerApi<{ status: string }>(`/v1/duplicates/${id}/decision`, {
        action,
        reason: reason.trim()
      });
      setResolved((current) => ({ ...current, [id]: response.status }));
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Duplicate decision failed.");
    }
  }

  return (
    <DashboardShell active="review-queue" eyebrow="Duplicates" title="Duplicate Review">
      {decisionError ? <p role="alert">{decisionError}</p> : null}
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
                <th scope="col">Operator action</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((item) => (
                <tr key={item.id}>
                  <td><Link href={`/sellers/detail?id=${item.candidateSellerId}`}>{item.candidateName}</Link></td>
                  <td><Link href={`/sellers/detail?id=${item.matchedSellerId}`}>{item.matchedName}</Link></td>
                  <td><ScoreBar value={item.score} /></td>
                  <td>{formatSignals(item.scoreBreakdown)}</td>
                  <td><StatusPill value={resolved[item.id] ?? item.status} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <button onClick={() => void decide(item.id, "merge")} type="button">Merge</button>{" "}
                    <button onClick={() => void decide(item.id, "keep_separate")} type="button">Keep separate</button>{" "}
                    <button onClick={() => void decide(item.id, "ignore")} type="button">Ignore</button>
                  </td>
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
  if (Array.isArray(value)) {
    return value
      .slice(0, 4)
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const component = item as Record<string, unknown>;
        return `${String(component.rule_code ?? "signal")}: ${String(component.points ?? "")}`;
      })
      .filter(Boolean)
      .join(", ");
  }
  if (!value || typeof value !== "object") return "--";
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, score]) => `${key}: ${String(score)}`)
    .join(", ");
}
