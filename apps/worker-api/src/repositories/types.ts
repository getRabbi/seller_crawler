export interface VersionedWrite {
  schemaVersion?: number;
  parserVersion: string;
}

export interface SellerWrite extends VersionedWrite {
  id: string;
  canonicalName: string;
  normalizedName: string;
  legalName?: string | null;
  legalNameLocal?: string | null;
  countryCode?: string | null;
  province?: string | null;
  city?: string | null;
  addressPrivate?: string | null;
  addressPublicMasked?: string | null;
  officialDomain?: string | null;
  chinaConfidence?: number;
  identityConfidence?: number;
  manufacturerScore?: number;
  traderScore?: number;
  qualityScore?: number;
  status?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastMaterialChangeAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceAccountWrite {
  id: string;
  sellerId: string;
  marketplace: string;
  merchantToken?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
  storefrontUrl?: string | null;
  rating?: number | null;
  feedbackCount?: number | null;
  positiveFeedbackPercent?: number | null;
  countryHint?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status?: string;
}

export interface SellerAliasWrite {
  id: string;
  sellerId: string;
  alias: string;
  normalizedAlias: string;
  languageCode?: string | null;
  aliasType: string;
  sourceId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScoreComponentWrite {
  id: string;
  sellerId: string;
  scoreType: string;
  ruleCode: string;
  points: number;
  evidenceSourceId?: string | null;
  explanation: string;
  observedAt: string;
  parserVersion: string;
}

export interface SellerProductLinkWrite extends VersionedWrite {
  id: string;
  sellerId: string;
  productName: string;
  normalizedProductName: string;
  brand?: string | null;
  normalizedBrand?: string | null;
  category?: string | null;
  productUrl?: string | null;
  sourceId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status?: string;
}

export interface ContactWrite extends VersionedWrite {
  id: string;
  sellerId: string;
  contactType: string;
  contactValueCiphertext: string;
  normalizedHash: string;
  displayValueMasked?: string | null;
  classification: string;
  confidence: number;
  sourceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt?: string | null;
  status?: string;
  outreachEligible?: boolean;
}

export interface AuditEventWrite {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  oldValueHash?: string | null;
  newValueHash?: string | null;
  oldValueMasked?: string | null;
  newValueMasked?: string | null;
  reason?: string | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface SuppressionWrite {
  id: string;
  sellerId?: string | null;
  contactHash?: string | null;
  domain?: string | null;
  reason: string;
  createdAt: string;
  expiresAt?: string | null;
}

export interface OutreachStateWrite extends VersionedWrite {
  id: string;
  sellerId: string;
  contactId?: string | null;
  outreachStatus?: string;
  channel?: string | null;
  lastOutreachAt?: string | null;
  nextAllowedAt?: string | null;
  operatorNotes?: string | null;
  updatedAt: string;
}

export interface SourceWrite extends VersionedWrite {
  id: string;
  sellerId?: string | null;
  sourceUrl: string;
  canonicalUrl: string;
  sourceDomain: string;
  sourceType: string;
  robotsStatus?: string | null;
  termsRisk?: string | null;
  httpStatus?: number | null;
  pageTitle?: string | null;
  evidenceSnippet?: string | null;
  contentHash?: string | null;
  r2ObjectKey?: string | null;
  detectedAt?: string | null;
  lastSeenAt?: string | null;
  firstSeenAt: string;
  lastFetchedAt?: string | null;
  lastSuccessAt?: string | null;
  nextAllowedAt?: string | null;
  status?: string;
}

export interface CrawlRunWrite {
  id: string;
  jobType: string;
  zyteJobId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  requestsTotal?: number;
  responsesSuccess?: number;
  candidatesFound?: number;
  recordsCreated?: number;
  recordsUpdated?: number;
  contactsVerified?: number;
  blockedCount?: number;
  errorCount?: number;
  notes?: string | null;
}

export interface ReviewQueueWrite {
  id: string;
  reviewType: string;
  entityId: string;
  priority?: number;
  payloadJson: string;
  reason: string;
  status?: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface SourceRegistryWrite {
  adapterName: string;
  sourceFamily: string;
  enabled?: boolean;
  riskLevel: string;
  robotsPolicy: string;
  termsReviewStatus: string;
  dailyRequestBudget?: number;
  concurrencyPerDomain?: number;
  minimumDelaySeconds?: number;
  blockedUntil?: string | null;
  parserVersion: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  operatorNotes?: string | null;
}

export interface IdempotencyKeyWrite {
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  createdAt: string;
  expiresAt: string;
}

export interface IngestionNonceWrite {
  nonce: string;
  idempotencyKey: string;
  requestHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface QuotaStateWrite {
  quotaName: string;
  windowStart: string;
  used?: number;
  softLimit: number;
  hardLimit: number;
  updatedAt: string;
}

export interface FeatureFlagWrite {
  flagName: string;
  enabled?: boolean;
  source?: string;
  updatedAt: string;
  operatorNotes?: string | null;
}

export interface FieldHistoryWrite {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValueHash?: string | null;
  newValueHash?: string | null;
  oldValueMasked?: string | null;
  newValueMasked?: string | null;
  sourceId?: string | null;
  observedAt: string;
  crawlRunId?: string | null;
  actorType?: string;
  actorId?: string | null;
  changeReason?: string | null;
  diffJson?: string | null;
  schemaVersion?: number;
}

export interface RecentDiffMetadataWrite {
  id: string;
  entityType: string;
  entityId: string;
  latestFieldHistoryId?: string | null;
  diffCount30d?: number;
  lastObservedAt: string;
  schemaVersion?: number;
  updatedAt: string;
}
