import { isUuidV7Compatible } from "../repositories/ids";
import type { UnitOfWorkChanges } from "../repositories/unit-of-work";
import type { IngestionConfig } from "./config";

export interface JsonObject {
  [key: string]: unknown;
}

export interface IngestionBatchPayload extends JsonObject {
  schema_version: number;
  parser_version: string;
  crawl_run_id: string;
  batch_number: number;
  generated_at: string;
}

export type SchemaValidationResult =
  | { ok: true; payload: IngestionBatchPayload; writeCount: number }
  | { ok: false; errors: string[] };

const topLevelRequired = [
  "schema_version",
  "parser_version",
  "crawl_run_id",
  "batch_number",
  "generated_at"
];

const allowedArrays = [
  "sellers",
  "marketplace_accounts",
  "seller_aliases",
  "score_components",
  "product_links",
  "contacts",
  "suppressions",
  "outreach_states",
  "audit_events",
  "sources",
  "crawl_runs",
  "review_queue_items",
  "source_registry",
  "quota_states",
  "feature_flags",
  "field_history",
  "recent_diff_metadata"
] as const;

type ArrayName = (typeof allowedArrays)[number];
type FieldType =
  | "array"
  | "boolean"
  | "confidence"
  | "integer"
  | "nonEmptyString"
  | "nonNegativeInteger"
  | "number"
  | "positiveInteger"
  | "string";

const recordRequirements: Record<ArrayName, string[]> = {
  sellers: [
    "id",
    "canonical_name",
    "normalized_name",
    "schema_version",
    "parser_version",
    "first_seen_at",
    "last_seen_at",
    "created_at",
    "updated_at"
  ],
  marketplace_accounts: ["id", "seller_id", "marketplace", "first_seen_at", "last_seen_at"],
  seller_aliases: [
    "id",
    "seller_id",
    "alias",
    "normalized_alias",
    "alias_type",
    "first_seen_at",
    "last_seen_at"
  ],
  score_components: [
    "id",
    "seller_id",
    "score_type",
    "rule_code",
    "points",
    "explanation",
    "observed_at",
    "parser_version"
  ],
  product_links: [
    "id",
    "seller_id",
    "product_name",
    "normalized_product_name",
    "schema_version",
    "parser_version",
    "first_seen_at",
    "last_seen_at"
  ],
  contacts: [
    "id",
    "seller_id",
    "contact_type",
    "contact_value_ciphertext",
    "normalized_hash",
    "classification",
    "confidence",
    "source_id",
    "schema_version",
    "parser_version",
    "first_seen_at",
    "last_seen_at"
  ],
  suppressions: ["id", "reason", "created_at"],
  outreach_states: ["id", "seller_id", "schema_version", "parser_version", "updated_at"],
  audit_events: ["id", "event_type", "entity_type", "entity_id", "created_at"],
  sources: [
    "id",
    "source_url",
    "canonical_url",
    "source_domain",
    "source_type",
    "schema_version",
    "parser_version",
    "first_seen_at"
  ],
  crawl_runs: ["id", "job_type", "started_at", "status"],
  review_queue_items: ["id", "review_type", "entity_id", "payload_json", "reason", "created_at"],
  source_registry: [
    "adapter_name",
    "source_family",
    "risk_level",
    "robots_policy",
    "terms_review_status",
    "parser_version"
  ],
  quota_states: ["quota_name", "window_start", "soft_limit", "hard_limit", "updated_at"],
  feature_flags: ["flag_name", "updated_at"],
  field_history: ["id", "entity_type", "entity_id", "field_name", "observed_at", "schema_version"],
  recent_diff_metadata: [
    "id",
    "entity_type",
    "entity_id",
    "last_observed_at",
    "schema_version",
    "updated_at"
  ]
};

const uuidFields = new Set([
  "id",
  "seller_id",
  "source_id",
  "crawl_run_id",
  "contact_id",
  "evidence_source_id",
  "latest_field_history_id"
]);

const topLevelFieldTypes: Record<string, FieldType> = {
  schema_version: "positiveInteger",
  parser_version: "string",
  crawl_run_id: "string",
  batch_number: "nonNegativeInteger",
  generated_at: "string",
  ...Object.fromEntries(allowedArrays.map((arrayName) => [arrayName, "array" as const]))
};

