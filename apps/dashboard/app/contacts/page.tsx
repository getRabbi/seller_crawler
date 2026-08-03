import Link from "next/link";

import { DashboardShell } from "../../components/dashboard-shell";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { contacts, workerApiPaths } from "../../lib/dashboard-data";

export default function ContactsPage() {
  return (
    <DashboardShell active="contacts" eyebrow="Contacts" title="Contact Review">
      <form className="toolbar" aria-label="Contact filters">
        <label>
          Channel
          <select name="channel" defaultValue="all">
            <option value="all">All channels</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="wechat">WeChat</option>
          </select>
        </label>
        <label>
          Minimum confidence
          <input max="100" min="0" name="confidence" type="number" defaultValue="70" />
        </label>
        <label className="checkbox-row">
          <input name="acceptedOnly" type="checkbox" />
          Accepted only
        </label>
      </form>

      <TableShell title="Masked Contact Values" action={<span>{workerApiPaths.contacts}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Seller</th>
              <th scope="col">Type</th>
              <th scope="col">Masked value</th>
              <th scope="col">Classification</th>
              <th scope="col">Confidence</th>
              <th scope="col">Reveal audit</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <Link href={`/sellers/${contact.sellerId}`}>{contact.sellerName}</Link>
                  <small>{contact.sourceLabel}</small>
                </td>
                <td>{contact.contactType}</td>
                <td>{contact.displayValueMasked}</td>
                <td>
                  <StatusPill
                    value={
                      contact.classification === "business_verified" ? "accepted" : "pending"
                    }
                  />
                </td>
                <td>
                  <ScoreBar value={contact.confidence} />
                </td>
                <td>
                  <span className="audit-chip">{contact.revealAuditEvent.actor}</span>
                  <small>{contact.revealAuditEvent.createdAt}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
