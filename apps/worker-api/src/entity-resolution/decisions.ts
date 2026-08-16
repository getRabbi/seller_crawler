import type {
  DuplicateDecisionAction,
  DuplicateDecisionResponse
} from "@seller-intelligence/shared-types/dashboard";

import { ContactsRepository } from "../repositories/contacts";
import { CoreRepository } from "../repositories/core";
import { HistoryRepository } from "../repositories/history";
import { deterministicUuidV7 } from "../repositories/ids";
import { OperationsRepository } from "../repositories/operations";
import type { RuntimeEnv } from "../validation/startup";

export class DuplicateDecisionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function applyDuplicateDecision(
  env: RuntimeEnv,
  decisionId: string,
  action: DuplicateDecisionAction,
  actorId: string,
  reason: string
): Promise<DuplicateDecisionResponse> {
  if (!env.CORE_DB || !env.CONTACTS_DB || !env.OPS_DB || !env.HISTORY_DB) {
    throw new DuplicateDecisionError(503, "database_unavailable", "Required database binding is unavailable.");
  }
  const core = new CoreRepository(env.CORE_DB);
  const contacts = new ContactsRepository(env.CONTACTS_DB);
  const operations = new OperationsRepository(env.OPS_DB);
  const history = new HistoryRepository(env.HISTORY_DB);
  const decision = await core.getResolutionDecision(decisionId);
  if (!decision) throw new DuplicateDecisionError(404, "duplicate_not_found", "Duplicate decision not found.");

  const expectedStatus = actionStatus(action);
  const decidedAt = new Date().toISOString();
  if (decision.status === expectedStatus) {
    await writeDecisionAudit(
      contacts,
      decisionId,
      action,
      actorId,
      reason,
      decision.candidate_seller_id,
      decision.matched_seller_id,
      decidedAt
    );
    return { decisionId, action, status: decision.status, duplicate: true, decidedAt };
  }
  if (action === "rollback") {
    if (decision.status !== "merged") {
      throw new DuplicateDecisionError(409, "decision_conflict", "Only a merged decision can be rolled back.");
    }
    const links = await core.listMergeLinkAudits(decisionId);
    await core.restoreCoreMergeLinks(links, decidedAt);
    await contacts.restoreSellerLinks(links);
    await operations.restoreSellerLinks(links);
    await history.restoreSellerLinks(links);
    await core.setSellerStatus(decision.candidate_seller_id, "active", decidedAt);
    await core.markMergeRolledBack(decisionId, decidedAt);
    await core.updateResolutionDecision(decisionId, "rolled_back", actorId, decidedAt);
    await operations.resolveReviewByEntity(decisionId, "rolled_back", decidedAt, actorId);
  } else {
    if (decision.status !== "pending") {
      throw new DuplicateDecisionError(409, "decision_conflict", "Duplicate decision was already resolved differently.");
    }
    if (action === "merge") {
      const allLinks = (
        await Promise.all([
          core.listCoreSellerLinks(decision.candidate_seller_id),
          contacts.listSellerLinks(decision.candidate_seller_id),
          operations.listSellerLinks(decision.candidate_seller_id),
          history.listSellerLinks(decision.candidate_seller_id)
        ])
      ).flat();
      for (const link of allLinks) {
        await core.upsertMergeLinkAudit({
          decisionId,
          tableName: link.tableName,
          rowId: link.rowId,
          originalSellerId: decision.candidate_seller_id,
          targetSellerId: decision.matched_seller_id,
          createdAt: decidedAt
        });
      }
      await core.reassignCoreSellerLinks(decision.candidate_seller_id, decision.matched_seller_id);
      await contacts.reassignSellerLinks(decision.candidate_seller_id, decision.matched_seller_id);
      await operations.reassignSellerLinks(decision.candidate_seller_id, decision.matched_seller_id);
      await history.reassignSellerLinks(decision.candidate_seller_id, decision.matched_seller_id);
      await core.upsertMergeRedirect({
        sourceSellerId: decision.candidate_seller_id,
        targetSellerId: decision.matched_seller_id,
        decisionId,
        reason,
        createdAt: decidedAt
      });
      await core.updateResolutionDecision(
        decisionId,
        "merged",
        actorId,
        decidedAt,
        JSON.stringify({ actor: actorId, reason, linked_rows: allLinks.length }),
        JSON.stringify({ strategy: "seller_merge_link_audit", decision_id: decisionId })
      );
    } else {
      await core.updateResolutionDecision(decisionId, expectedStatus, actorId, decidedAt);
    }
    await operations.resolveReviewByEntity(decisionId, expectedStatus, decidedAt, actorId);
  }

  await writeDecisionAudit(
    contacts,
    decisionId,
    action,
    actorId,
    reason,
    decision.candidate_seller_id,
    decision.matched_seller_id,
    decidedAt
  );
  return { decisionId, action, status: expectedStatus, duplicate: false, decidedAt };
}

async function writeDecisionAudit(
  contacts: ContactsRepository,
  decisionId: string,
  action: DuplicateDecisionAction,
  actorId: string,
  reason: string,
  candidateSellerId: string,
  matchedSellerId: string,
  createdAt: string
): Promise<void> {
  await contacts.insertAuditEvent({
    id: await deterministicUuidV7("duplicate-decision-audit", `${decisionId}:${action}`),
    eventType: `duplicate_${action}`,
    entityType: "entity_resolution_decision",
    entityId: decisionId,
    actorId,
    reason,
    metadataJson: JSON.stringify({
      action,
      candidate_seller_id: candidateSellerId,
      matched_seller_id: matchedSellerId
    }),
    createdAt
  });
}

function actionStatus(action: DuplicateDecisionAction): string {
  if (action === "merge") return "merged";
  if (action === "keep_separate") return "kept_separate";
  if (action === "ignore") return "ignored";
  return "rolled_back";
}
