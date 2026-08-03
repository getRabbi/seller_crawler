import { isIngestionRoute } from "./auth";
import { ingestBatchResponse } from "./ingestion/route";
import { healthResponse } from "./routes/health";
import type { RuntimeEnv } from "./validation/startup";

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request: Request, env: RuntimeEnv = {}): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/v1/health") {
      return healthResponse(env);
    }

    if (request.method === "POST" && isIngestionRoute(url.pathname)) {
      return ingestBatchResponse(request, env);
    }

    return notFound();
  }
};
