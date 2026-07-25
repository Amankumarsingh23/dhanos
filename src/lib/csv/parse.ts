/**
 * Dependency-free CSV parsing for the import foundation (PROMPT 41) —
 * mirrors src/lib/reports/csv.ts's own "pure, no library, fully
 * unit-testable" philosophy for the opposite direction (parsing an
 * uploaded file rather than generating one for export).
 *
 * Handles the RFC 4180 shapes real bank/broker exports actually use:
 * quoted fields (with embedded commas, newlines, and escaped `""`
 * quotes), and both CRLF and bare LF line endings. Deliberately does not
 * attempt to sniff a delimiter other than comma, or an encoding other than
 * what the browser's `File.text()` already decoded — a disclosed scope
 * limit for this first import foundation, not a silent gap.
 */

/** Parses raw CSV text into rows of raw string cells — no header handling, no type coercion, just tokenization. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const length = text.length;

  function endCell() {
    row.push(cell);
    cell = "";
  }
  function endRow() {
    endCell();
    rows.push(row);
    row = [];
  }

  while (i < length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Peek for \r\n; either way this ends the row.
      if (text[i + 1] === "\n") {
        i += 1;
      }
      endRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += char;
    i += 1;
  }

  // Final cell/row, if the text didn't end with a line break.
  if (cell.length > 0 || row.length > 0) {
    endRow();
  }

  // Drop a single fully-empty trailing row (a trailing newline produces
  // one), but never an intentional blank row in the middle of the file.
  if (
    rows.length > 0 &&
    rows[rows.length - 1]?.length === 1 &&
    rows[rows.length - 1]?.[0] === ""
  ) {
    rows.pop();
  }

  return rows;
}

export type ParsedCsv = {
  headers: string[];
  dataRows: string[][];
};

/** Splits parsed rows into a header row (always row 0) and the remaining data rows. */
export function splitHeaderAndRows(rows: string[][]): ParsedCsv {
  const [headers = [], ...dataRows] = rows;
  return { headers, dataRows };
}

/** A safety cap on how many data rows one import can process synchronously — no background-job infrastructure exists in this app yet (see src/features/reminders/sync.ts's own "best-effort on page load" note), so a single request must stay bounded. */
export const MAX_IMPORT_ROWS = 5000;
