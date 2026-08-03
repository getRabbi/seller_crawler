const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7Compatible(value: string): boolean {
  return uuidV7Pattern.test(value);
}

export function assertUuidV7Compatible(value: string, fieldName = "id"): void {
  if (!isUuidV7Compatible(value)) {
    throw new Error(`${fieldName} must be a UUIDv7-compatible text identifier.`);
  }
}
