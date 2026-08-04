import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { RuntimeEnv } from "./validation/startup";

const accessKeySets = new Map<string, JWTVerifyGetKey>();

export function isIngestionRoute(pathname: string): boolean {
  return pathname === "/v1/ingest/batch";
}

export interface AccessDecision {
  allowed: boolean;
  status: 200 | 401 | 403 | 503;
  code: string;
  message: string;
  actorEmail?: string;
}

export async function authorizeDashboardRequest(
  request: Request,
  env: RuntimeEnv
): Promise<AccessDecision> {
  if (env.APP_ENV === "local") {
    return {
      allowed: true,
      status: 200,
      code: "local_access",
      message: "Local dashboard access allowed."
    };
  }

  if (
    !readBool(env.ACCESS_AUTH_REQUIRED, true) ||
    !env.ACCESS_ALLOWED_EMAIL ||
    !env.TEAM_DOMAIN ||
    !env.POLICY_AUD
  ) {
    return {
      allowed: false,
      status: 503,
      code: "access_not_configured",
      message: "Cloudflare Access is not configured for this environment."
    };
  }

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return {
      allowed: false,
      status: 401,
      code: "access_required",
      message: "Cloudflare Access authentication is required."
    };
  }

  const teamDomain = validatedTeamDomain(env.TEAM_DOMAIN);
  if (!teamDomain) {
    return {
      allowed: false,
      status: 503,
      code: "access_not_configured",
      message: "Cloudflare Access team domain is invalid."
    };
  }

  let actorEmail: string | undefined;
  try {
    let keySet = accessKeySets.get(teamDomain);
    if (!keySet) {
      keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
      accessKeySets.set(teamDomain, keySet);
    }
    const { payload } = await jwtVerify(assertion, keySet, {
      issuer: teamDomain,
      audience: env.POLICY_AUD
    });
    actorEmail = typeof payload.email === "string" ? payload.email.trim() : undefined;
  } catch {
    return {
      allowed: false,
      status: 403,
      code: "access_invalid",
      message: "Cloudflare Access token validation failed."
    };
  }

  if (!actorEmail || actorEmail.toLowerCase() !== env.ACCESS_ALLOWED_EMAIL.trim().toLowerCase()) {
    return {
      allowed: false,
      status: 403,
      code: "access_denied",
      message: "The authenticated Access user is not allowed."
    };
  }

  return {
    allowed: true,
    status: 200,
    code: "access_allowed",
    message: "Cloudflare Access user allowed.",
    actorEmail
  };
}

function readBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function validatedTeamDomain(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
