export function isIngestionRoute(pathname: string): boolean {
  return pathname === "/v1/ingest/batch";
}
