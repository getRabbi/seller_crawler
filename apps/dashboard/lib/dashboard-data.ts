export type DashboardRoute =
  | "overview"
  | "sellers"
  | "seller-detail"
  | "contacts"
  | "review-queue"
  | "crawl-health"
  | "sources"
  | "suppression"
  | "export";

export interface NavItem {
  route: DashboardRoute;
  href: string;
  label: string;
  count?: number;
}

export interface Metric {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export interface SellerSummary {
  id: string;
  canonicalName: string;
  domain: string;
  countryCode: string;
  city: string;
  identityConfidence: number;
  qualityScore: number;
  status: "active" | "review";
  primaryContactMasked: string;
  updatedAt: string;
  tags: string[];
}

export interface ContactSummary {
  id: string;
  sellerId: string;
  sellerName: string;
  contactType: "email" | "phone" | "whatsapp" | "wechat";
  displayValueMasked: string;
  classification: string;
  confidence: number;
  sourceLabel: string;
  lastVerifiedAt: string;
  revealAuditEvent: {
    actor: string;
    reason: string;
    createdAt: string;
  };
}

export interface ReviewItem {
  id: string;
  reviewType: string;
  entityId: string;
  priority: number;
  reason: string;
  score: number;
  createdAt: string;
  status: "pending" | "triaged";
}

export interface CrawlHealthRow {
  adapter: string;
  status: "idle" | "paused" | "ready";
  runnerMode: string;
  budgetUsed: string;
  blockedRate: string;
  cooldown: string;
  lastRun: string;
}

export interface SourcePolicyRow {
  adapter: string;
  sourceFamily: string;
  enabled: boolean;
  riskLevel: "low" | "medium" | "high";
  robotsPolicy: string;
  termsStatus: string;
  dailyBudget: number;
}

export interface SuppressionRow {
  id: string;
  target: string;
  reason: string;
  expiresAt: string;
}

export interface ExportJob {
  id: string;
  label: string;
  format: "CSV" | "JSONL";
  status: "ready" | "disabled";
  lastCreatedAt: string;
}

export const workerApiPaths: Record<Exclude<DashboardRoute, "seller-detail">, string> = {
  overview: "/v1/dashboard/overview",
  sellers: "/v1/dashboard/sellers",
  contacts: "/v1/dashboard/contacts",
  "review-queue": "/v1/dashboard/review-queue",
  "crawl-health": "/v1/dashboard/crawl-health",
  sources: "/v1/dashboard/sources",
  suppression: "/v1/dashboard/suppression",
  export: "/v1/dashboard/export"
};

export const dashboardNav: NavItem[] = [
  { route: "overview", href: "/", label: "Overview" },
  { route: "sellers", href: "/sellers", label: "Sellers", count: 3 },
  { route: "contacts", href: "/contacts", label: "Contacts", count: 4 },
  { route: "review-queue", href: "/review-queue", label: "Review queue", count: 2 },
  { route: "crawl-health", href: "/crawl-health", label: "Crawl health" },
  { route: "sources", href: "/sources", label: "Sources" },
  { route: "suppression", href: "/suppression", label: "Suppression" },
  { route: "export", href: "/export", label: "Export" }
];

export const overviewMetrics: Metric[] = [
  {
    label: "Accepted sellers",
    value: "3",
    detail: "Local fixture records only",
    tone: "good"
  },
  {
    label: "Verified contacts",
    value: "4",
    detail: "All values masked in the browser",
    tone: "good"
  },
  {
    label: "Review backlog",
    value: "2",
    detail: "Entity resolution and contact checks",
    tone: "warn"
  },
  {
    label: "Paid services",
    value: "Locked",
    detail: "External spend remains zero",
    tone: "danger"
  }
];

export const sellers: SellerSummary[] = [
  {
    id: "018f2d5e-7b3c-7a1d-8f2e-223456789aab",
    canonicalName: "Acme Industrial",
    domain: "acme-industrial.testmail",
    countryCode: "US",
    city: "Austin",
    identityConfidence: 96,
    qualityScore: 72,
    status: "active",
    primaryContactMasked: "sa***@acme-industrial.testmail",
    updatedAt: "2026-08-03T06:20:00Z",
    tags: ["official domain", "manufacturer", "public contact"]
  },
  {
    id: "018f2d5e-7b3c-7a1d-8f2e-323456789aab",
    canonicalName: "Shenzhen Fixture Supply",
    domain: "fixture-supply.testmail",
    countryCode: "CN",
    city: "Shenzhen",
    identityConfidence: 88,
    qualityScore: 64,
    status: "review",
    primaryContactMasked: "+********0000",
    updatedAt: "2026-08-03T06:12:00Z",
    tags: ["multilingual", "manual review"]
  },
  {
    id: "018f2d5e-7b3c-7a1d-8f2e-423456789aab",
    canonicalName: "Harbor Components",
    domain: "harbor-components.testmail",
    countryCode: "HK",
    city: "Hong Kong",
    identityConfidence: 77,
    qualityScore: 51,
    status: "review",
    primaryContactMasked: "we***",
    updatedAt: "2026-08-03T05:58:00Z",
    tags: ["entity review", "partial profile"]
  }
];

export const contacts: ContactSummary[] = [
  {
    id: "contact-1",
    sellerId: sellers[0].id,
    sellerName: sellers[0].canonicalName,
    contactType: "email",
    displayValueMasked: "sa***@acme-industrial.testmail",
    classification: "business_verified",
    confidence: 95,
    sourceLabel: "official contact page",
    lastVerifiedAt: "2026-08-03T06:20:00Z",
    revealAuditEvent: {
      actor: "access-user:masked",
      reason: "manual reveal for internal verification",
      createdAt: "2026-08-03T06:21:00Z"
    }
  },
  {
    id: "contact-2",
    sellerId: sellers[0].id,
    sellerName: sellers[0].canonicalName,
    contactType: "phone",
    displayValueMasked: "+*******2671",
    classification: "business_verified",
    confidence: 90,
    sourceLabel: "official contact page",
    lastVerifiedAt: "2026-08-03T06:20:00Z",
    revealAuditEvent: {
      actor: "access-user:masked",
      reason: "manual reveal for call validation",
      createdAt: "2026-08-03T06:22:00Z"
    }
  },
  {
    id: "contact-3",
    sellerId: sellers[1].id,
    sellerName: sellers[1].canonicalName,
    contactType: "whatsapp",
    displayValueMasked: "+********8000",
    classification: "business_verified",
    confidence: 84,
    sourceLabel: "multilingual fixture",
    lastVerifiedAt: "2026-08-03T06:10:00Z",
    revealAuditEvent: {
      actor: "access-user:masked",
      reason: "manual reveal for channel confirmation",
      createdAt: "2026-08-03T06:11:00Z"
    }
  },
  {
    id: "contact-4",
    sellerId: sellers[2].id,
    sellerName: sellers[2].canonicalName,
    contactType: "wechat",
    displayValueMasked: "we***",
    classification: "business_public_manual_review",
    confidence: 72,
    sourceLabel: "official support page",
    lastVerifiedAt: "2026-08-03T05:58:00Z",
    revealAuditEvent: {
      actor: "not revealed",
      reason: "pending manual review",
      createdAt: "2026-08-03T05:59:00Z"
    }
  }
];

export const reviewQueue: ReviewItem[] = [
  {
    id: "review-1",
    reviewType: "possible_duplicate_seller",
    entityId: sellers[1].id,
    priority: 1,
    reason: "entity_resolution_score_85",
    score: 85,
    createdAt: "2026-08-03T06:15:00Z",
    status: "pending"
  },
  {
    id: "review-2",
    reviewType: "contact_manual_review",
    entityId: contacts[3].id,
    priority: 2,
    reason: "business_public_manual_review",
    score: 72,
    createdAt: "2026-08-03T05:59:00Z",
    status: "pending"
  }
];

export const crawlHealth: CrawlHealthRow[] = [
  {
    adapter: "official_site",
    status: "ready",
    runnerMode: "development_locked",
    budgetUsed: "0 / 8",
    blockedRate: "0%",
    cooldown: "none",
    lastRun: "fixture only"
  },
  {
    adapter: "business_registry",
    status: "idle",
    runnerMode: "development_locked",
    budgetUsed: "0 / 0",
    blockedRate: "0%",
    cooldown: "none",
    lastRun: "not started"
  },
  {
    adapter: "amazon",
    status: "paused",
    runnerMode: "disabled",
    budgetUsed: "0 / 0",
    blockedRate: "n/a",
    cooldown: "policy disabled",
    lastRun: "never"
  }
];

export const sourcePolicies: SourcePolicyRow[] = [
  {
    adapter: "official_site",
    sourceFamily: "official",
    enabled: true,
    riskLevel: "low",
    robotsPolicy: "obey",
    termsStatus: "reviewed_low",
    dailyBudget: 8
  },
  {
    adapter: "business_registry",
    sourceFamily: "registry",
    enabled: true,
    riskLevel: "low",
    robotsPolicy: "obey",
    termsStatus: "reviewed_low",
    dailyBudget: 0
  },
  {
    adapter: "amazon",
    sourceFamily: "marketplace",
    enabled: false,
    riskLevel: "medium",
    robotsPolicy: "deny",
    termsStatus: "pending_review",
    dailyBudget: 0
  },
  {
    adapter: "search_discovery",
    sourceFamily: "search",
    enabled: false,
    riskLevel: "medium",
    robotsPolicy: "obey",
    termsStatus: "pending_review",
    dailyBudget: 0
  }
];

export const suppressions: SuppressionRow[] = [];

export const exportJobs: ExportJob[] = [
  {
    id: "export-contacts",
    label: "Masked contacts",
    format: "CSV",
    status: "ready",
    lastCreatedAt: "not exported"
  },
  {
    id: "export-evidence",
    label: "Evidence index",
    format: "JSONL",
    status: "disabled",
    lastCreatedAt: "R2 disabled"
  }
];

export function sellerById(id: string): SellerSummary | undefined {
  return sellers.find((seller) => seller.id === id);
}

export function contactsForSeller(sellerId: string): ContactSummary[] {
  return contacts.filter((contact) => contact.sellerId === sellerId);
}
