"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { dashboardNav, type DashboardRoute } from "../lib/dashboard-data";
import { runtimePanels } from "../lib/runtime";
import { useApiResource } from "../lib/use-api-resource";
import { workerApiPaths } from "../lib/dashboard-data";

interface HealthRuntime {
  runtime: {
    runnerMode: string;
    liveCrawlEnabled: boolean;
    operatorCrawlEnabled: boolean;
    amazonEnabled: boolean;
    discoveryEnabled: boolean;
    officialWebsiteEnabled: boolean;
    globalCrawlKillSwitch: boolean;
    scrapyCloudMaxUnits: number;
    paidServicesAllowed: boolean;
  };
}

interface DashboardShellProps {
  active: DashboardRoute;
  title: string;
  eyebrow: string;
  children: ReactNode;
}

export function DashboardShell({ active, title, eyebrow, children }: DashboardShellProps) {
  const activeNav = active === "seller-detail" ? "sellers" : active;
  const health = useApiResource<HealthRuntime>(workerApiPaths.health);
  const runtime = health.data?.runtime;
  const panels = runtime
    ? [
        { label: "Runner", value: runtime.runnerMode === "zyte_student_active" ? "Zyte Student — Active" : runtime.runnerMode, detail: "Configured crawler runner." },
        { label: "Live crawl", value: runtime.globalCrawlKillSwitch ? "Emergency Paused" : runtime.operatorCrawlEnabled && runtime.liveCrawlEnabled ? "Operator Controlled" : "Unavailable", detail: "Authenticated bounded crawl gate." },
        { label: "Amazon", value: runtime.amazonEnabled ? "Active" : "Unavailable", detail: "Public identity discovery." },
        { label: "Discovery", value: runtime.discoveryEnabled ? "Active" : "Unavailable", detail: "Amazon discovery and conservative official-domain verification." },
        { label: "Official enrichment", value: runtime.officialWebsiteEnabled ? "Active" : "Unavailable", detail: "Public official-site extraction." },
        { label: "Zyte unit", value: `1 / ${runtime.scrapyCloudMaxUnits}`, detail: "Single-unit queue enforcement." },
        { label: "Paid services", value: runtime.paidServicesAllowed ? "Enabled" : "Locked", detail: "Zero-charge billing protection." }
      ]
    : runtimePanels;

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
          {panels.map((panel) => (
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
