export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SellerListItem {
  id: string;
  canonicalName: string;
  legalName: string | null;
  countryCode: string | null;
  province: string | null;
  city: string | null;
  officialDomain: string | null;
  identityConfidence: number;
  qualityScore: number;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  marketplace: string | null;
  marketplaceDisplayName: string | null;
  marketplaceProfileUrl: string | null;
  manufacturerScore: number;
  traderScore: number;
  contactCount: number;
  contactTypes: string[];
  duplicateStatus: string | null;
}

export interface ContactListItem {
  id: string;
  sellerId: string;
  sellerName: string | null;
  contactType: string;
  displayValueMasked: string | null;
  classification: string;
  confidence: number;
  sourceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  status: string;
  sellerCountryCode: string | null;
  sourceType: string | null;
}

export interface ContactRevealResponse {
  id: string;
  contactType: string;
  value: string;
  revealedAt: string;
}

export type DuplicateDecisionAction = "merge" | "keep_separate" | "ignore" | "rollback";

export interface DuplicateDecisionResponse {
  decisionId: string;
  action: DuplicateDecisionAction;
  status: string;
  duplicate: boolean;
  decidedAt: string;
}

export interface EvidenceListItem {
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  pageTitle: string | null;
  evidenceSnippet: string | null;
  contentHash: string | null;
  detectedAt: string | null;
  lastSeenAt: string | null;
  httpStatus: number | null;
  robotsStatus: string | null;
  status: string;
}

export interface DuplicateReviewItem {
  id: string;
  candidateSellerId: string;
  candidateName: string;
  matchedSellerId: string;
  matchedName: string;
  action: string;
  score: number;
  scoreBreakdown: unknown;
  status: string;
  createdAt: string;
}

export interface CrawlRunItem {
  id: string;
  jobType: string;
  zyteJobId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  requestsTotal: number;
  responsesSuccess: number;
  candidatesFound: number;
  recordsCreated: number;
  recordsUpdated: number;
  contactsVerified: number;
  blockedCount: number;
  errorCount: number;
  notes: string | null;
  mode?: CrawlMode;
  query?: string[];
  marketplace?: string | null;
  countryCodes?: string[];
  requestedSellerCount?: number;
  discoveredSellers?: number;
  enrichedSellers?: number;
  contactsFound?: number;
  requestedAt?: string;
  updatedAt?: string;
  stage?: string;
  warnings?: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type CrawlMode = "find_sellers" | "known_websites";

export interface CrawlFilters {
  category?: string;
  brandKeyword?: string;
  sellerNameKeyword?: string;
  requirePublicLocation?: boolean;
  hasOfficialWebsite?: boolean;
  manufacturerLikelihood?: "any" | "likely";
  traderLikelihood?: "any" | "likely";
}

export interface CreateCrawlRunRequest {
  mode: CrawlMode;
  keywords?: string[];
  marketplace?: string;
  countryCodes?: string[];
  filters?: CrawlFilters;
  seedUrls?: string[];
  contactTypes: Array<"email" | "phone" | "whatsapp" | "wechat">;
  targetSellerCount: number;
  maxResultPages: number;
  maxOfficialPages: number;
  crawlDepth: number;
  stopAfterTarget: boolean;
  idempotencyKey: string;
}

export interface CrawlRunActionResponse {
  run: CrawlRunItem;
  queued: boolean;
}

export interface CrawlRunDetailResponse {
  run: CrawlRunItem;
  sellers: SellerListItem[];
  events: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    message: string | null;
    createdAt: string;
  }>;
}

export interface OperatorMetrics {
  totalSellers: number;
  newSellersToday: number;
  amazonIdentitiesDiscovered: number;
  officialWebsitesResolved: number;
  contactsFound: number;
  pendingDuplicates: number;
  activeCrawls: number;
  queuedRuns: number;
  recentFailures: number;
  cooldownDomains: number;
}

export interface SellerDetailResponse {
  seller: SellerListItem;
  aliases: string[];
  contacts: ContactListItem[];
  evidence: EvidenceListItem[];
  duplicateReviews: DuplicateReviewItem[];
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}
