export function logIngestionRejected(code: string, idempotencyKey: string | null): void {
  console.warn(
    JSON.stringify({
      event: "ingestion_rejected",
      code,
      idempotency_key: maskToken(idempotencyKey)
    })
  );
}

export function logIngestionAccepted(idempotencyKey: string, writeCount: number): void {
  console.info(
    JSON.stringify({
      event: "ingestion_accepted",
      idempotency_key: maskToken(idempotencyKey),
      write_count: writeCount
    })
  );
}

function maskToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
