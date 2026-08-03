export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

export function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function errorResponse(code: string, message: string, status: number, details?: string[]) {
  const payload: ErrorPayload = {
    error: {
      code,
      message
    }
  };

  if (details && details.length > 0) {
    payload.error.details = details;
  }

  return jsonResponse(payload, status);
}
