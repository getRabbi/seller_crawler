import { DashboardShell } from "../../components/dashboard-shell";
import { StatusPill, TableShell } from "../../components/status";
import { exportJobs, workerApiPaths } from "../../lib/dashboard-data";

export default function ExportPage() {
  return (
    <DashboardShell active="export" eyebrow="Export" title="Export">
      <form className="toolbar" aria-label="Export options">
        <label>
          Dataset
          <select name="dataset" defaultValue="masked-contacts">
            <option value="masked-contacts">Masked contacts</option>
            <option value="seller-summary">Seller summary</option>
            <option value="evidence-index">Evidence index</option>
          </select>
        </label>
        <label>
          Format
          <select name="format" defaultValue="csv">
            <option value="csv">CSV</option>
            <option value="jsonl">JSONL</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input name="includeAudit" type="checkbox" defaultChecked />
          Include audit fields
        </label>
        <button type="button">Prepare Export</button>
      </form>

      <TableShell title="Export Jobs" action={<span>{workerApiPaths.export}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Dataset</th>
              <th scope="col">Format</th>
              <th scope="col">Status</th>
              <th scope="col">Last created</th>
            </tr>
          </thead>
          <tbody>
            {exportJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.label}</td>
                <td>{job.format}</td>
                <td>
                  <StatusPill value={job.status} />
                </td>
                <td>{job.lastCreatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
