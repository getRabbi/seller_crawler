import { authorizeDashboardRequest, isIngestionRoute } from "./auth";
import { dashboardResponse, errorResponse, isDashboardRoute } from "./dashboard/routes";
import { ingestBatchResponse } from "./ingestion/route";
import { cooldownAuthorizationResponse, isCooldownRoute } from "./cooldown/route";
import { healthResponse } from "./routes/health";
import type { RuntimeEnv } from "./validation/startup";

function corsHeaders(request: Request, env: RuntimeEnv): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !env.DASHBOARD_ORIGIN || origin !== env.DASHBOARD_ORIGIN) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin"
  };
}

function withCors(response: Response, request: Request, env: RuntimeEnv): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: RuntimeEnv = {}): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && isDashboardRoute(url.pathname)) {
      const headers = new Headers(corsHeaders(request, env));
      headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
      headers.set("access-control-allow-headers", "content-type");
      headers.set("access-control-max-age", "86400");
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET" && url.pathname === "/v1/health") {
      return withCors(healthResponse(env), request, env);
    }

    if (request.method === "POST" && isIngestionRoute(url.pathname)) {
      return ingestBatchResponse(request, env);
    }

    if (request.method === "GET" && isCooldownRoute(url.pathname)) {
      return cooldownAuthorizationResponse(request, env);
    }

    if ((request.method === "GET" || request.method === "POST") && isDashboardRoute(url.pathname)) {
      const access = await authorizeDashboardRequest(request, env);
      if (!access.allowed) {
        return withCors(errorResponse(access.status, access.code, access.message), request, env);
      }
      return withCors(
        await dashboardResponse(request, env, access.actorEmail ?? "local-operator"),
        request,
        env
      );
    }

    return errorResponse(404, "not_found", "Route not found.");
  }
};
