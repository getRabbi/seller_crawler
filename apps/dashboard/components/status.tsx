import type { ReactNode } from "react";

import type { Metric } from "../lib/dashboard-data";

interface MetricGridProps {
  metrics: Metric[];
}

interface StateBlockProps {
  title: string;
  detail: string;
  tone?: "neutral" | "warn" | "danger";
  action?: ReactNode;
}

interface TableShellProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <section className="metric-grid" aria-label="Overview metrics">
      {metrics.map((metric) => (
        <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.detail}</p>
        </article>
      ))}
    </section>
  );
}

export function StateBlock({ title, detail, tone = "neutral", action }: StateBlockProps) {
  return (
    <section className={`state-block tone-${tone}`} aria-label={title}>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action ? <div className="state-action">{action}</div> : null}
    </section>
  );
}

export function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${statusTone(value)}`}>{value}</span>;
}

export function ScoreBar({ value }: { value: number }) {
  return (
    <span className="score-bar" aria-label={`Score ${value}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      <b>{value}</b>
    </span>
  );
}

export function TableShell({ title, action, children }: TableShellProps) {
  return (
    <section className="table-shell">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="table-scroll">{children}</div>
    </section>
  );
}

function statusTone(value: string): string {
  if (["active", "ready", "accepted", "enabled", "running", "completed"].includes(value)) {
    return "good";
  }
  if (["review", "pending", "idle", "queued", "starting", "launching", "resolving", "enriching", "ingesting", "completed_with_warnings", "cooldown"].includes(value)) {
    return "warn";
  }
  if (["paused", "disabled", "locked", "failed", "blocked", "cancelled"].includes(value)) {
    return "danger";
  }
  return "neutral";
}