const recordFieldTypes: Record<ArrayName, Record<string, FieldType>> = {
  sellers: {
    id: "string",
    canonical_name: "string",
    normalized_name: "string",
    legal_name: "string",
    legal_name_local: "string",
    country_code: "string",
    province: "string",
    city: "string",
    address_private: "string",
    address_public_masked: "string",
    official_domain: "string",
    china_confidence: "nonNegativeInteger",
    identity_confidence: "nonNegativeInteger",
    manufacturer_score: "integer",
    trader_score: "integer",
    quality_score: "nonNegativeInteger",
    schema_version: "positiveInteger",
    parser_version: "string",
    status: "nonEmptyString",
    first_seen_at: "string",
    last_seen_at: "string",
    last_material_change_at: "string",
    created_at: "string",
    updated_at: "string"
  },
  marketplace_accounts: {
    id: "string",
    seller_id: "string",
    marketplace: "string",
    merchant_token: "string",
    display_name: "string",
    profile_url: "string",
    storefront_url: "string",
    rating: "number",
    feedback_count: "nonNegativeInteger",
    positive_feedback_percent: "number",
    country_hint: "string",
    first_seen_at: "string",
    last_seen_at: "string",
    status: "nonEmptyString"
  },
  seller_aliases: {
    id: "string",
    seller_id: "string",
    alias: "string",
    normalized_alias: "string",
    language_code: "string",
    alias_type: "string",
    source_id: "string",
    first_seen_at: "string",
    last_seen_at: "string"
  },
  score_components: {
    id: "string",
    seller_id: "string",
    score_type: "string",
    rule_code: "string",
    points: "integer",
    evidence_source_id: "string",
    explanation: "string",
    observed_at: "string",
    parser_version: "string"
  },
  product_links: {
    id: "string",
    seller_id: "string",
    product_name: "string",
    normalized_product_name: "string",
    brand: "string",
    normalized_brand: "string",
    category: "string",
    product_url: "string",
    source_id: "string",
    first_seen_at: "string",
    last_seen_at: "string",
    schema_version: "positiveInteger",
    parser_version: "string",
    status: "nonEmptyString"
  },
  contacts: {
    id: "string",
    seller_id: "string",
    contact_type: "string",
    contact_value_ciphertext: "string",
    normalized_hash: "string",
    display_value_masked: "string",
    classification: "string",
    confidence: "confidence",
    source_id: "string",
    first_seen_at: "string",
    last_seen_at: "string",
    last_verified_at: "string",
    schema_version: "positiveInteger",
    parser_version: "string",
    status: "nonEmptyString",
    outreach_eligible: "boolean"
  },
  suppressions: {
    id: "string",
    seller_id: "string",
    contact_hash: "string",
    domain: "string",
    reason: "string",
    created_at: "string",
    expires_at: "string"
  },
  outreach_states: {
    id: "string",
    seller_id: "string",
    contact_id: "string",
    outreach_status: "nonEmptyString",
    channel: "string",
    last_outreach_at: "string",
    next_allowed_at: "string",
    operator_notes: "string",
    schema_version: "positiveInteger",
    parser_version: "string",
    updated_at: "string"
  },
  audit_events: {
    id: "string",
    event_type: "string",
    entity_type: "string",
    entity_id: "string",
    actor_id: "string",
    old_value_hash: "string",
    new_value_hash: "string",
    old_value_masked: "string",
    new_value_masked: "string",
    reason: "string",
    metadata_json: "string",
    created_at: "string"
  },
  sources: {
    id: "string",
    seller_id: "string",
    source_url: "string",
    canonical_url: "string",
    source_domain: "string",
    source_type: "string",
    robots_status: "string",
    terms_risk: "string",
    http_status: "nonNegativeInteger",
    page_title: "string",
    evidence_snippet: "string",
    content_hash: "string",
    r2_object_key: "string",
    detected_at: "string",
    last_seen_at: "string",
    first_seen_at: "string",
    last_fetched_at: "string",
    last_success_at: "string",
    next_allowed_at: "string",
    schema_version: "positiveInteger",
    parser_version: "string",
    status: "nonEmptyString"
  },
  crawl_runs: {
    id: "string",
    job_type: "string",
    zyte_job_id: "string",
    started_at: "string",
    finished_at: "string",
    status: "nonEmptyString",
    requests_total: "nonNegativeInteger",
    responses_success: "nonNegativeInteger",
    candidates_found: "nonNegativeInteger",
    records_created: "nonNegativeInteger",
    records_updated: "nonNegativeInteger",
    contacts_verified: "nonNegativeInteger",
    blocked_count: "nonNegativeInteger",
    error_count: "nonNegativeInteger",
    notes: "string"
  },
  review_queue_items: {
    id: "string",
    review_type: "string",
    entity_id: "string",
    priority: "nonNegativeInteger",
    payload_json: "string",
    reason: "string",
    status: "nonEmptyString",
    created_at: "string",
    reviewed_at: "string",
    reviewed_by: "string"
  },
  source_registry: {
    adapter_name: "string",
    source_family: "string",
    enabled: "boolean",
    risk_level: "string",
    robots_policy: "string",
    terms_review_status: "string",
    daily_request_budget: "nonNegativeInteger",
    concurrency_per_domain: "nonNegativeInteger",
    minimum_delay_seconds: "number",
    blocked_until: "string",
    parser_version: "string",
    last_success_at: "string",
    last_failure_at: "string",
    operator_notes: "string"
  },
  quota_states: {
    quota_name: "string",
    window_start: "string",
    used: "nonNegativeInteger",
    soft_limit: "nonNegativeInteger",
    hard_limit: "nonNegativeInteger",
    updated_at: "string"
  },
  feature_flags: {
    flag_name: "string",
    enabled: "boolean",
    source: "nonEmptyString",
    updated_at: "string",
    operator_notes: "string"
  },
  field_history: {
    id: "string",
    entity_type: "string",
    entity_id: "string",
    field_name: "string",
    old_value_hash: "string",
    new_value_hash: "string",
    old_value_masked: "string",
    new_value_masked: "string",
    source_id: "string",
    observed_at: "string",
    crawl_run_id: "string",
    actor_type: "string",
    actor_id: "string",
    change_reason: "string",
    diff_json: "string",
    schema_version: "positiveInteger"
  },
  recent_diff_metadata: {
    id: "string",
    entity_type: "string",
    entity_id: "string",
    latest_field_history_id: "string",
    diff_count_30d: "nonNegativeInteger",
    last_observed_at: "string",
    schema_version: "positiveInteger",
    updated_at: "string"
  }
};

