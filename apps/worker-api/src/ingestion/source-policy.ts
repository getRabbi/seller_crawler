import type { RuntimeEnv } from "../validation/startup";
import type { IngestionConfig } from "./config";
import { records, type IngestionBatchPayload } from "./schema";
import { OperatorCrawlService } from "../operator-crawl/service";

const blockedHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export async function validateSourcePolicy(
  payload: IngestionBatchPayload,
  config: IngestionConfig,
  env: RuntimeEnv
): Promise<string[]> {
  const errors: string[] = [];
  const allowedDomains = new Set(config.allowedSourceDomains);
  if (env.OPS_DB) {
    for (const domain of await new OperatorCrawlService(env).authorizedDomains(payload.crawl_run_id)) {
      allowedDomains.add(domain);
    }
  }

  for (const [index, source] of records(payload, "sources").entries()) {
    const path = `$.sources[${index}]`;
    const sourceUrl = parseUrl(source.source_url, `${path}.source_url`, errors);
    const canonicalUrl = parseUrl(source.canonical_url, `${path}.canonical_url`, errors);
    const declaredDomain =
      typeof source.source_domain === "string" ? source.source_domain.toLowerCase() : "";

    if (!sourceUrl || !canonicalUrl) {
      continue;
    }

    if (!["http:", "https:"].includes(sourceUrl.protocol)) {
      errors.push(`${path}.source_url must use http or https`);
    }
    if (!["http:", "https:"].includes(canonicalUrl.protocol)) {
      errors.push(`${path}.canonical_url must use http or https`);
    }
    if (sourceUrl.username || sourceUrl.password || canonicalUrl.username || canonicalUrl.password) {
      errors.push(`${path} URLs must not include credentials`);
    }
    if (blockedHostnames.has(sourceUrl.hostname.toLowerCase())) {
      errors.push(`${path}.source_url must not target localhost or private test hosts`);
    }
    if (declaredDomain !== sourceUrl.hostname.toLowerCase()) {
      errors.push(`${path}.source_domain must match source_url hostname`);
    }
    if (allowedDomains.size > 0 && !allowedDomains.has(sourceUrl.hostname.toLowerCase())) {
      errors.push(`${path}.source_url hostname is not in the ingestion allowlist`);
    }
  }

  if ((env.APP_ENV ?? "local") === "production" && records(payload, "sources").length > 0) {
    if (allowedDomains.size === 0) {
      errors.push("production ingestion requires INGESTION_ALLOWED_SOURCE_DOMAINS");
    }
  }

  return errors;
}

function parseUrl(value: unknown, path: string, errors: string[]): URL | null {
  if (typeof value !== "string") {
    errors.push(`${path} must be a URL string`);
    return null;
  }

  try {
    return new URL(value);
  } catch {
    errors.push(`${path} must be a valid URL`);
    return null;
  }
}
