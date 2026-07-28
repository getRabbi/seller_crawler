export function isIngestionRoute(pathname: string): boolean {
  return pathname === "/v1/ingest/batch";
}

export function rejectPhaseZeroIngestion(): Response {
  return new Response(
    JSON.stringify({
      error: "ingestion_disabled",
      message: "Ingestion is not implemented in Phase 0."
    }),
    {
      status: 501,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
