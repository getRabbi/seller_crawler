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
