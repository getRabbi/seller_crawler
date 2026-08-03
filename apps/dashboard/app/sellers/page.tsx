import Link from "next/link";

import { DashboardShell } from "../../components/dashboard-shell";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { sellers, workerApiPaths } from "../../lib/dashboard-data";

export default function SellersPage() {
  return (
    <DashboardShell active="sellers" eyebrow="Sellers" title="Seller Directory">
      <form className="toolbar" aria-label="Seller filters">
        <label>
          Search
          <input name="query" placeholder="Company, domain, city" type="search" />
        </label>
        <label>
          Country
          <select name="country" defaultValue="all">
            <option value="all">All countries</option>
            <option value="US">US</option>
            <option value="CN">CN</option>
            <option value="HK">HK</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue="all">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="review">Review</option>
          </select>
        </label>
      </form>

      <TableShell title="Canonical Sellers" action={<span>{workerApiPaths.sellers}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Seller</th>
              <th scope="col">Location</th>
              <th scope="col">Contact</th>
              <th scope="col">Identity</th>
              <th scope="col">Quality</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((seller) => (
              <tr key={seller.id}>
                <td>
                  <Link href={`/sellers/${seller.id}`}>{seller.canonicalName}</Link>
                  <small>{seller.domain}</small>
                </td>
                <td>
                  {seller.city}, {seller.countryCode}
                </td>
                <td>{seller.primaryContactMasked}</td>
                <td>
                  <ScoreBar value={seller.identityConfidence} />
                </td>
                <td>
                  <ScoreBar value={seller.qualityScore} />
                </td>
                <td>
                  <StatusPill value={seller.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
