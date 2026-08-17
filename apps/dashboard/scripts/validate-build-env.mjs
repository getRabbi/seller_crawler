import process from "node:process";
import { URL } from "node:url";

const workerApiBaseUrl = process.env.NEXT_PUBLIC_WORKER_API_BASE_URL?.trim();

if (!workerApiBaseUrl) {
  throw new Error("NEXT_PUBLIC_WORKER_API_BASE_URL is required for dashboard builds.");
}

const url = new URL(workerApiBaseUrl);
if (url.protocol !== "https:") {
  throw new Error("NEXT_PUBLIC_WORKER_API_BASE_URL must use HTTPS for dashboard builds.");
}
