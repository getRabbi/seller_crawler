"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ListResponse, SellerListItem } from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";

export default function SellersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [query, setQuery] = useState("");
  const result = useApiResource<ListResponse<SellerListItem>>(
    `${workerApiPaths.search}?limit=100${query}`
  );

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    if (statusInput) params.set("status", statusInput);
    setQuery(params.size ? `&${params.toString()}` : "");
  }

  return (
    <DashboardShell active="sellers" eyebrow="Sellers" title="Seller Directory">
      <form className="toolbar" aria-label="Seller filters" onSubmit={applyFilters}>
        <label>
          Search
          <input
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Company, domain, city"
            type="search"
            value={searchInput}
          />
        </label>
        <label>
          Status
          <select onChange={(event) => setStatusInput(event.target.value)} value={statusInput}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="review">Review</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>

      <TableShell title={`Canonical Sellers (${result.data?.total ?? 0})`}>
        <ResourceState
          resource={result}
          empty={!result.data?.items.length}
          emptyTitle="No Sellers Found"
          emptyDetail="No seller records match the current filters."
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Seller</th>
                <th scope="col">Location</th>
                <th scope="col">Identity</th>
                <th scope="col">Quality</th>
                <th scope="col">Status</th>
                <th scope="col">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((seller) => (
                <tr key={seller.id}>
                  <td>
                    <Link href={`/sellers/detail?id=${seller.id}`}>{seller.canonicalName}</Link>
                    <small>{seller.officialDomain ?? "No official domain"}</small>
                  </td>
                  <td>{[seller.city, seller.countryCode].filter(Boolean).join(", ") || "--"}</td>
                  <td>
                    <ScoreBar value={seller.identityConfidence} />
                  </td>
                  <td>
                    <ScoreBar value={seller.qualityScore} />
                  </td>
                  <td>
                    <StatusPill value={seller.status} />
                  </td>
                  <td>{formatTimestamp(seller.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResourceState>
      </TableShell>
    </DashboardShell>
  );
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}
