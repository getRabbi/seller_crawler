import type { RuntimeEnv } from "../validation/startup";

const DEFAULT_MAX_SELLERS = 25;
const DEFAULT_MAX_CONTACTS = 100;
const DEFAULT_MAX_D1_STATEMENTS = 20;
const DEFAULT_MAX_COMPRESSED_BYTES = 256 * 1024;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 1024 * 1024;
const DEFAULT_TIMESTAMP_WINDOW_SECONDS = 5 * 60;
const DEFAULT_NONCE_TTL_SECONDS = 10 * 60;
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IngestionConfig {
  hmacSecret: string | undefined;
  maxSellers: number;
  maxContacts: number;
  maxD1Statements: number;
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  timestampWindowSeconds: number;
  nonceTtlSeconds: number;
  idempotencyTtlSeconds: number;
  allowedSourceDomains: string[];
  appEnv: string;
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readDomainList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}

export function readIngestionConfig(env: RuntimeEnv): IngestionConfig {
  return {
    hmacSecret: env.INGESTION_HMAC_SECRET,
    maxSellers: readPositiveInteger(env.MAX_BATCH_SELLERS, DEFAULT_MAX_SELLERS),
    maxContacts: readPositiveInteger(env.MAX_BATCH_CONTACTS, DEFAULT_MAX_CONTACTS),
    maxD1Statements: readPositiveInteger(
      env.MAX_BATCH_D1_STATEMENTS,
      DEFAULT_MAX_D1_STATEMENTS
    ),
    maxCompressedBytes: readPositiveInteger(
      env.MAX_COMPRESSED_BODY_BYTES,
      DEFAULT_MAX_COMPRESSED_BYTES
    ),
    maxUncompressedBytes: readPositiveInteger(
      env.MAX_UNCOMPRESSED_BODY_BYTES,
      DEFAULT_MAX_UNCOMPRESSED_BYTES
    ),
    timestampWindowSeconds: DEFAULT_TIMESTAMP_WINDOW_SECONDS,
    nonceTtlSeconds: DEFAULT_NONCE_TTL_SECONDS,
    idempotencyTtlSeconds: DEFAULT_IDEMPOTENCY_TTL_SECONDS,
    allowedSourceDomains: readDomainList(env.INGESTION_ALLOWED_SOURCE_DOMAINS),
    appEnv: env.APP_ENV ?? "local"
  };
}
