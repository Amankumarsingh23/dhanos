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
// A cell opening with any of these is interpreted as a formula/macro by
// Excel, Google Sheets, and LibreOffice when the CSV is opened — "CSV
// injection" (CWE-1236). Every export in this app (PROMPT 45) ultimately
// contains household-entered free text (transaction descriptions,
// counterparty, notes, category names, decision-journal rationale, …), so
// any of those fields is a real injection vector once exported and
// opened by the household in a spreadsheet app. Tab and CR are included
// alongside the classic four (=+-@) since some spreadsheet parsers also
// treat a leading tab/CR as a formula-cell opener.
const NEEDS_FORMULA_ESCAPE = /^[=+\-@\t\r]/;

function escapeCsvCell(value: string): string {
  // Prefixing with a bare apostrophe is the standard mitigation (Excel/
  // Sheets/LibreOffice all render it as "force text," never as part of
  // the visible value) — applied before RFC 4180 quoting so a value that
  // needs both (e.g. a formula-looking cell that also contains a comma)
  // gets both correctly.
  const escaped = NEEDS_FORMULA_ESCAPE.test(value) ? `'${value}` : value;
  if (NEEDS_QUOTING.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
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
