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
  const response = await fetch(workerApiUrl(path), {
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
  return (await response.json()) as T;
}

export async function postWorkerApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(workerApiUrl(path), {
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
  return (await response.json()) as T;
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