export function parseAndValidateBatch(
  bodyText: string,
  config: IngestionConfig
): SchemaValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { ok: false, errors: ["body must be valid JSON"] };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }

  const errors: string[] = [];
  requireFields(parsed, topLevelRequired, "$", errors);
  validateFieldTypes(parsed, topLevelFieldTypes, "$", errors);

  if (typeof parsed.crawl_run_id === "string" && !isUuidV7Compatible(parsed.crawl_run_id)) {
    errors.push("$.crawl_run_id must be a UUIDv7-compatible text identifier");
  }

  let writeCount = 0;
  for (const arrayName of allowedArrays) {
    const records = parsed[arrayName];
    if (records === undefined) {
      continue;
    }

    if (!Array.isArray(records)) {
      errors.push(`$.${arrayName} must be an array`);
      continue;
    }

    writeCount += records.length;
    records.forEach((record, index) => {
      const path = `$.${arrayName}[${index}]`;
      if (!isObject(record)) {
        errors.push(`${path} must be an object`);
        return;
      }

      requireFields(record, recordRequirements[arrayName], path, errors);
      validateFieldTypes(record, recordFieldTypes[arrayName], path, errors);
      validateUuidFields(record, path, errors);
      if (
        arrayName === "contacts" &&
        typeof record.contact_value_ciphertext === "string" &&
        !/^si-aesgcm:v1:[A-Za-z0-9._-]{1,32}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(
          record.contact_value_ciphertext
        )
      ) {
        errors.push(`${path}.contact_value_ciphertext must use the versioned AES-GCM format`);
      }
    });
  }

  const sellers = arrayLength(parsed, "sellers");
  if (sellers > config.maxSellers) {
    errors.push(`$.sellers exceeds maximum ${config.maxSellers}`);
  }

  const contacts = arrayLength(parsed, "contacts");
  if (contacts > config.maxContacts) {
    errors.push(`$.contacts exceeds maximum ${config.maxContacts}`);
  }

  if (writeCount > config.maxD1Statements) {
    errors.push(`batch write count ${writeCount} exceeds maximum ${config.maxD1Statements}`);
  }

  return errors.length === 0
    ? { ok: true, payload: parsed as IngestionBatchPayload, writeCount }
    : { ok: false, errors };
}

