import type { RuntimeEnv } from "./validation/startup";

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

export function authorizeDashboardRequest(request: Request, env: RuntimeEnv): AccessDecision {
  if ((env.APP_ENV ?? "local") === "local") {
    return {
      allowed: true,
      status: 200,
      code: "local_access",
      message: "Local dashboard access allowed."
    };
  }

  if (!readBool(env.ACCESS_AUTH_REQUIRED, true) || !env.ACCESS_ALLOWED_EMAIL) {
    return {
      allowed: false,
      status: 503,
      code: "access_not_configured",
      message: "Cloudflare Access is not configured for this environment."
    };
  }

  const assertion = request.headers.get("cf-access-jwt-assertion");
  const actorEmail = request.headers.get("cf-access-authenticated-user-email")?.trim();
  if (!assertion || !actorEmail) {
    return {
      allowed: false,
      status: 401,
      code: "access_required",
      message: "Cloudflare Access authentication is required."
    };
  }

  if (actorEmail.toLowerCase() !== env.ACCESS_ALLOWED_EMAIL.trim().toLowerCase()) {
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
