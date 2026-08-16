import { ContactsRepository } from "../repositories/contacts";
import { CoreRepository, type SellerRow } from "../repositories/core";
import { deterministicUuidV7 } from "../repositories/ids";
import type {
  EntityResolutionDecisionWrite,
  SellerMergeLinkAuditWrite,
  SellerWrite
} from "../repositories/types";
import type { UnitOfWorkChanges } from "../repositories/unit-of-work";
import type { RuntimeEnv } from "../validation/startup";

const PARSER_VERSION = "entity-resolution-v1";

interface ScoreComponent {
  rule_code: string;
  points: number;
  explanation: string;
}

interface ScoredCandidate {
  seller: SellerRow;
  score: number;
  components: ScoreComponent[];
}

export async function prepareEntityResolution(
  changes: UnitOfWorkChanges,
  env: RuntimeEnv
): Promise<UnitOfWorkChanges> {
  const sellers = changes.core?.sellers ?? [];
  if (sellers.length === 0 || !env.CORE_DB || !env.CONTACTS_DB) return changes;

  const core = new CoreRepository(env.CORE_DB);
  const contacts = new ContactsRepository(env.CONTACTS_DB);
  changes.core ??= {};
  changes.operations ??= {};
  changes.core.resolutionDecisions ??= [];
  changes.core.mergeRedirects ??= [];
  changes.core.mergeLinkAudits ??= [];
  changes.operations.reviewQueueItems ??= [];

  for (const candidate of sellers) {
    const possibleMatches = await core.findResolutionCandidates(candidate);
    if (possibleMatches.length === 0) continue;
    const incomingHashes = new Set(
      (changes.contacts?.contacts ?? [])
        .filter((contact) => contact.sellerId === candidate.id)
        .map((contact) => contact.normalizedHash)
    );
    const scored: ScoredCandidate[] = [];
    for (const existing of possibleMatches) {
      const existingHashes = await contacts.getNormalizedHashesForSeller(existing.id);
      scored.push(scoreCandidate(candidate, existing, incomingHashes, new Set(existingHashes)));
    }
    const best = scored.sort(
      (left, right) => right.score - left.score || left.seller.id.localeCompare(right.seller.id)
    )[0];
    if (!best || best.components.length === 0) continue;

    const action = best.score >= 92 ? "auto_merge" : best.score >= 70 ? "review_queue" : "no_merge";
    const createdAt = candidate.updatedAt;
    const decisionId = await deterministicUuidV7(
      "entity-resolution-decision",
      `${candidate.id}:${best.seller.id}:${PARSER_VERSION}`
    );
    const persistedDecision = await core.getResolutionDecision(decisionId);
    if (persistedDecision) {
      if (persistedDecision.status === "merged") {
        changes.core.mergeLinkAudits.push(
          ...automaticMergeLinkAudits(
            changes,
            decisionId,
            candidate.id,
            persistedDecision.matched_seller_id,
            createdAt
          )
        );
        remapIncomingSellerLinks(changes, candidate.id, persistedDecision.matched_seller_id);
        candidate.status = "merged";
      }
      continue;
    }
    const rollbackPlan = {
      strategy: "restore_only_rows_recorded_in_seller_merge_link_audit",
      source_seller_id: candidate.id,
      target_seller_id: best.seller.id
    };
    const decision: EntityResolutionDecisionWrite = {
      id: decisionId,
      candidateSellerId: candidate.id,
      matchedSellerId: best.seller.id,
      action,
      score: best.score,
      scoreBreakdownJson: JSON.stringify(best.components),
      mergeAuditJson:
        action === "auto_merge"
          ? JSON.stringify({ actor: "system:entity-resolution-v1", mode: "deterministic" })
          : null,
      rollbackPlanJson: action === "auto_merge" ? JSON.stringify(rollbackPlan) : null,
      parserVersion: PARSER_VERSION,
      schemaVersion: 1,
      status: action === "auto_merge" ? "merged" : action === "no_merge" ? "no_merge" : "pending",
      createdAt,
      decidedAt: action === "review_queue" ? null : createdAt,
      decidedBy: action === "review_queue" ? null : "system:entity-resolution-v1"
    };
    changes.core.resolutionDecisions.push(decision);

    if (action === "review_queue") {
      const reviewId = await deterministicUuidV7("entity-resolution-review", decisionId);
      changes.operations.reviewQueueItems.push({
        id: reviewId,
        reviewType: "possible_duplicate_seller",
        entityId: decisionId,
        priority: best.score >= 85 ? 1 : 2,
        payloadJson: JSON.stringify({
          decision_id: decisionId,
          candidate_seller_id: candidate.id,
          matched_seller_id: best.seller.id,
          score: best.score,
          components: best.components
        }),
        reason: `entity_resolution_score_${best.score}`,
        status: "pending",
        createdAt
      });
    }

    if (action === "auto_merge") {
      const linkAudits = automaticMergeLinkAudits(
        changes,
        decisionId,
        candidate.id,
        best.seller.id,
        createdAt
      );
      changes.core.mergeLinkAudits.push(...linkAudits);
      changes.core.mergeRedirects.push({
        sourceSellerId: candidate.id,
        targetSellerId: best.seller.id,
        decisionId,
        reason: `deterministic entity resolution score ${best.score}`,
        createdAt
      });
      remapIncomingSellerLinks(changes, candidate.id, best.seller.id);
      candidate.status = "merged";
    }
  }
  return changes;
}

