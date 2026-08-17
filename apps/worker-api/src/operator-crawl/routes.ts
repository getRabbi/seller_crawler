import { errorResponse } from "../dashboard/routes";
import type { RuntimeEnv } from "../validation/startup";
import { OperatorCrawlError, OperatorCrawlService } from "./service";

const UUID_V7 = "([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const DETAIL = new RegExp(`^/v1/crawl-runs/${UUID_V7}$`, "i");
const CANCEL = new RegExp(`^/v1/crawl-runs/${UUID_V7}/cancel$`, "i");
const RETRY = new RegExp(`^/v1/crawl-runs/${UUID_V7}/retry$`, "i");

export function isOperatorCrawlRoute(pathname: string): boolean {
  return pathname === "/v1/crawl-runs" || DETAIL.test(pathname) || CANCEL.test(pathname) || RETRY.test(pathname);
}

export async function operatorCrawlResponse(
  request: Request,
  env: RuntimeEnv,
  actorId: string
): Promise<Response> {
  const url = new URL(request.url);
  const service = new OperatorCrawlService(env);
  try {
    if (request.method === "POST" && url.pathname === "/v1/crawl-runs") {
      const originError = validateOrigin(request, env);
      if (originError) return originError;
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return errorResponse(415, "content_type_required", "Crawl requests must use application/json.");
      }
      const length = Number(request.headers.get("content-length") ?? "0");
      if (length > 32_768) return errorResponse(413, "crawl_request_too_large", "Crawl request exceeds 32 KiB.");
      return json(await service.create(await request.json(), actorId), 201);
    }
    if (request.method === "GET" && url.pathname === "/v1/crawl-runs") {
      const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 100);
      const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10_000);
      const status = cleanText(url.searchParams.get("status"), 32);
      return json(await service.list(limit, offset, status));
    }
    const detail = url.pathname.match(DETAIL);
    if (request.method === "GET" && detail) {
      const result = await service.detail(detail[1]);
      return result ? json(result) : errorResponse(404, "crawl_run_not_found", "Crawl run was not found.");
    }
    const cancel = url.pathname.match(CANCEL);
    if (request.method === "POST" && cancel) {
      const originError = validateOrigin(request, env);
      return originError ?? json(await service.cancel(cancel[1], actorId));
    }
    const retry = url.pathname.match(RETRY);
    if (request.method === "POST" && retry) {
      const originError = validateOrigin(request, env);
      return originError ?? json(await service.retry(retry[1], actorId), 201);
    }
    return errorResponse(404, "not_found", "Route not found.");
  } catch (error) {
    if (error instanceof OperatorCrawlError) return errorResponse(error.status, error.code, error.message);
    console.error("operator_crawl_error", {
      path: url.pathname,
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return errorResponse(503, "operator_crawl_unavailable", "Crawl control is temporarily unavailable.");
  }
}

export async function pumpOperatorQueue(env: RuntimeEnv): Promise<void> {
  try {
    await new OperatorCrawlService(env).pump();
  } catch (error) {
    console.error("operator_crawl_pump_error", {
      message: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

function validateOrigin(request: Request, env: RuntimeEnv): Response | null {
  if (env.APP_ENV === "local") return null;
  const origin = request.headers.get("origin");
  if (!origin || !env.DASHBOARD_ORIGIN || origin !== env.DASHBOARD_ORIGIN) {
    return errorResponse(403, "origin_denied", "Mutation origin is not allowed.");
  }
  return null;
}

function boundedInteger(raw: string | null, fallback: number, minimum: number, maximum: number): number {
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  return Math.min(maximum, Math.max(minimum, Number(raw)));
}

function cleanText(raw: string | null, maximumLength: number): string | undefined {
  const value = raw?.trim();
  return value ? value.slice(0, maximumLength) : undefined;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }
  });
}
