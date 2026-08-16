"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type {
  ContactListItem,
  ContactRevealResponse,
  ListResponse
} from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceState } from "../../components/resource-state";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { workerApiPaths } from "../../lib/dashboard-data";
import { useApiResource } from "../../lib/use-api-resource";
import { postWorkerApi } from "../../lib/api";

export default function ContactsPage() {
  const [channel, setChannel] = useState("");
  const [confidence, setConfidence] = useState("70");
  const [query, setQuery] = useState("&minimum_confidence=70");
  const result = useApiResource<ListResponse<ContactListItem>>(
    `${workerApiPaths.contacts}?limit=100${query}`
  );
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealError, setRevealError] = useState("");

  async function reveal(contact: ContactListItem) {
    const reason = window.prompt("Reason for audited contact reveal:", "Operator contact review");
    if (!reason?.trim()) return;
    setRevealError("");
    try {
      const response = await postWorkerApi<ContactRevealResponse>(
        `/v1/contacts/${contact.id}/reveal`,
        { reason: reason.trim() }
      );
      setRevealed((current) => ({ ...current, [contact.id]: response.value }));
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : "Contact reveal failed.");
    }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ minimum_confidence: confidence || "0" });
    if (channel) params.set("contact_type", channel);
    setQuery(`&${params.toString()}`);
  }

  return (
    <DashboardShell active="contacts" eyebrow="Contacts" title="Contact Directory">
      <form className="toolbar" aria-label="Contact filters" onSubmit={applyFilters}>
        <label>
          Channel
          <select onChange={(event) => setChannel(event.target.value)} value={channel}>
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="wechat">WeChat</option>
          </select>
        </label>
        <label>
          Minimum confidence
          <input
            max="100"
            min="0"
            onChange={(event) => setConfidence(event.target.value)}
            type="number"
            value={confidence}
          />
        </label>
        <button type="submit">Filter</button>
      </form>
      {revealError ? <p role="alert">{revealError}</p> : null}

      <TableShell title={`Masked Contacts (${result.data?.total ?? 0})`}>
        <ResourceState
          resource={result}
          empty={!result.data?.items.length}
          emptyTitle="No Contacts Found"
          emptyDetail="No active, unsuppressed contacts match the current filters."
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Seller</th>
                <th scope="col">Type</th>
                <th scope="col">Masked value</th>
                <th scope="col">Classification</th>
                <th scope="col">Confidence</th>
                <th scope="col">Last verified</th>
                <th scope="col">Operator action</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <Link href={`/sellers/detail?id=${contact.sellerId}`}>
                      {contact.sellerName ?? contact.sellerId}
                    </Link>
                  </td>
                  <td>{contact.contactType}</td>
                  <td>{revealed[contact.id] ?? contact.displayValueMasked ?? "--"}</td>
                  <td><StatusPill value={contact.classification} /></td>
                  <td><ScoreBar value={contact.confidence} /></td>
                  <td>
                    {contact.lastVerifiedAt ? new Date(contact.lastVerifiedAt).toLocaleString() : "--"}
                  </td>
                  <td>
                    <button onClick={() => void reveal(contact)} type="button">
                      Reveal (audited)
                    </button>
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