function scoreCandidate(
  candidate: SellerWrite,
  existing: SellerRow,
  candidateHashes: Set<string>,
  existingHashes: Set<string>
): ScoredCandidate {
  const components: ScoreComponent[] = [];
  const candidateDomain = clean(candidate.officialDomain);
  const existingDomain = clean(existing.official_domain);
  if (candidateDomain && existingDomain) {
    components.push(
      candidateDomain === existingDomain
        ? component("official_domain_match", 52, "Canonical official domains match exactly.")
        : component("official_domain_conflict", -30, "Canonical official domains differ.")
    );
  }
  const candidateName = clean(candidate.normalizedName);
  const existingName = clean(existing.normalized_name);
  if (candidateName && candidateName === existingName) {
    components.push(component("normalized_name_exact", 40, "Normalized seller names match."));
  } else if (candidateName && existingName) {
    const similarity = diceSimilarity(candidateName, existingName);
    if (similarity >= 0.96) components.push(component("name_fuzzy_very_high", 32, "Names are a very high match."));
    else if (similarity >= 0.9) components.push(component("name_fuzzy_high", 25, "Names are a high match."));
    else if (similarity >= 0.84) components.push(component("name_fuzzy_medium", 18, "Names are a medium match."));
    else if (similarity >= 0.78) components.push(component("name_fuzzy_low", 10, "Names are a low match."));
  }
  const overlap = [...candidateHashes].filter((value) => existingHashes.has(value)).length;
  if (overlap > 0) {
    components.push(component("contact_hash_overlap", Math.min(45, 30 + 5 * overlap), "Public contact hashes overlap."));
  }
  const candidateCountry = clean(candidate.countryCode);
  const existingCountry = clean(existing.country_code);
  if (candidateCountry && existingCountry) {
    components.push(
      candidateCountry === existingCountry
        ? component("country_match", 6, "Country codes match.")
        : component("country_conflict", -18, "Country codes differ.")
    );
  }
  const candidateCity = clean(candidate.city);
  const existingCity = clean(existing.city);
  if (candidateCity && existingCity && candidateCountry === existingCountry) {
    components.push(
      candidateCity === existingCity
        ? component("city_match", 4, "Cities match within the same country.")
        : component("city_conflict", -8, "Cities differ within the same country.")
    );
  }
  return {
    seller: existing,
    components,
    score: Math.max(0, Math.min(100, components.reduce((total, item) => total + item.points, 0)))
  };
}

function automaticMergeLinkAudits(
  changes: UnitOfWorkChanges,
  decisionId: string,
  sourceSellerId: string,
  targetSellerId: string,
  createdAt: string
): SellerMergeLinkAuditWrite[] {
  const rows: Array<[string, string]> = [];
  const add = (tableName: string, records: Array<{ id: string; sellerId: string }> | undefined) => {
    for (const record of records ?? []) if (record.sellerId === sourceSellerId) rows.push([tableName, record.id]);
  };
  add("marketplace_accounts", changes.core?.marketplaceAccounts);
  add("seller_aliases", changes.core?.aliases);
  add("score_components", changes.core?.scoreComponents);
  add("seller_product_links", changes.core?.productLinks);
  add("contacts", changes.contacts?.contacts);
  add("outreach_state", changes.contacts?.outreachStates);
  add(
    "suppression_list",
    (changes.contacts?.suppressions ?? []).filter(
      (row): row is typeof row & { sellerId: string } => Boolean(row.sellerId)
    )
  );
  add("sources", (changes.operations?.sources ?? []).filter((row): row is typeof row & { sellerId: string } => Boolean(row.sellerId)));
  for (const row of changes.history?.fieldHistory ?? []) {
    if (row.entityType === "seller" && row.entityId === sourceSellerId) {
      rows.push(["field_history", row.id]);
    }
  }
  for (const row of changes.history?.recentDiffMetadata ?? []) {
    if (row.entityType === "seller" && row.entityId === sourceSellerId) {
      rows.push(["recent_diff_metadata", row.id]);
    }
  }
  return rows.map(([tableName, rowId]) => ({
    decisionId,
    tableName,
    rowId,
    originalSellerId: sourceSellerId,
    targetSellerId,
    createdAt
  }));
}

function remapIncomingSellerLinks(changes: UnitOfWorkChanges, source: string, target: string): void {
  const remap = (records: Array<{ sellerId: string }> | undefined) => {
    for (const record of records ?? []) if (record.sellerId === source) record.sellerId = target;
  };
  remap(changes.core?.marketplaceAccounts);
  remap(changes.core?.aliases);
  remap(changes.core?.scoreComponents);
  remap(changes.core?.productLinks);
  remap(changes.contacts?.contacts);
  remap(changes.contacts?.outreachStates);
  remap(
    (changes.contacts?.suppressions ?? []).filter(
      (row): row is typeof row & { sellerId: string } => Boolean(row.sellerId)
    )
  );
  remap(
    (changes.operations?.sources ?? []).filter(
      (row): row is typeof row & { sellerId: string } => Boolean(row.sellerId)
    )
  );
  for (const row of changes.history?.fieldHistory ?? []) {
    if (row.entityType === "seller" && row.entityId === source) row.entityId = target;
  }
  for (const row of changes.history?.recentDiffMetadata ?? []) {
    if (row.entityType === "seller" && row.entityId === source) row.entityId = target;
  }
}

function component(rule_code: string, points: number, explanation: string): ScoreComponent {
  return { rule_code, points, explanation };
}

function clean(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const pair of rightPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let overlap = 0;
  for (const pair of leftPairs) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ");
  return Array.from({ length: Math.max(0, normalized.length - 1) }, (_, index) => normalized.slice(index, index + 2));
}
