import { CrossDatabaseUnitOfWork } from "../repositories";
import { prepareEntityResolution } from "../entity-resolution/service";
import { OperationsRepository } from "../repositories/operations";
import type { RuntimeEnv } from "../validation/startup";
import { readAndDecodeBody } from "./body";
import { readIngestionConfig } from "./config";
import { constantTimeEqualHex, hmacSha256Hex, sha256Hex } from "./crypto";
import { errorResponse, jsonResponse } from "./errors";
import { logIngestionAccepted, logIngestionRejected } from "./logging";
import { parseAndValidateBatch, records, toUnitOfWorkChanges } from "./schema";
import { validateSourcePolicy } from "./source-policy";
import { OperatorCrawlService } from "../operator-crawl/service";

interface IngestionHeaders {
  timestamp: string;
  nonce: string;
  signature: string;
  idempotencyKey: string;
}

export async function ingestBatchResponse(request: Request, env: RuntimeEnv): Promise<Response> {
  const config = readIngestionConfig(env);
  const bindingsError = validateBindings(env, config.hmacSecret);
  if (bindingsError) {
    logIngestionRejected(bindingsError.code, request.headers.get("idempotency-key"));
    return errorResponse(bindingsError.code, bindingsError.message, 503);
  }
  const hmacSecret = config.hmacSecret as string;

  const headers = readIngestionHeaders(request);
  if (!headers.ok) {
    logIngestionRejected("missing_ingestion_header", request.headers.get("idempotency-key"));
    return errorResponse("missing_ingestion_header", "Required ingestion headers are missing.", 400, [
      headers.missing.join(", ")
    ]);
  }

  const timestampError = validateTimestamp(headers.value.timestamp, config.timestampWindowSeconds);
  if (timestampError) {
    logIngestionRejected("expired_timestamp", headers.value.idempotencyKey);
    return errorResponse("expired_timestamp", timestampError, 401);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    logIngestionRejected("unsupported_content_type", headers.value.idempotencyKey);
    return errorResponse(
      "unsupported_content_type",
      "Ingestion requests must use application/json content type.",
      415
    );
  }

  const decodedBody = await readAndDecodeBody(
    request,
    config.maxCompressedBytes,
    config.maxUncompressedBytes
  );
  if (!decodedBody.ok) {
    logIngestionRejected(decodedBody.code, headers.value.idempotencyKey);
    return errorResponse(decodedBody.code, decodedBody.message, decodedBody.status);
  }

  const requestHash = await sha256Hex(decodedBody.decoded.rawBody);
  const signaturePayload = `${headers.value.timestamp}.${headers.value.nonce}.${requestHash}`;
  const expectedSignature = await hmacSha256Hex(hmacSecret, signaturePayload);
  if (!constantTimeEqualHex(headers.value.signature, expectedSignature)) {
    logIngestionRejected("invalid_signature", headers.value.idempotencyKey);
    return errorResponse("invalid_signature", "Ingestion signature verification failed.", 401);
  }

  const operations = new OperationsRepository(env.OPS_DB!);
  const now = new Date();
  const nonce = await operations.getIngestionNonce(headers.value.nonce);
  if (nonce) {
    logIngestionRejected("replayed_nonce", headers.value.idempotencyKey);
    return errorResponse("replayed_nonce", "Ingestion nonce has already been used.", 409);
  }

  await operations.recordIngestionNonce({
    nonce: headers.value.nonce,
    idempotencyKey: headers.value.idempotencyKey,
    requestHash,
    createdAt: now.toISOString(),
    expiresAt: addSeconds(now, config.nonceTtlSeconds).toISOString()
  });

  const schemaResult = parseAndValidateBatch(decodedBody.decoded.bodyText, config);
  if (!schemaResult.ok) {
    logIngestionRejected("invalid_schema", headers.value.idempotencyKey);
    return errorResponse(
      "invalid_schema",
      "Ingestion batch does not match the JSON Schema contract.",
      400,
      schemaResult.errors
    );
  }

  const sourcePolicyErrors = await validateSourcePolicy(schemaResult.payload, config, env);
  if (sourcePolicyErrors.length > 0) {
    logIngestionRejected("source_policy_rejected", headers.value.idempotencyKey);
    return errorResponse(
      "source_policy_rejected",
      "Ingestion batch contains a source URL that violates policy.",
      403,
      sourcePolicyErrors
    );
  }

  const existingIdempotency = await operations.getIdempotencyKey(headers.value.idempotencyKey);
  if (existingIdempotency) {
    if (existingIdempotency.requestHash !== requestHash) {
      logIngestionRejected("idempotency_key_conflict", headers.value.idempotencyKey);
      return errorResponse(
        "idempotency_key_conflict",
        "Idempotency key was already used with a different request body.",
        409
      );
    }

    return jsonResponse(
      {
        accepted: true,
        duplicate: true,
        idempotency_key: headers.value.idempotencyKey
      },
      existingIdempotency.responseStatus
    );
  }

  const changes = await prepareEntityResolution(toUnitOfWorkChanges(schemaResult.payload), env);
  const result = await CrossDatabaseUnitOfWork.fromDatabases({
    core: env.CORE_DB!,
    contacts: env.CONTACTS_DB!,
    operations: env.OPS_DB!,
    history: env.HISTORY_DB!
  }).commit(changes);

  if (!result.ok) {
    logIngestionRejected("partition_write_failed", headers.value.idempotencyKey);
    return errorResponse(
      "partition_write_failed",
      "Ingestion write failed after ordered partition writes. Replay with the same idempotency key and a new nonce.",
      503,
      [
        `failed_stage=${result.failedStage}`,
        `completed_stages=${result.completedStages.join(",")}`,
        result.errorMessage
      ]
    );
  }

  await new OperatorCrawlService(env).recordIngestion(
    schemaResult.payload.crawl_run_id,
    records(schemaResult.payload, "sellers").map((record) => String(record.id)),
    records(schemaResult.payload, "sources").map((record) => String(record.source_type)),
    records(schemaResult.payload, "contacts").length
  );

  await operations.recordIdempotencyKey({
    idempotencyKey: headers.value.idempotencyKey,
    requestHash,
    responseStatus: 202,
    createdAt: now.toISOString(),
    expiresAt: addSeconds(now, config.idempotencyTtlSeconds).toISOString()
  });

  logIngestionAccepted(headers.value.idempotencyKey, schemaResult.writeCount);
  return jsonResponse(
    {
      accepted: true,
      duplicate: false,
      idempotency_key: headers.value.idempotencyKey,
      completed_stages: result.completedStages
    },
    202
  );
}

