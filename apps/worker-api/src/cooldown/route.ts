import { constantTimeEqualHex, hmacSha256Hex, sha256Hex } from "../ingestion/crypto";
import { errorResponse, jsonResponse } from "../ingestion/errors";
import { OperationsRepository } from "../repositories/operations";
import type { RuntimeEnv } from "../validation/startup";

const CRAWLER_USER_AGENT = "seller-intelligence-crawler/1.0";
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isCooldownRoute(pathname: string): boolean {
  return pathname === "/v1/crawl/authorize";
}

export async function cooldownAuthorizationResponse(
  request: Request,
  env: RuntimeEnv
): Promise<Response> {
  if (!env.INGESTION_HMAC_SECRET || !env.OPS_DB) {
    return errorResponse("cooldown_not_configured", "Cooldown authorization is not configured.", 503);
  }
  if (request.headers.get("user-agent") !== CRAWLER_USER_AGENT) {
    return errorResponse("crawler_user_agent_required", "Required crawler User-Agent is missing.", 403);
  }
  const timestamp = request.headers.get("x-si-timestamp") ?? "";
  const nonce = request.headers.get("x-si-nonce") ?? "";
  const signature = request.headers.get("x-si-signature") ?? "";
  if (!timestamp || !nonce || !signature) {
    return errorResponse("missing_cooldown_header", "Required signed cooldown headers are missing.", 400);
  }
  const parsedTimestamp = Date.parse(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 300_000) {
    return errorResponse("expired_timestamp", "Cooldown timestamp is outside the allowed window.", 401);
  }
  const expected = await hmacSha256Hex(
    env.INGESTION_HMAC_SECRET,
    `${timestamp}.${nonce}.${await sha256Hex(new Uint8Array())}`
  );
  if (!constantTimeEqualHex(signature, expected)) {
    return errorResponse("invalid_signature", "Cooldown signature verification failed.", 401);
  }
  const url = new URL(request.url);
  const adapter = url.searchParams.get("adapter") ?? "";
  const domain = (url.searchParams.get("domain") ?? "").trim().toLowerCase();
  if (adapter !== "official_site" || !DOMAIN_PATTERN.test(domain)) {
    return errorResponse("invalid_cooldown_source", "Cooldown source is invalid.", 400);
  }
  const operations = new OperationsRepository(env.OPS_DB);
  if (await operations.getIngestionNonce(nonce)) {
    return errorResponse("replayed_nonce", "Cooldown nonce has already been used.", 409);
  }
  const now = new Date();
  await operations.recordIngestionNonce({
    nonce,
    idempotencyKey: `cooldown:${domain}:${nonce}`,
    requestHash: await sha256Hex(new Uint8Array()),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString()
  });
  const blockedUntil = await operations.getSourceBlockedUntil(`official_site:${domain}`);
  const allowed = !blockedUntil || Date.parse(blockedUntil) <= now.getTime();
  return jsonResponse({ allowed, blocked_until: allowed ? null : blockedUntil }, 200);
}
