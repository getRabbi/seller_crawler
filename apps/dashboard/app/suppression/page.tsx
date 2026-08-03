import { DashboardShell } from "../../components/dashboard-shell";
import { StateBlock, TableShell } from "../../components/status";
import { suppressions, workerApiPaths } from "../../lib/dashboard-data";

export default function SuppressionPage() {
  return (
    <DashboardShell active="suppression" eyebrow="Suppression" title="Suppression">
      {suppressions.length === 0 ? (
        <StateBlock
          title="No Active Suppressions"
          detail="The local fixture set has no suppressed sellers, contacts, or domains."
        />
      ) : null}

      <TableShell title="Suppression Entries" action={<span>{workerApiPaths.suppression}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Target</th>
              <th scope="col">Reason</th>
              <th scope="col">Expires</th>
            </tr>
          </thead>
          <tbody>
            {suppressions.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.target}</td>
                <td>{entry.reason}</td>
                <td>{entry.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
