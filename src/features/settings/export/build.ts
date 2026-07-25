import type { createClient } from "@/lib/supabase/server";
import {
  EXPORT_ROW_LIMIT_PER_TABLE,
  EXPORT_SCHEMA_VERSION,
  EXPORT_TABLE_KEYS,
  EXPORT_TABLE_LABELS,
  type ExportTableKey,
} from "@/lib/validation/export";
import { buildCsv, type CsvColumn, type CsvRow } from "@/lib/reports/csv";

/**
 * Household data export builder (PROMPT 42) — the server-only Supabase
 * queries behind both the JSON and CSV export Server Actions (see
 * ../actions.ts). Every table listed in EXPORT_TABLE_KEYS carries its own
 * household_id column (verified against every migration in
 * supabase/migrations/ when src/lib/validation/export.ts's registry was
 * written), so a single `.eq("household_id", householdId)` per table is
 * sufficient for the "export contains only one household" acceptance
 * criterion — no join, no post-filtering, nothing to get wrong per table.
 *
 * Always called with the request-scoped, RLS-enforced client from
 * src/lib/supabase/server.ts — never src/lib/supabase/service-role.ts.
 * RLS is defense in depth here (the household_id filter should already
 * make a cross-household row impossible), not the only thing standing
 * between this query and another household's data.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TableExportOutcome = {
  key: ExportTableKey;
  rowCount: number;
  truncated: boolean;
  failed: boolean;
  rows: Record<string, unknown>[];
};

/**
 * Fetches one table's household-scoped rows, capped at
 * EXPORT_ROW_LIMIT_PER_TABLE + 1 (so "did this hit the cap" is knowable
 * without a separate count query). "Safe failure for large exports"
 * (PROMPT 42) means two things here, both handled explicitly rather than
 * left to chance: a query that errors is flagged `failed` — never
 * silently rendered as "this table happens to be empty" — and a result
 * over the cap is flagged `truncated` and sliced back down, so one
 * unusually large table can never balloon a whole export's memory use
 * unboundedly.
 */
export async function fetchExportTable(
  supabase: SupabaseServerClient,
  table: ExportTableKey,
  householdId: string,
): Promise<TableExportOutcome> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("household_id", householdId)
    .limit(EXPORT_ROW_LIMIT_PER_TABLE + 1);

  if (error) {
    return {
      key: table,
      rowCount: 0,
      truncated: false,
      failed: true,
      rows: [],
    };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const truncated = rows.length > EXPORT_ROW_LIMIT_PER_TABLE;
  return {
    key: table,
    rowCount: truncated ? EXPORT_ROW_LIMIT_PER_TABLE : rows.length,
    truncated,
    failed: false,
    rows: truncated ? rows.slice(0, EXPORT_ROW_LIMIT_PER_TABLE) : rows,
  };
}

export type HouseholdJsonExport = {
  schemaVersion: string;
  exportedAt: string;
  householdId: string;
  notes: {
    moneyFormat: string;
    dateFormat: string;
    rowCapPerTable: number;
  };
  tables: Record<string, Record<string, unknown>[]>;
  truncatedTables: string[];
  failedTables: string[];
};

const MONEY_FORMAT_NOTE =
  "Every amount is a signed integer in the currency's minor units (e.g. paise, cents) — never a formatted or locale-specific string — paired with its own explicit ISO 4217 currency_code column on the same row.";
const DATE_FORMAT_NOTE =
  "Every date/time value is ISO 8601: a bare 'YYYY-MM-DD' for a calendar-date column, a full UTC instant (e.g. '2026-07-24T10:00:00.000Z') for a timestamptz column.";

/**
 * Builds the complete versioned JSON export — one key per table in
 * EXPORT_TABLE_KEYS, fetched in parallel. `schemaVersion` lets a future
 * consumer (a script, a re-import feature) detect the export's shape
 * rather than guessing from its content; `notes` states the money/date
 * conventions explicitly rather than leaving them implicit (PROMPT 42:
 * "money units and currency are explicit," "dates are unambiguous").
 * Deliberately never resolves a Storage signed URL for any document-like
 * table (documents/attachments/investment_documents) — only the stored
 * `storage_path` column is included, so the export can never embed an
 * expiring reference as if it were a permanent one.
 */
export async function buildHouseholdJsonExport(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<HouseholdJsonExport> {
  const outcomes = await Promise.all(
    EXPORT_TABLE_KEYS.map((table) =>
      fetchExportTable(supabase, table, householdId),
    ),
  );

  const tables: Record<string, Record<string, unknown>[]> = {};
  const truncatedTables: string[] = [];
  const failedTables: string[] = [];
  for (const outcome of outcomes) {
    tables[outcome.key] = outcome.rows;
    if (outcome.truncated) truncatedTables.push(outcome.key);
    if (outcome.failed) failedTables.push(outcome.key);
  }

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    householdId,
    notes: {
      moneyFormat: MONEY_FORMAT_NOTE,
      dateFormat: DATE_FORMAT_NOTE,
      rowCapPerTable: EXPORT_ROW_LIMIT_PER_TABLE,
    },
    tables,
    truncatedTables,
    failedTables,
  };
}

/** Converts one Supabase row into buildCsv's CsvRow shape. A total, lossless mapping, not a best-effort stringify: every column across every table in this export is a string/number/boolean/null (no jsonb or array column exists on any of them — confirmed against supabase/migrations/ when the registry was written), so the only conversion ever needed is boolean → "true"/"false". */
export function toCsvRow(row: Record<string, unknown>): CsvRow {
  const csvRow: CsvRow = {};
  for (const [key, value] of Object.entries(row)) {
    csvRow[key] =
      typeof value === "boolean" ? String(value) : (value as string | number | null);
  }
  return csvRow;
}

export type ExportCsvFile = {
  table: ExportTableKey;
  label: string;
  filename: string;
  csv: string;
  rowCount: number;
  truncated: boolean;
};

export type HouseholdCsvExport = {
  files: ExportCsvFile[];
  failedTables: string[];
};

/**
 * Builds one CSV file per selected table ("selected CSV files," PROMPT
 * 42). Columns are derived from the first fetched row's own keys —
 * PostgREST returns the same column set for every row of one query, so
 * this is stable — rather than a hand-maintained list per table, so a
 * future migration adding a column to any of these tables shows up here
 * automatically. A table with zero rows still produces an (empty-body)
 * file rather than being silently dropped, so selecting 5 tables always
 * yields 5 files back.
 */
export async function buildHouseholdTablesCsv(
  supabase: SupabaseServerClient,
  householdId: string,
  tableKeys: readonly ExportTableKey[],
): Promise<HouseholdCsvExport> {
  const outcomes = await Promise.all(
    tableKeys.map((table) => fetchExportTable(supabase, table, householdId)),
  );

  const files: ExportCsvFile[] = [];
  const failedTables: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.failed) {
      failedTables.push(outcome.key);
      continue;
    }

    const [firstRow] = outcome.rows;
    const columns: CsvColumn[] = firstRow
      ? Object.keys(firstRow).map((key) => ({ key, label: key }))
      : [];
    const csv =
      columns.length > 0 ? buildCsv(columns, outcome.rows.map(toCsvRow)) : "";

    files.push({
      table: outcome.key,
      label: EXPORT_TABLE_LABELS[outcome.key],
      filename: `dhanos-${outcome.key}-export.csv`,
      csv,
      rowCount: outcome.rowCount,
      truncated: outcome.truncated,
    });
  }

  return { files, failedTables };
}
