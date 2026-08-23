"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SellerDetailResponse } from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceState } from "../../../components/resource-state";
import { ScoreBar, StateBlock, StatusPill, TableShell } from "../../../components/status";
import { workerApiPaths } from "../../../lib/dashboard-data";
import { useApiResource } from "../../../lib/use-api-resource";

export default function SellerDetailPage() {
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);
  useEffect(() => {
    setSellerId(new URLSearchParams(window.location.search).get("id"));
    setQueryReady(true);
  }, []);
  const detail = useApiResource<SellerDetailResponse>(
    sellerId ? `${workerApiPaths.sellers}/${encodeURIComponent(sellerId)}` : null
  );

  return (
    <DashboardShell
      active="seller-detail"
      eyebrow="Seller Detail"
      title={detail.data?.seller.canonicalName ?? "Seller Detail"}
    >
      {!queryReady ? <StateBlock title="Loading" detail="Reading seller selection." /> : null}
      {queryReady && !sellerId ? (
        <StateBlock title="Seller Not Selected" detail="The seller identifier is missing." tone="warn" />
      ) : null}
      {sellerId ? (
        <ResourceState
          resource={detail}
          empty={!detail.data}
          emptyTitle="Seller Not Found"
          emptyDetail="The requested seller record is unavailable."
        >
          {detail.data ? <SellerDetail detail={detail.data} /> : null}
        </ResourceState>
      ) : null}
    </DashboardShell>
  );
}

function SellerDetail({ detail }: { detail: SellerDetailResponse }) {
  const { seller } = detail;
  return (
    <>
      <section className="detail-grid">
        <div className="detail-panel">
          <h2>Identity</h2>
          <dl className="definition-list">
            <div><dt>Legal name</dt><dd>{seller.legalName ?? "--"}</dd></div>
            <div><dt>Domain</dt><dd>{seller.officialDomain ?? "--"}</dd></div>
            <div><dt>Location</dt><dd>{[seller.city, seller.countryCode].filter(Boolean).join(", ") || "--"}</dd></div>
            <div><dt>Status</dt><dd><StatusPill value={seller.status} /></dd></div>
            <div><dt>Aliases</dt><dd>{detail.aliases.join(", ") || "--"}</dd></div>
          </dl>
          {!seller.officialDomain ? (
            <Link
              className="button-link"
              href={`/crawls/new?${new URLSearchParams({ mode: "known_websites", sellerId: seller.id, sellerName: seller.canonicalName }).toString()}`}
            >
              Crawl verified website
            </Link>
          ) : null}
        </div>
        <div className="detail-panel">
          <h2>Scores</h2>
          <dl className="definition-list">
            <div><dt>Identity</dt><dd><ScoreBar value={seller.identityConfidence} /></dd></div>
            <div><dt>Quality</dt><dd><ScoreBar value={seller.qualityScore} /></dd></div>
            <div><dt>Last seen</dt><dd>{new Date(seller.lastSeenAt).toLocaleString()}</dd></div>
          </dl>
        </div>
      </section>

      <TableShell title="Masked Contacts">
        {detail.contacts.length ? (
          <table>
            <thead><tr><th scope="col">Type</th><th scope="col">Masked value</th><th scope="col">Class</th><th scope="col">Confidence</th></tr></thead>
            <tbody>{detail.contacts.map((contact) => <tr key={contact.id}><td>{contact.contactType}</td><td>{contact.displayValueMasked ?? "--"}</td><td>{contact.classification}</td><td><ScoreBar value={contact.confidence} /></td></tr>)}</tbody>
          </table>
        ) : <StateBlock title="No Contacts" detail="No active, unsuppressed contacts are stored." />}
      </TableShell>

      <TableShell title="Compact Evidence">
        {detail.evidence.length ? (
          <table>
            <thead><tr><th scope="col">Page</th><th scope="col">Evidence</th><th scope="col">Hash</th><th scope="col">Last seen</th></tr></thead>
            <tbody>{detail.evidence.map((evidence) => <tr key={evidence.id}><td><a href={evidence.sourceUrl} rel="noreferrer" target="_blank">{evidence.pageTitle ?? evidence.canonicalUrl}</a></td><td>{evidence.evidenceSnippet ?? "--"}</td><td className="hash-cell">{evidence.contentHash ?? "--"}</td><td>{evidence.lastSeenAt ? new Date(evidence.lastSeenAt).toLocaleString() : "--"}</td></tr>)}</tbody>
          </table>
        ) : <StateBlock title="No Evidence" detail="No compact source evidence is stored." />}
      </TableShell>
    </>
  );
}
