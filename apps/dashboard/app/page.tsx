import Link from "next/link";

import { DashboardShell } from "../components/dashboard-shell";
import { MetricGrid, ScoreBar, StateBlock, StatusPill, TableShell } from "../components/status";
import { overviewMetrics, reviewQueue, sellers, workerApiPaths } from "../lib/dashboard-data";

export default function OverviewPage() {
  return (
    <DashboardShell active="overview" eyebrow="Overview" title="Operations Overview">
      <MetricGrid metrics={overviewMetrics} />

      <section className="split-grid">
        <TableShell title="Recent Sellers">
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
              {sellers.map((seller) => (
                <tr key={seller.id}>
                  <td>
                    <Link href={`/sellers/${seller.id}`}>{seller.canonicalName}</Link>
                    <small>
                      {seller.city}, {seller.countryCode}
                    </small>
                  </td>
                  <td>{seller.domain}</td>
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
        </TableShell>

        <TableShell title="Review Queue">
          <table>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Score</th>
                <th scope="col">Priority</th>
              </tr>
            </thead>
            <tbody>
              {reviewQueue.map((item) => (
                <tr key={item.id}>
                  <td>{item.reviewType}</td>
                  <td>
                    <ScoreBar value={item.score} />
                  </td>
                  <td>{item.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </section>

      <section className="state-grid">
        <StateBlock
          title="Worker API"
          detail={`Dashboard data boundary is ${workerApiPaths.overview}.`}
        />
        <StateBlock
          title="Loading State"
          detail="The interface reserves stable table and metric space while data is pending."
        />
        <StateBlock
          title="Error State"
          detail="Worker failures render a non-secret status message and keep cached masked values hidden."
          tone="warn"
        />
      </section>
    </DashboardShell>
  );
}
