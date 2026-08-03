const textDecoder = new TextDecoder("utf-8", { fatal: true });

export interface DecodedBody {
  rawBody: Uint8Array;
  bodyText: string;
}

export type BodyDecodeResult =
  | { ok: true; decoded: DecodedBody }
  | { ok: false; code: string; message: string; status: number };

export async function readAndDecodeBody(
  request: Request,
  maxCompressedBytes: number,
  maxUncompressedBytes: number
): Promise<BodyDecodeResult> {
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (rawBody.byteLength > maxCompressedBytes) {
    return {
      ok: false,
      code: "compressed_body_too_large",
      message: "Compressed request body exceeds the ingestion limit.",
      status: 413
    };
  }

  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  const uncompressed = await decodeByEncoding(rawBody, encoding);
  if (!uncompressed.ok) {
    return uncompressed;
  }

  if (uncompressed.body.byteLength > maxUncompressedBytes) {
    return {
      ok: false,
      code: "uncompressed_body_too_large",
      message: "Uncompressed request body exceeds the ingestion limit.",
      status: 413
    };
  }

  try {
    return {
      ok: true,
      decoded: {
        rawBody,
        bodyText: textDecoder.decode(uncompressed.body)
      }
    };
  } catch {
    return {
      ok: false,
      code: "invalid_utf8",
      message: "Request body must be valid UTF-8 JSON.",
      status: 400
    };
  }
}

type DecodeResult =
  | { ok: true; body: Uint8Array }
  | { ok: false; code: string; message: string; status: number };

async function decodeByEncoding(
  body: Uint8Array,
  encoding: string | undefined
): Promise<DecodeResult> {
  if (!encoding || encoding === "identity") {
    return { ok: true, body };
  }

  if (encoding !== "gzip") {
    return {
      ok: false,
      code: "unsupported_content_encoding",
      message: "Only identity and gzip request bodies are supported.",
      status: 415
    };
  }

  try {
    const stream = new Blob([toArrayBuffer(body)])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const decoded = new Uint8Array(await new Response(stream).arrayBuffer());
    return { ok: true, body: decoded };
  } catch {
    return {
      ok: false,
      code: "invalid_gzip_body",
      message: "Request body could not be decoded as gzip.",
      status: 400
    };
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
