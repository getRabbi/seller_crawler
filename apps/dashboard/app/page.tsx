"use client";

import Link from "next/link";
import type {
  DuplicateReviewItem,
  ListResponse,
  SellerListItem
} from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../components/dashboard-shell";
import { ResourceState } from "../components/resource-state";
import { MetricGrid, ScoreBar, StatusPill, TableShell } from "../components/status";
import { workerApiPaths } from "../lib/dashboard-data";
import { useApiResource } from "../lib/use-api-resource";

interface HealthResponse {
  status: "ok" | "blocked";
  runtime: { liveCrawlEnabled: boolean; paidServicesAllowed: boolean };
}

export default function OverviewPage() {
  const sellers = useApiResource<ListResponse<SellerListItem>>(
    `${workerApiPaths.sellers}?limit=5`
  );
  const duplicates = useApiResource<ListResponse<DuplicateReviewItem>>(
    `${workerApiPaths.duplicates}?limit=5&status=pending`
  );
  const health = useApiResource<HealthResponse>(workerApiPaths.health);
  const metrics = [
    {
      label: "Sellers",
      value: sellers.data ? String(sellers.data.total) : "--",
      detail: "Canonical active records",
      tone: "good" as const
    },
    {
      label: "Duplicate review",
      value: duplicates.data ? String(duplicates.data.total) : "--",
      detail: "Pending entity decisions",
      tone: "warn" as const
    },
    {
      label: "Live crawl",
      value: health.data?.runtime.liveCrawlEnabled ? "Enabled" : "Disabled",
      detail: "Controlled operator gate",
      tone: health.data?.runtime.liveCrawlEnabled ? ("warn" as const) : ("neutral" as const)
    },
    {
      label: "Paid services",
      value: health.data?.runtime.paidServicesAllowed ? "Enabled" : "Locked",
      detail: "External spend control",
      tone: health.data?.runtime.paidServicesAllowed ? ("danger" as const) : ("good" as const)
    }
  ];

  return (
    <DashboardShell active="overview" eyebrow="Overview" title="Operations Overview">
      <MetricGrid metrics={metrics} />
      <section className="split-grid">
        <TableShell title="Recent Sellers">
          <ResourceState
            resource={sellers}
            empty={!sellers.data?.items.length}
            emptyTitle="No Sellers"
            emptyDetail="No canonical seller records are available."
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Seller</th>
                  <th scope="col">Domain</th>
                  <th scope="col">Identity</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sellers.data?.items.map((seller) => (
                  <tr key={seller.id}>
                    <td>
                      <Link href={`/sellers/detail?id=${seller.id}`}>{seller.canonicalName}</Link>
                      <small>{formatLocation(seller)}</small>
                    </td>
                    <td>{seller.officialDomain ?? "--"}</td>
                    <td>
                      <ScoreBar value={seller.identityConfidence} />
                    </td>
                    <td>
                      <StatusPill value={seller.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResourceState>
        </TableShell>

        <TableShell title="Duplicate Review">
          <ResourceState
            resource={duplicates}
            empty={!duplicates.data?.items.length}
            emptyTitle="No Pending Duplicates"
            emptyDetail="The duplicate review queue is empty."
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Match</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.data?.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.candidateName}</td>
                    <td>{item.matchedName}</td>
                    <td>
                      <ScoreBar value={item.score} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResourceState>
        </TableShell>
      </section>
    </DashboardShell>
  );
}

function formatLocation(seller: SellerListItem): string {
  return [seller.city, seller.countryCode].filter(Boolean).join(", ") || "Location unavailable";
}
