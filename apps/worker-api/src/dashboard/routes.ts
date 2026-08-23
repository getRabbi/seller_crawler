import type { ApiErrorPayload } from "@seller-intelligence/shared-types/dashboard";

import { csvResponse } from "./csv";
import {
  DashboardRepository,
  exportListOptions,
  parseContactListOptions,
  parseListOptions
} from "./repository";
import type { RuntimeEnv } from "../validation/startup";
import type { DuplicateDecisionAction } from "@seller-intelligence/shared-types/dashboard";
import { applyDuplicateDecision, DuplicateDecisionError } from "../entity-resolution/decisions";
import { OperatorCrawlService } from "../operator-crawl/service";

const UUID_V7 = "([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const SELLER_DETAIL_PATH = new RegExp(`^/v1/sellers/${UUID_V7}$`, "i");
const CONTACT_REVEAL_PATH = new RegExp(`^/v1/contacts/${UUID_V7}/reveal$`, "i");
const DUPLICATE_DECISION_PATH = new RegExp(`^/v1/duplicates/${UUID_V7}/decision$`, "i");

export function isDashboardRoute(pathname: string): boolean {
  return (
    pathname === "/v1/sellers" ||
    SELLER_DETAIL_PATH.test(pathname) ||
    pathname === "/v1/contacts" ||
    CONTACT_REVEAL_PATH.test(pathname) ||
    pathname === "/v1/duplicates" ||
    DUPLICATE_DECISION_PATH.test(pathname) ||
    pathname === "/v1/search" ||
    pathname === "/v1/metrics" ||
    pathname === "/v1/export.csv"
  );
}

export async function dashboardResponse(
  request: Request,
  env: RuntimeEnv,
  actorId = "local-operator"
): Promise<Response> {
  const url = new URL(request.url);
  const repository = new DashboardRepository(env);

  try {
    if (
      request.method === "GET" &&
      (url.pathname === "/v1/sellers" || url.pathname === "/v1/search")
    ) {
      return json(await repository.listSellers(parseListOptions(url)));
    }
    const detailMatch = url.pathname.match(SELLER_DETAIL_PATH);
    if (request.method === "GET" && detailMatch) {
      const detail = await repository.getSeller(detailMatch[1]);
      return detail ? json(detail) : errorResponse(404, "seller_not_found", "Seller not found.");
    }
    if (request.method === "GET" && url.pathname === "/v1/contacts") {
      return json(await repository.listContacts(parseContactListOptions(url)));
    }
    if (request.method === "GET" && url.pathname === "/v1/metrics") {
      return json(await repository.metrics());
    }
    const revealMatch = url.pathname.match(CONTACT_REVEAL_PATH);
    if (request.method === "POST" && revealMatch) {
      const originError = validateMutationOrigin(request, env);
      if (originError) return originError;
      const reason = await readReason(request);
      if (!reason) {
        return errorResponse(400, "reveal_reason_required", "A reveal reason is required.");
      }
      const revealed = await repository.revealContact(revealMatch[1], actorId, reason);
      return revealed
        ? json(revealed)
        : errorResponse(404, "contact_not_found", "Contact not found or unavailable.");
    }
    if (request.method === "GET" && url.pathname === "/v1/duplicates") {
      return json(await repository.listDuplicates(parseListOptions(url)));
    }
    const duplicateMatch = url.pathname.match(DUPLICATE_DECISION_PATH);
    if (request.method === "POST" && duplicateMatch) {
      const originError = validateMutationOrigin(request, env);
      if (originError) return originError;
      const input = await readDuplicateDecision(request);
      if (!input) {
        return errorResponse(
          400,
          "duplicate_decision_invalid",
          "action and reason are required for a duplicate decision."
        );
      }
      return json(
        await applyDuplicateDecision(env, duplicateMatch[1], input.action, actorId, input.reason)
      );
    }
    if (request.method === "GET" && url.pathname === "/v1/export.csv") {
      return exportResponse(url, repository, env);
    }
    return errorResponse(404, "not_found", "Route not found.");
  } catch (error) {
    if (error instanceof DuplicateDecisionError) {
      return errorResponse(error.status, error.code, error.message);
    }
    console.error("dashboard_api_error", {
      path: url.pathname,
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return errorResponse(503, "database_unavailable", "Dashboard data is temporarily unavailable.");
  }
}

async function readDuplicateDecision(
  request: Request
): Promise<{ action: DuplicateDecisionAction; reason: string } | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    const body = (await request.json()) as { action?: unknown; reason?: unknown };
    const actions = new Set<DuplicateDecisionAction>([
      "merge",
      "keep_separate",
      "ignore",
      "rollback"
    ]);
    const action = typeof body.action === "string" ? body.action : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
    return actions.has(action as DuplicateDecisionAction) && reason
      ? { action: action as DuplicateDecisionAction, reason }
      : null;
  } catch {
    return null;
  }
}

