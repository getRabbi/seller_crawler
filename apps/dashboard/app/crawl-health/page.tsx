import { DashboardShell } from "../../components/dashboard-shell";
import { StateBlock, StatusPill, TableShell } from "../../components/status";
import { crawlHealth, workerApiPaths } from "../../lib/dashboard-data";

export default function CrawlHealthPage() {
  return (
    <DashboardShell active="crawl-health" eyebrow="Crawl Health" title="Runner Health">
      <section className="state-grid">
        <StateBlock title="Runner lock" detail="development_locked" />
        <StateBlock title="Live crawl" detail="disabled" tone="warn" />
        <StateBlock title="Spool backlog" detail="0 local records" />
      </section>

      <TableShell title="Adapter Health" action={<span>{workerApiPaths["crawl-health"]}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Adapter</th>
              <th scope="col">Status</th>
              <th scope="col">Runner</th>
              <th scope="col">Budget</th>
              <th scope="col">Blocked</th>
              <th scope="col">Cooldown</th>
              <th scope="col">Last run</th>
            </tr>
          </thead>
          <tbody>
            {crawlHealth.map((row) => (
              <tr key={row.adapter}>
                <td>{row.adapter}</td>
                <td>
                  <StatusPill value={row.status} />
                </td>
                <td>{row.runnerMode}</td>
                <td>{row.budgetUsed}</td>
                <td>{row.blockedRate}</td>
                <td>{row.cooldown}</td>
                <td>{row.lastRun}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
