const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvResponse(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
): Response {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store"
    }
  });
}

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (CSV_FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