export function toUnitOfWorkChanges(payload: IngestionBatchPayload): UnitOfWorkChanges {
  return {
    core: {
      sellers: records(payload, "sellers").map((record) => ({
        id: stringField(record, "id"),
        canonicalName: stringField(record, "canonical_name"),
        normalizedName: stringField(record, "normalized_name"),
        legalName: optionalStringField(record, "legal_name"),
        legalNameLocal: optionalStringField(record, "legal_name_local"),
        countryCode: optionalStringField(record, "country_code"),
        province: optionalStringField(record, "province"),
        city: optionalStringField(record, "city"),
        addressPrivate: optionalStringField(record, "address_private"),
        addressPublicMasked: optionalStringField(record, "address_public_masked"),
        officialDomain: optionalStringField(record, "official_domain"),
        chinaConfidence: optionalNumberField(record, "china_confidence") ?? undefined,
        identityConfidence: optionalNumberField(record, "identity_confidence") ?? undefined,
        manufacturerScore: optionalNumberField(record, "manufacturer_score") ?? undefined,
        traderScore: optionalNumberField(record, "trader_score") ?? undefined,
        qualityScore: optionalNumberField(record, "quality_score") ?? undefined,
        schemaVersion: numberField(record, "schema_version"),
        parserVersion: stringField(record, "parser_version"),
        status: optionalStringField(record, "status") ?? undefined,
        firstSeenAt: stringField(record, "first_seen_at"),
        lastSeenAt: stringField(record, "last_seen_at"),
        lastMaterialChangeAt: optionalStringField(record, "last_material_change_at"),
        createdAt: stringField(record, "created_at"),
        updatedAt: stringField(record, "updated_at")
      })),
      marketplaceAccounts: records(payload, "marketplace_accounts").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        marketplace: stringField(record, "marketplace"),
        merchantToken: optionalStringField(record, "merchant_token"),
        displayName: optionalStringField(record, "display_name"),
        profileUrl: optionalStringField(record, "profile_url"),
        storefrontUrl: optionalStringField(record, "storefront_url"),
        rating: optionalNumberField(record, "rating"),
        feedbackCount: optionalNumberField(record, "feedback_count"),
        positiveFeedbackPercent: optionalNumberField(record, "positive_feedback_percent"),
        countryHint: optionalStringField(record, "country_hint"),
        firstSeenAt: stringField(record, "first_seen_at"),
        lastSeenAt: stringField(record, "last_seen_at"),
        status: optionalStringField(record, "status") ?? undefined
      })),
      aliases: records(payload, "seller_aliases").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        alias: stringField(record, "alias"),
        normalizedAlias: stringField(record, "normalized_alias"),
        languageCode: optionalStringField(record, "language_code"),
        aliasType: stringField(record, "alias_type"),
        sourceId: optionalStringField(record, "source_id"),
        firstSeenAt: stringField(record, "first_seen_at"),
        lastSeenAt: stringField(record, "last_seen_at")
      })),
      scoreComponents: records(payload, "score_components").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        scoreType: stringField(record, "score_type"),
        ruleCode: stringField(record, "rule_code"),
        points: numberField(record, "points"),
        evidenceSourceId: optionalStringField(record, "evidence_source_id"),
        explanation: stringField(record, "explanation"),
        observedAt: stringField(record, "observed_at"),
        parserVersion: stringField(record, "parser_version")
      })),
      productLinks: records(payload, "product_links").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        productName: stringField(record, "product_name"),
        normalizedProductName: stringField(record, "normalized_product_name"),
        brand: optionalStringField(record, "brand"),
        normalizedBrand: optionalStringField(record, "normalized_brand"),
        category: optionalStringField(record, "category"),
        productUrl: optionalStringField(record, "product_url"),
        sourceId: optionalStringField(record, "source_id"),
        firstSeenAt: stringField(record, "first_seen_at"),
        lastSeenAt: stringField(record, "last_seen_at"),
        schemaVersion: numberField(record, "schema_version"),
        parserVersion: stringField(record, "parser_version"),
        status: optionalStringField(record, "status") ?? undefined
      }))
    },
    contacts: {
      contacts: records(payload, "contacts").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        contactType: stringField(record, "contact_type"),
        contactValueCiphertext: stringField(record, "contact_value_ciphertext"),
        normalizedHash: stringField(record, "normalized_hash"),
        displayValueMasked: optionalStringField(record, "display_value_masked"),
        classification: stringField(record, "classification"),
        confidence: numberField(record, "confidence"),
        sourceId: stringField(record, "source_id"),
        firstSeenAt: stringField(record, "first_seen_at"),
        lastSeenAt: stringField(record, "last_seen_at"),
        lastVerifiedAt: optionalStringField(record, "last_verified_at"),
        schemaVersion: numberField(record, "schema_version"),
        parserVersion: stringField(record, "parser_version"),
        status: optionalStringField(record, "status") ?? undefined,
        outreachEligible: optionalBooleanField(record, "outreach_eligible") ?? undefined
      })),
      suppressions: records(payload, "suppressions").map((record) => ({
        id: stringField(record, "id"),
        sellerId: optionalStringField(record, "seller_id"),
        contactHash: optionalStringField(record, "contact_hash"),
        domain: optionalStringField(record, "domain"),
        reason: stringField(record, "reason"),
        createdAt: stringField(record, "created_at"),
        expiresAt: optionalStringField(record, "expires_at")
      })),
      outreachStates: records(payload, "outreach_states").map((record) => ({
        id: stringField(record, "id"),
        sellerId: stringField(record, "seller_id"),
        contactId: optionalStringField(record, "contact_id"),
        outreachStatus: optionalStringField(record, "outreach_status") ?? undefined,
        channel: optionalStringField(record, "channel"),
        lastOutreachAt: optionalStringField(record, "last_outreach_at"),
        nextAllowedAt: optionalStringField(record, "next_allowed_at"),
        operatorNotes: optionalStringField(record, "operator_notes"),
        schemaVersion: numberField(record, "schema_version"),
        parserVersion: stringField(record, "parser_version"),
        updatedAt: stringField(record, "updated_at")
      })),
      auditEvents: records(payload, "audit_events").map((record) => ({
        id: stringField(record, "id"),
        eventType: stringField(record, "event_type"),
        entityType: stringField(record, "entity_type"),
        entityId: stringField(record, "entity_id"),
        actorId: optionalStringField(record, "actor_id"),
        oldValueHash: optionalStringField(record, "old_value_hash"),
        newValueHash: optionalStringField(record, "new_value_hash"),
        oldValueMasked: optionalStringField(record, "old_value_masked"),
        newValueMasked: optionalStringField(record, "new_value_masked"),
        reason: optionalStringField(record, "reason"),
        metadataJson: optionalStringField(record, "metadata_json"),
        createdAt: stringField(record, "created_at")
      }))
    },
    operations: {
      sources: records(payload, "sources").map((record) => ({
        id: stringField(record, "id"),
        sellerId: optionalStringField(record, "seller_id"),
        sourceUrl: stringField(record, "source_url"),
        canonicalUrl: stringField(record, "canonical_url"),
        sourceDomain: stringField(record, "source_domain"),
        sourceType: stringField(record, "source_type"),
        robotsStatus: optionalStringField(record, "robots_status"),
        termsRisk: optionalStringField(record, "terms_risk"),
        httpStatus: optionalNumberField(record, "http_status"),
        pageTitle: optionalStringField(record, "page_title"),
        evidenceSnippet: optionalStringField(record, "evidence_snippet"),
        contentHash: optionalStringField(record, "content_hash"),
        r2ObjectKey: optionalStringField(record, "r2_object_key"),
        detectedAt: optionalStringField(record, "detected_at"),
        lastSeenAt: optionalStringField(record, "last_seen_at"),
        firstSeenAt: stringField(record, "first_seen_at"),
        lastFetchedAt: optionalStringField(record, "last_fetched_at"),
        lastSuccessAt: optionalStringField(record, "last_success_at"),
        nextAllowedAt: optionalStringField(record, "next_allowed_at"),
        schemaVersion: numberField(record, "schema_version"),
        parserVersion: stringField(record, "parser_version"),
        status: optionalStringField(record, "status") ?? undefined
      })),
      crawlRuns: records(payload, "crawl_runs").map((record) => ({
        id: stringField(record, "id"),
        jobType: stringField(record, "job_type"),
        zyteJobId: optionalStringField(record, "zyte_job_id"),
        startedAt: stringField(record, "started_at"),
        finishedAt: optionalStringField(record, "finished_at"),
        status: stringField(record, "status"),
        requestsTotal: optionalNumberField(record, "requests_total") ?? undefined,
        responsesSuccess: optionalNumberField(record, "responses_success") ?? undefined,
        candidatesFound: optionalNumberField(record, "candidates_found") ?? undefined,
        recordsCreated: optionalNumberField(record, "records_created") ?? undefined,
        recordsUpdated: optionalNumberField(record, "records_updated") ?? undefined,
        contactsVerified: optionalNumberField(record, "contacts_verified") ?? undefined,
        blockedCount: optionalNumberField(record, "blocked_count") ?? undefined,
        errorCount: optionalNumberField(record, "error_count") ?? undefined,
        notes: optionalStringField(record, "notes")
      })),
      reviewQueueItems: records(payload, "review_queue_items").map((record) => ({
        id: stringField(record, "id"),
        reviewType: stringField(record, "review_type"),
        entityId: stringField(record, "entity_id"),
        priority: optionalNumberField(record, "priority") ?? undefined,
        payloadJson: stringField(record, "payload_json"),
        reason: stringField(record, "reason"),
        status: optionalStringField(record, "status") ?? undefined,
        createdAt: stringField(record, "created_at"),
        reviewedAt: optionalStringField(record, "reviewed_at"),
        reviewedBy: optionalStringField(record, "reviewed_by")
      })),
      sourceRegistry: records(payload, "source_registry").map((record) => ({
        adapterName: stringField(record, "adapter_name"),
        sourceFamily: stringField(record, "source_family"),
        enabled: optionalBooleanField(record, "enabled") ?? undefined,
        riskLevel: stringField(record, "risk_level"),
        robotsPolicy: stringField(record, "robots_policy"),
        termsReviewStatus: stringField(record, "terms_review_status"),
        dailyRequestBudget: optionalNumberField(record, "daily_request_budget") ?? undefined,
        concurrencyPerDomain: optionalNumberField(record, "concurrency_per_domain") ?? undefined,
        minimumDelaySeconds: optionalNumberField(record, "minimum_delay_seconds") ?? undefined,
        blockedUntil: optionalStringField(record, "blocked_until"),
        parserVersion: stringField(record, "parser_version"),
        lastSuccessAt: optionalStringField(record, "last_success_at"),
        lastFailureAt: optionalStringField(record, "last_failure_at"),
        operatorNotes: optionalStringField(record, "operator_notes")
      })),
      quotaStates: records(payload, "quota_states").map((record) => ({
        quotaName: stringField(record, "quota_name"),
        windowStart: stringField(record, "window_start"),
        used: optionalNumberField(record, "used") ?? undefined,
        softLimit: numberField(record, "soft_limit"),
        hardLimit: numberField(record, "hard_limit"),
        updatedAt: stringField(record, "updated_at")
      })),
      featureFlags: records(payload, "feature_flags").map((record) => ({
        flagName: stringField(record, "flag_name"),
        enabled: optionalBooleanField(record, "enabled") ?? undefined,
        source: optionalStringField(record, "source") ?? undefined,
        updatedAt: stringField(record, "updated_at"),
        operatorNotes: optionalStringField(record, "operator_notes")
      }))
    },
    history: {
      fieldHistory: records(payload, "field_history").map((record) => ({
        id: stringField(record, "id"),
        entityType: stringField(record, "entity_type"),
        entityId: stringField(record, "entity_id"),
        fieldName: stringField(record, "field_name"),
        oldValueHash: optionalStringField(record, "old_value_hash"),
        newValueHash: optionalStringField(record, "new_value_hash"),
        oldValueMasked: optionalStringField(record, "old_value_masked"),
        newValueMasked: optionalStringField(record, "new_value_masked"),
        sourceId: optionalStringField(record, "source_id"),
        observedAt: stringField(record, "observed_at"),
        crawlRunId: optionalStringField(record, "crawl_run_id"),
        actorType: optionalStringField(record, "actor_type") ?? undefined,
        actorId: optionalStringField(record, "actor_id"),
        changeReason: optionalStringField(record, "change_reason"),
        diffJson: optionalStringField(record, "diff_json"),
        schemaVersion: numberField(record, "schema_version")
      })),
      recentDiffMetadata: records(payload, "recent_diff_metadata").map((record) => ({
        id: stringField(record, "id"),
        entityType: stringField(record, "entity_type"),
        entityId: stringField(record, "entity_id"),
        latestFieldHistoryId: optionalStringField(record, "latest_field_history_id"),
        diffCount30d: optionalNumberField(record, "diff_count_30d") ?? undefined,
        lastObservedAt: stringField(record, "last_observed_at"),
        schemaVersion: numberField(record, "schema_version"),
        updatedAt: stringField(record, "updated_at")
      }))
    }
  };
}

