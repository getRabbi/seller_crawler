import { buildHealthPayload } from "../observability/health";
import type { RuntimeEnv } from "../validation/startup";

export function healthResponse(env: RuntimeEnv = {}): Response {
  const payload = buildHealthPayload(env);

  return new Response(JSON.stringify(payload), {
    status: payload.status === "ok" ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
