/**
 * Client-side CSV generation for the reporting centre's "exportable table
 * view" (PROMPT 36). Pure and dependency-free so it's fully unit-testable
 * — the actual file download (Blob + object URL) lives in
 * src/components/shared/export-csv-button.tsx, the only place this needs
 * `window`.
 */

export type CsvColumn = { key: string; label: string };
export type CsvRow = Record<string, string | number | null | undefined>;

const NEEDS_QUOTING = /[",\r\n]/;

function escapeCsvCell(value: string): string {
  if (NEEDS_QUOTING.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds an RFC 4180-style CSV string — CRLF line endings, quoted cells only where a comma/quote/newline requires it. */
export function buildCsv(
  columns: readonly CsvColumn[],
  rows: readonly CsvRow[],
): string {
  const header = columns.map((column) => escapeCsvCell(column.label));
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(String(row[column.key] ?? ""))),
  );
  return [header, ...lines].map((line) => line.join(",")).join("\r\n");
}