export function records(payload: JsonObject, fieldName: ArrayName): JsonObject[] {
  const value = payload[fieldName];
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function requireFields(record: JsonObject, fields: string[], path: string, errors: string[]): void {
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null || record[field] === "") {
      errors.push(`${path}.${field} is required`);
    }
  }
}

function validateFieldTypes(
  record: JsonObject,
  allowedFields: Record<string, FieldType>,
  path: string,
  errors: string[]
): void {
  for (const [field, value] of Object.entries(record)) {
    const fieldType = allowedFields[field];
    if (!fieldType) {
      errors.push(`${path}.${field} is not allowed`);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const error = validateFieldType(value, fieldType);
    if (error) {
      errors.push(`${path}.${field} ${error}`);
    }
  }
}

function validateFieldType(value: unknown, fieldType: FieldType): string | null {
  switch (fieldType) {
    case "array":
      return Array.isArray(value) ? null : "must be an array";
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean";
    case "confidence":
      return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
        ? null
        : "must be an integer between 0 and 100";
    case "integer":
      return Number.isInteger(value) ? null : "must be an integer";
    case "nonEmptyString":
      return typeof value === "string" && value.length > 0
        ? null
        : "must be a non-empty string";
    case "nonNegativeInteger":
      return Number.isInteger(value) && Number(value) >= 0 ? null : "must be a non-negative integer";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a finite number";
    case "positiveInteger":
      return Number.isInteger(value) && Number(value) >= 1 ? null : "must be a positive integer";
    case "string":
      return typeof value === "string" ? null : "must be a string";
    default:
      return "has an unsupported schema type";
  }
}

function validateUuidFields(record: JsonObject, path: string, errors: string[]): void {
  for (const field of uuidFields) {
    const value = record[field];
    if (typeof value === "string" && !isUuidV7Compatible(value)) {
      errors.push(`${path}.${field} must be a UUIDv7-compatible text identifier`);
    }
  }
}

function arrayLength(record: JsonObject, fieldName: ArrayName): number {
  const value = record[fieldName];
  return Array.isArray(value) ? value.length : 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonObject, fieldName: string): string {
  return record[fieldName] as string;
}

function numberField(record: JsonObject, fieldName: string): number {
  return record[fieldName] as number;
}

function optionalStringField(record: JsonObject, fieldName: string): string | null {
  const value = record[fieldName];
  return typeof value === "string" ? value : null;
}

function optionalNumberField(record: JsonObject, fieldName: string): number | null {
  const value = record[fieldName];
  return typeof value === "number" ? value : null;
}

function optionalBooleanField(record: JsonObject, fieldName: string): boolean | null {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : null;
}
