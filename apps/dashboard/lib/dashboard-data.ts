export type DashboardRoute =
  | "overview"
  | "new-crawl"
  | "sellers"
  | "seller-detail"
  | "contacts"
  | "review-queue"
  | "crawl-health"
  | "export";

export interface NavItem {
  route: DashboardRoute;
  href: string;
  label: string;
}

export interface Metric {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export const workerApiPaths = {
  health: "/v1/health",
  sellers: "/v1/sellers",
  contacts: "/v1/contacts",
  duplicates: "/v1/duplicates",
  crawlRuns: "/v1/crawl-runs",
  search: "/v1/search",
  export: "/v1/export.csv",
  metrics: "/v1/metrics"
} as const;

export const dashboardNav: NavItem[] = [
  { route: "overview", href: "/", label: "Overview" },
  { route: "new-crawl", href: "/crawls/new", label: "New Crawl" },
  { route: "sellers", href: "/sellers", label: "Sellers" },
  { route: "contacts", href: "/contacts", label: "Contacts" },
  { route: "review-queue", href: "/review-queue", label: "Duplicates" },
  { route: "crawl-health", href: "/crawl-health", label: "Crawl runs" },
  { route: "export", href: "/export", label: "Export" }
];
