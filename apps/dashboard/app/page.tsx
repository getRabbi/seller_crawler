import { runtimePanels } from "../lib/runtime";

export default function DashboardPage() {
  return (
    <main className="shell">
      <section className="topbar" aria-label="System status">
        <div>
          <p className="eyebrow">Seller Intelligence</p>
          <h1>Operations Dashboard</h1>
        </div>
        <span className="lock-badge">PAID SERVICES LOCKED</span>
      </section>

      <section className="status-grid" aria-label="Runtime locks">
        {runtimePanels.map((panel) => (
          <article className="status-panel" key={panel.label}>
            <span className="panel-label">{panel.label}</span>
            <strong>{panel.value}</strong>
            <p>{panel.detail}</p>
          </article>
        ))}
      </section>

      <section className="work-surface" aria-label="Phase zero readiness">
        <div>
          <h2>Phase 0 Scope</h2>
          <p>
            Repository bootstrap, local health checks, and locked provider gates are present.
            Crawling, production deployment, Zyte API, and provider activation remain disabled.
          </p>
        </div>
        <dl className="audit-list">
          <div>
            <dt>Runner mode</dt>
            <dd>development_locked</dd>
          </div>
          <div>
            <dt>Activation history</dt>
            <dd>No provider activation events</dd>
          </div>
          <div>
            <dt>Next permitted phase</dt>
            <dd>Phase 1 after explicit task approval</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
