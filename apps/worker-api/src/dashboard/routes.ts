import type { ApiErrorPayload } from "@seller-intelligence/shared-types/dashboard";

import { csvResponse } from "./csv";
import {
  DashboardRepository,
  exportListOptions,
  parseContactListOptions,
  parseListOptions
} from "./repository";
import type { RuntimeEnv } from "../validation/startup";

const SELLER_DETAIL_PATH = /^\/v1\/sellers\/([0-9a-f-]{36})$/i;

export function isDashboardRoute(pathname: string): boolean {
  return (
    pathname === "/v1/sellers" ||
    SELLER_DETAIL_PATH.test(pathname) ||
    pathname === "/v1/contacts" ||
    pathname === "/v1/duplicates" ||
    pathname === "/v1/crawl-runs" ||
    pathname === "/v1/search" ||
    pathname === "/v1/export.csv"
  );
}

export async function dashboardResponse(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url);
  const repository = new DashboardRepository(env);

  try {
    if (url.pathname === "/v1/sellers" || url.pathname === "/v1/search") {
      return json(await repository.listSellers(parseListOptions(url)));
    }
    const detailMatch = url.pathname.match(SELLER_DETAIL_PATH);
    if (detailMatch) {
      const detail = await repository.getSeller(detailMatch[1]);
      return detail ? json(detail) : errorResponse(404, "seller_not_found", "Seller not found.");
    }
    if (url.pathname === "/v1/contacts") {
      return json(await repository.listContacts(parseContactListOptions(url)));
    }
    if (url.pathname === "/v1/duplicates") {
      return json(await repository.listDuplicates(parseListOptions(url)));
    }
    if (url.pathname === "/v1/crawl-runs") {
      return json(await repository.listCrawlRuns(parseListOptions(url)));
    }
    if (url.pathname === "/v1/export.csv") {
      return exportResponse(url, repository);
    }
    return errorResponse(404, "not_found", "Route not found.");
  } catch (error) {
    console.error("dashboard_api_error", {
      path: url.pathname,
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return errorResponse(503, "database_unavailable", "Dashboard data is temporarily unavailable.");
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

async function exportResponse(url: URL, repository: DashboardRepository): Promise<Response> {
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
  return errorResponse(400, "invalid_dataset", "dataset must be sellers or contacts.");
}
