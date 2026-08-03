import Link from "next/link";
import type { ReactNode } from "react";

import { dashboardNav, type DashboardRoute } from "../lib/dashboard-data";
import { runtimePanels } from "../lib/runtime";

interface DashboardShellProps {
  active: DashboardRoute;
  title: string;
  eyebrow: string;
  children: ReactNode;
}

export function DashboardShell({ active, title, eyebrow, children }: DashboardShellProps) {
  const activeNav = active === "seller-detail" ? "sellers" : active;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="brand-block">
          <span className="brand-mark">SI</span>
          <div>
            <p className="eyebrow">Seller Intelligence</p>
            <strong>Internal dashboard</strong>
          </div>
        </div>
        <nav className="nav-list">
          {dashboardNav.map((item) => (
            <Link
              aria-current={item.route === activeNav ? "page" : undefined}
              className="nav-link"
              href={item.href}
              key={item.route}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="content-shell">
        <header className="topbar" aria-label="System status">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <span className="lock-badge">PAID SERVICES LOCKED</span>
        </header>

        <section className="runtime-strip" aria-label="Runtime locks">
          {runtimePanels.map((panel) => (
            <div className="runtime-item" key={panel.label}>
              <span>{panel.label}</span>
              <strong>{panel.value}</strong>
            </div>
          ))}
        </section>

        {children}
      </section>
    </main>
  );
}
