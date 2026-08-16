const CONTACT_FORMAT = "si-aesgcm:v1";

export interface DecryptedContact {
  value: string;
  keyVersion: string;
}

export async function decryptContactValue(
  sealedValue: string,
  keyringJson: string,
  context: { contactId: string; sellerId: string; contactType: string }
): Promise<DecryptedContact> {
  const parts = sealedValue.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== CONTACT_FORMAT) {
    throw new Error("unsupported_contact_ciphertext");
  }
  const keyVersion = parts[2];
  const keyring = parseKeyring(keyringJson);
  const encodedKey = keyring[keyVersion];
  if (!encodedKey) {
    throw new Error("contact_key_version_unavailable");
  }
  const keyBytes = decodeBase64Url(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error("contact_key_invalid");
  }
  const nonce = decodeBase64Url(parts[3]);
  if (nonce.byteLength !== 12) {
    throw new Error("contact_nonce_invalid");
  }
  const ciphertext = decodeBase64Url(parts[4]);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, [
    "decrypt"
  ]);
  const aad = new TextEncoder().encode(
    `seller-intelligence-contact|v1|${context.contactId}|${context.sellerId}|${context.contactType}`
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return { value: new TextDecoder("utf-8", { fatal: true }).decode(plaintext), keyVersion };
}

function parseKeyring(value: string): Record<string, string> {
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    throw new Error("contact_keyring_invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("contact_keyring_invalid");
  }
  for (const [version, key] of Object.entries(payload)) {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(version) || typeof key !== "string") {
      throw new Error("contact_keyring_invalid");
    }
  }
  return payload as Record<string, string>;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("contact_base64url_invalid");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "="
  );
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    throw new Error("contact_base64url_invalid");
  }
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}