function readIngestionHeaders(request: Request):
  | { ok: true; value: IngestionHeaders }
  | { ok: false; missing: string[] } {
  const timestamp = request.headers.get("x-si-timestamp");
  const nonce = request.headers.get("x-si-nonce");
  const signature = request.headers.get("x-si-signature");
  const idempotencyKey = request.headers.get("idempotency-key");
  const missing: string[] = [];

  if (!timestamp) {
    missing.push("X-SI-Timestamp");
  }
  if (!nonce) {
    missing.push("X-SI-Nonce");
  }
  if (!signature) {
    missing.push("X-SI-Signature");
  }
  if (!idempotencyKey) {
    missing.push("Idempotency-Key");
  }

  return missing.length === 0
    ? {
        ok: true,
        value: {
          timestamp: timestamp as string,
          nonce: nonce as string,
          signature: signature as string,
          idempotencyKey: idempotencyKey as string
        }
      }
    : { ok: false, missing };
}

function validateTimestamp(timestamp: string, windowSeconds: number): string | null {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return "X-SI-Timestamp must be an ISO-8601 timestamp.";
  }

  const ageSeconds = Math.abs(Date.now() - parsed) / 1000;
  if (ageSeconds > windowSeconds) {
    return "X-SI-Timestamp is outside the allowed ingestion window.";
  }

  return null;
}

function validateBindings(
  env: RuntimeEnv,
  hmacSecret: string | undefined
): { code: string; message: string } | null {
  if (!hmacSecret) {
    return {
      code: "ingestion_secret_missing",
      message: "Ingestion HMAC secret is not configured."
    };
  }

  const missingBindings = [
    ["CORE_DB", env.CORE_DB],
    ["CONTACTS_DB", env.CONTACTS_DB],
    ["OPS_DB", env.OPS_DB],
    ["HISTORY_DB", env.HISTORY_DB]
  ]
    .filter(([, binding]) => binding === undefined)
    .map(([name]) => name);

  if (missingBindings.length > 0) {
    return {
      code: "ingestion_database_missing",
      message: `Missing D1 database bindings: ${missingBindings.join(", ")}.`
    };
  }

  return null;
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
