import { DashboardShell } from "../../components/dashboard-shell";
import { ScoreBar, StatusPill, TableShell } from "../../components/status";
import { reviewQueue, workerApiPaths } from "../../lib/dashboard-data";

export default function ReviewQueuePage() {
  return (
    <DashboardShell active="review-queue" eyebrow="Review" title="Review Queue">
      <TableShell title="Pending Decisions" action={<span>{workerApiPaths["review-queue"]}</span>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Review type</th>
              <th scope="col">Reason</th>
              <th scope="col">Score</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {reviewQueue.map((item) => (
              <tr key={item.id}>
                <td>{item.reviewType}</td>
                <td>{item.reason}</td>
                <td>
                  <ScoreBar value={item.score} />
                </td>
                <td>{item.priority}</td>
                <td>
                  <StatusPill value={item.status} />
                </td>
                <td>
                  <div className="button-row" role="group" aria-label={`Decision for ${item.id}`}>
                    <button type="button">Merge</button>
                    <button type="button">Keep separate</button>
                    <button type="button">Ignore 30d</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </DashboardShell>
  );
}
