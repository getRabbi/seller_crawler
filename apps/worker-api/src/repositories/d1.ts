export type D1Value = string | number | boolean | null | ArrayBuffer | Uint8Array;

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: unknown;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export function nullable(value: string | number | null | undefined): string | number | null {
  return value ?? null;
}

export async function runStatement(
  db: D1Database,
  query: string,
  values: D1Value[]
): Promise<D1Result> {
  return db.prepare(query).bind(...values).run();
}
