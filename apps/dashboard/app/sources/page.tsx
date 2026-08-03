import { DashboardShell } from "../../components/dashboard-shell";
import { StatusPill, TableShell } from "../../components/status";
import { sourcePolicies, workerApiPaths } from "../../lib/dashboard-data";

export default function SourcesPage() {
  return (
    <DashboardShell active="sources" eyebrow="Sources" title="Source Policies">
      <TableShell title="Adapter Registry" action={<span>{workerApiPaths.sources}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Adapter</th>
              <th scope="col">Family</th>
              <th scope="col">Enabled</th>
              <th scope="col">Risk</th>
              <th scope="col">Robots</th>
              <th scope="col">Terms</th>
              <th scope="col">Daily budget</th>
            </tr>
          </thead>
          <tbody>
            {sourcePolicies.map((source) => (
              <tr key={source.adapter}>
                <td>{source.adapter}</td>
                <td>{source.sourceFamily}</td>
                <td>
                  <StatusPill value={source.enabled ? "enabled" : "disabled"} />
                </td>
                <td>{source.riskLevel}</td>
                <td>{source.robotsPolicy}</td>
                <td>{source.termsStatus}</td>
                <td>{source.dailyBudget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
