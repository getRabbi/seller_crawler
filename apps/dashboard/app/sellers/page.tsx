"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { ListResponse, SellerListItem } from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";

export default function SellersPage() {
  const [filters, setFilters] = useState<Record<string, string>>({ sort: "recently_updated" });
  const [query, setQuery] = useState("");
  const result = useApiResource<ListResponse<SellerListItem>>(
    `${workerApiPaths.search}?limit=100${query}`
  );

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search);
    if (initial.size > 0) {
      setFilters(Object.fromEntries(initial.entries()));
      setQuery(`&${initial.toString()}`);
    }
  }, []);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    setQuery(params.size ? `&${params.toString()}` : "");
  }

  function update(name: string, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function clear() {
    setFilters({ sort: "recently_updated" });
    setQuery("&sort=recently_updated");
  }

  return (
    <DashboardShell active="sellers" eyebrow="Sellers" title="Seller Directory">
      <form className="toolbar" aria-label="Seller filters" onSubmit={applyFilters}>
        <label>Search<input onChange={(event) => update("q", event.target.value)} placeholder="Company, domain, city" type="search" value={filters.q ?? ""} /></label>
        <label>Marketplace<select onChange={(event) => update("marketplace", event.target.value)} value={filters.marketplace ?? ""}><option value="">All</option>{["amazon.com","amazon.co.uk","amazon.ca","amazon.com.au","amazon.de","amazon.fr","amazon.it","amazon.es"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Country<select onChange={(event) => update("country", event.target.value)} value={filters.country ?? ""}><option value="">All</option>{["BD","CN","IN","VN","PK","US","GB","CA","AU","DE","FR","IT","ES"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<input onChange={(event) => update("category", event.target.value)} value={filters.category ?? ""} /></label>
        <label>Brand<input onChange={(event) => update("brand", event.target.value)} value={filters.brand ?? ""} /></label>
        <label>Source<select onChange={(event) => update("source", event.target.value)} value={filters.source ?? ""}><option value="">All</option><option value="amazon_seller">Amazon seller</option><option value="amazon_product">Amazon product</option><option value="official_site">Official website</option></select></label>
        <label>Amazon seller/store<input onChange={(event) => update("amazon_seller", event.target.value)} value={filters.amazon_seller ?? ""} /></label>
        <label>Website<select onChange={(event) => update("has_official_website", event.target.value)} value={filters.has_official_website ?? ""}><option value="">Any</option><option value="true">Has official website</option><option value="false">No official website</option></select></label>
        <label>Contact<select onChange={(event) => update("contact_type", event.target.value)} value={filters.contact_type ?? ""}><option value="">Any</option>{["email","phone","whatsapp","wechat"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Manufacturer score<input max="100" min="0" onChange={(event) => update("manufacturer_score", event.target.value)} type="number" value={filters.manufacturer_score ?? ""} /></label>
        <label>Trader score<input max="100" min="0" onChange={(event) => update("trader_score", event.target.value)} type="number" value={filters.trader_score ?? ""} /></label>
        <label>Duplicate<select onChange={(event) => update("duplicate_status", event.target.value)} value={filters.duplicate_status ?? ""}><option value="">Any</option><option value="pending">Pending</option><option value="decided">Decided</option><option value="rolled_back">Rolled back</option></select></label>
        <label>Updated since<input onChange={(event) => update("updated_since", event.target.value)} type="date" value={filters.updated_since ?? ""} /></label>
        <label>Sort<select onChange={(event) => update("sort", event.target.value)} value={filters.sort ?? "recently_updated"}><option value="newest">Newest</option><option value="recently_updated">Recently updated</option><option value="highest_confidence">Highest confidence</option><option value="most_contacts">Most contacts</option><option value="seller_name">Seller name</option></select></label>
        <button type="submit">Apply filters</button><button onClick={clear} type="button">Clear all</button>
      </form>

      <div className="filter-chips" aria-label="Active seller filters">{Array.from(new URLSearchParams(query.replace(/^&/, "")).entries()).map(([name, value]) => <span key={name}>{name}: {value}</span>)}</div>

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
                <th scope="col">Amazon</th>
                <th scope="col">Contacts</th>
                <th scope="col">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((seller) => (
                <tr key={seller.id}>
                  <td>
                    <Link href={`/sellers/detail?id=${seller.id}`}>{seller.canonicalName}</Link>
                    <small>{seller.officialDomain ?? "No official domain"}</small>
                    {!seller.officialDomain ? (
                      <small>
                        <a
                          href={googleOfficialWebsiteSearchUrl(seller)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Verify via Google
                        </a>
                      </small>
                    ) : null}
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
                  <td>{seller.marketplaceDisplayName ?? seller.marketplace ?? "--"}</td>
                  <td>{seller.contactCount ? `${seller.contactCount} (${seller.contactTypes.join(", ")})` : "--"}</td>
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

function googleOfficialWebsiteSearchUrl(seller: SellerListItem): string {
  const query = [
    `"${seller.canonicalName}"`,
    seller.marketplaceDisplayName,
    seller.countryCode,
    "official website"
  ].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
