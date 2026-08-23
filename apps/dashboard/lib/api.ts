import type { ApiErrorPayload } from "@seller-intelligence/shared-types/dashboard";

export class WorkerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "WorkerApiError";
  }

  get locked(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function workerApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WORKER_API_BASE_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV !== "development" && url.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_WORKER_API_BASE_URL must use HTTPS outside local development.");
    }
    return configured.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8787";
  }
  throw new Error("NEXT_PUBLIC_WORKER_API_BASE_URL is required outside local development.");
}

export function workerApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("Worker API paths must start with '/'.");
  }
  return `${workerApiBaseUrl()}${path}`;
}

export async function fetchWorkerApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await workerFetch(workerApiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal
  });
  if (!response.ok) {
    const payload = await readError(response);
    throw new WorkerApiError(payload.message, response.status, payload.code);
  }
  return readSuccess<T>(response);
}

export async function postWorkerApi<T>(path: string, body: unknown): Promise<T> {
  const response = await workerFetch(workerApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const payload = await readError(response);
    throw new WorkerApiError(payload.message, response.status, payload.code);
  }
  return readSuccess<T>(response);
}

const API_SESSION_MESSAGE =
  "Could not reach the Worker API. Your API Access session may be missing or expired. Open the API sign-in check, finish signing in, then return here and retry.";

async function workerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new WorkerApiError(API_SESSION_MESSAGE, 0, "worker_unreachable");
  }
}

async function readSuccess<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new WorkerApiError(API_SESSION_MESSAGE, response.status, "worker_login_required");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new WorkerApiError(
      "The Worker API returned an unreadable response. Retry once; if it continues, check Crawl Health.",
      response.status,
      "worker_response_invalid"
    );
  }
}

async function readError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.error?.code && payload.error.message) {
      return payload.error;
    }
  } catch {
    // The browser receives a stable generic error when a gateway returns non-JSON content.
  }
  return {
    code: "worker_request_failed",
    message: `Worker request failed with status ${response.status}.`
  };
}
