import { notFound } from "next/navigation";

import { DashboardShell } from "../../../components/dashboard-shell";
import { ScoreBar, StatusPill, TableShell } from "../../../components/status";
import { contactsForSeller, sellerById, sellers } from "../../../lib/dashboard-data";

interface SellerDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export function generateStaticParams() {
  return sellers.map((seller) => ({ id: seller.id }));
}

export default async function SellerDetailPage({ params }: SellerDetailPageProps) {
  const { id } = await params;
  const seller = sellerById(id);

  if (!seller) {
    notFound();
  }

  const sellerContacts = contactsForSeller(seller.id);

  return (
    <DashboardShell active="seller-detail" eyebrow="Seller Detail" title={seller.canonicalName}>
      <section className="detail-grid">
        <div className="detail-panel">
          <h2>Identity</h2>
          <dl className="definition-list">
            <div>
              <dt>Domain</dt>
              <dd>{seller.domain}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {seller.city}, {seller.countryCode}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusPill value={seller.status} />
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{seller.updatedAt}</dd>
            </div>
          </dl>
        </div>
        <div className="detail-panel">
          <h2>Scores</h2>
          <dl className="definition-list">
            <div>
              <dt>Identity</dt>
              <dd>
                <ScoreBar value={seller.identityConfidence} />
              </dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>
                <ScoreBar value={seller.qualityScore} />
              </dd>
            </div>
            <div>
              <dt>Signals</dt>
              <dd>{seller.tags.join(", ")}</dd>
            </div>
          </dl>
        </div>
      </section>

      <TableShell title="Masked Contacts">
        <table>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Masked value</th>
              <th scope="col">Confidence</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {sellerContacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.contactType}</td>
                <td>{contact.displayValueMasked}</td>
                <td>
                  <ScoreBar value={contact.confidence} />
                </td>
                <td>{contact.sourceLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