function validateMutationOrigin(request: Request, env: RuntimeEnv): Response | null {
  if (env.APP_ENV === "local") return null;
  const origin = request.headers.get("origin");
  if (!origin || !env.DASHBOARD_ORIGIN || origin !== env.DASHBOARD_ORIGIN) {
    return errorResponse(403, "origin_denied", "Mutation origin is not allowed.");
  }
  return null;
}

async function readReason(request: Request): Promise<string | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    const body = (await request.json()) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    return reason ? reason.slice(0, 240) : null;
  } catch {
    return null;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store"
    }
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  const payload: ApiErrorPayload = { error: { code, message } };
  return json(payload, status);
}

async function exportResponse(
  url: URL,
  repository: DashboardRepository,
  env: RuntimeEnv
): Promise<Response> {
  const dataset = url.searchParams.get("dataset") ?? "sellers";
  if (dataset === "sellers") {
    const result = await repository.listSellers(exportListOptions(url));
    return csvResponse(
      "seller-intelligence-sellers.csv",
      [
        "id",
        "canonical_name",
        "legal_name",
        "country_code",
        "province",
        "city",
        "official_domain",
        "identity_confidence",
        "quality_score",
        "status",
        "last_seen_at"
      ],
      result.items.map((seller) => [
        seller.id,
        seller.canonicalName,
        seller.legalName,
        seller.countryCode,
        seller.province,
        seller.city,
        seller.officialDomain,
        seller.identityConfidence,
        seller.qualityScore,
        seller.status,
        seller.lastSeenAt
      ])
    );
  }
  if (dataset === "contacts") {
    const result = await repository.listContacts({
      ...parseContactListOptions(url),
      limit: repository.exportLimit(),
      offset: 0
    });
    return csvResponse(
      "seller-intelligence-contacts.csv",
      [
        "id",
        "seller_id",
        "seller_name",
        "contact_type",
        "display_value_masked",
        "classification",
        "confidence",
        "status",
        "last_seen_at"
      ],
      result.items.map((contact) => [
        contact.id,
        contact.sellerId,
        contact.sellerName,
        contact.contactType,
        contact.displayValueMasked,
        contact.classification,
        contact.confidence,
        contact.status,
        contact.lastSeenAt
      ])
    );
  }
  if (dataset === "crawls") {
    const result = await new OperatorCrawlService(env).listSnapshot(repository.exportLimit(), 0);
    return csvResponse(
      "seller-intelligence-crawl-runs.csv",
      [
        "id",
        "mode",
        "job_type",
        "query",
        "marketplace",
        "country_codes",
        "requested_sellers",
        "discovered_sellers",
        "enriched_sellers",
        "contacts_found",
        "status",
        "stage",
        "zyte_job_id",
        "requested_at",
        "started_at",
        "finished_at",
        "requests_total",
        "responses_success",
        "blocked_count",
        "error_count",
        "warnings",
        "error_code",
        "error_message"
      ],
      result.items.map((run) => [
        run.id,
        run.mode ?? null,
        run.jobType,
        run.query?.join(" | ") ?? null,
        run.marketplace ?? null,
        run.countryCodes?.join(" | ") ?? null,
        run.requestedSellerCount ?? 0,
        run.discoveredSellers ?? run.candidatesFound,
        run.enrichedSellers ?? run.recordsUpdated,
        run.contactsFound ?? run.contactsVerified,
        run.status,
        run.stage ?? null,
        run.zyteJobId,
        run.requestedAt ?? run.startedAt,
        run.startedAt,
        run.finishedAt,
        run.requestsTotal,
        run.responsesSuccess,
        run.blockedCount,
        run.errorCount,
        run.warnings?.join(" | ") ?? null,
        run.errorCode ?? null,
        run.errorMessage ?? null
      ])
    );
  }
  return errorResponse(
    400,
    "invalid_dataset",
    "dataset must be sellers, contacts, or crawls."
  );
}
