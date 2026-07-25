import { z } from "zod";

/**
 * Household data export (PROMPT 42) — the registry of every table the
 * export can include, grouped the same way the prompt itself lists them
 * (people, institutions, accounts, transactions, ...). Shared between the
 * server-only export builder (src/features/settings/export/build.ts,
 * which needs the literal table names to query Supabase) and the client
 * CSV-selection panel (src/features/settings/export-csv-panel.tsx, which
 * needs the group/label structure to render checkboxes) — kept here,
 * rather than in src/features/settings/, so neither side needs to import
 * across a server/client boundary it doesn't otherwise cross.
 *
 * Every table listed carries its own `household_id` column directly (no
 * child table here relies on a join to be household-scoped — verified
 * against every migration in supabase/migrations/ before this list was
 * written), so a single generic `.eq("household_id", householdId)` query
 * per table is sufficient for "export contains only one household."
 */

export type ExportTableDescriptor = {
  key: string;
  label: string;
};

export type ExportGroup = {
  key: string;
  label: string;
  tables: readonly ExportTableDescriptor[];
};

export const EXPORT_GROUPS = [
  {
    key: "people",
    label: "People",
    tables: [{ key: "people", label: "People" }],
  },
  {
    key: "institutions",
    label: "Institutions",
    tables: [{ key: "institutions", label: "Institutions" }],
  },
  {
    key: "accounts",
    label: "Accounts",
    tables: [
      { key: "financial_accounts", label: "Accounts" },
      { key: "account_balance_snapshots", label: "Account balance snapshots" },
    ],
  },
  {
    key: "transactions",
    label: "Transactions",
    tables: [
      { key: "transactions", label: "Transactions" },
      { key: "transaction_splits", label: "Transaction splits" },
    ],
  },
  {
    key: "categories",
    label: "Categories",
    tables: [{ key: "transaction_categories", label: "Categories" }],
  },
  {
    key: "income_sources",
    label: "Income sources",
    tables: [{ key: "income_sources", label: "Income sources" }],
  },
  {
    key: "recurring_rules",
    label: "Recurring rules",
    tables: [
      { key: "recurring_rules", label: "Recurring rules" },
      {
        key: "recurring_rule_amount_schedules",
        label: "Recurring rule amount schedules",
      },
      { key: "recurring_rule_events", label: "Recurring rule events" },
    ],
  },
  {
    key: "investments",
    label: "Investments",
    tables: [
      { key: "investment_accounts", label: "Investment accounts" },
      { key: "investment_assets", label: "Investment assets" },
      { key: "investment_holdings", label: "Investment holdings" },
      { key: "investment_transactions", label: "Investment transactions" },
      { key: "investment_documents", label: "Investment document metadata" },
    ],
  },
  {
    key: "sips",
    label: "SIPs",
    tables: [
      { key: "investment_sips", label: "SIPs" },
      { key: "investment_sip_events", label: "SIP events" },
    ],
  },
  {
    key: "valuations",
    label: "Valuations",
    tables: [
      {
        key: "investment_valuation_snapshots",
        label: "Investment valuation snapshots",
      },
      { key: "asset_valuation_snapshots", label: "Asset valuation snapshots" },
    ],
  },
  {
    key: "staking",
    label: "Staking snapshots",
    tables: [
      { key: "staking_positions", label: "Staking positions" },
      { key: "staking_daily_snapshots", label: "Staking daily snapshots" },
    ],
  },
  {
    key: "loans",
    label: "Loans",
    tables: [{ key: "loans", label: "Loans" }],
  },
  {
    key: "payments",
    label: "Payments",
    tables: [
      { key: "loan_payments", label: "Loan payments" },
      { key: "liability_payments", label: "Liability payments" },
    ],
  },
  {
    key: "lending",
    label: "Lending",
    tables: [
      { key: "lendings", label: "Lending" },
      { key: "lending_repayments", label: "Lending repayments" },
    ],
  },
  {
    key: "insurance",
    label: "Insurance",
    tables: [
      { key: "insurance_policies", label: "Insurance policies" },
      { key: "insurance_claims", label: "Insurance claims" },
      {
        key: "insurance_policy_insured_people",
        label: "Insurance policy insured people",
      },
      {
        key: "insurance_policy_waiting_periods",
        label: "Insurance policy waiting periods",
      },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    tables: [{ key: "assets", label: "Assets" }],
  },
  {
    key: "liabilities",
    label: "Liabilities",
    tables: [{ key: "liabilities", label: "Liabilities" }],
  },
  {
    key: "goals",
    label: "Goals",
    tables: [
      { key: "goals", label: "Goals" },
      { key: "goal_funding_sources", label: "Goal funding sources" },
      { key: "goal_responsible_people", label: "Goal responsible people" },
    ],
  },
  {
    key: "monthly_reports",
    label: "Monthly reports",
    tables: [
      { key: "monthly_closings", label: "Monthly closings" },
      {
        key: "monthly_closing_review_items",
        label: "Monthly closing review items",
      },
    ],
  },
  {
    key: "decisions",
    label: "Decisions",
    tables: [
      { key: "decision_journal_entries", label: "Decision journal entries" },
    ],
  },
  {
    key: "documents",
    label: "Document metadata",
    tables: [
      { key: "documents", label: "Documents" },
      { key: "attachments", label: "Attachments" },
    ],
  },
] as const satisfies readonly ExportGroup[];

/** Every literal table name this export can ever query — matches keyof Database["public"]["Tables"] for the tables listed above (asserted, not re-derived, at the call site in build.ts). */
export type ExportTableKey = (typeof EXPORT_GROUPS)[number]["tables"][number]["key"];

export const EXPORT_TABLE_KEYS: readonly ExportTableKey[] = EXPORT_GROUPS.flatMap(
  (group) => group.tables.map((table) => table.key),
);

export const EXPORT_TABLE_LABELS: Record<ExportTableKey, string> =
  Object.fromEntries(
    EXPORT_GROUPS.flatMap((group) =>
      group.tables.map((table) => [table.key, table.label] as const),
    ),
  ) as Record<ExportTableKey, string>;

/**
 * Bumped whenever the export's shape changes (a table added/removed, a
 * column meaning changed) — included at the top level of every JSON
 * export so a downstream consumer (a script, a future re-import feature)
 * can detect which shape it's reading rather than guessing from content.
 * PROMPT 40's original export had no version at all; this is the first.
 */
export const EXPORT_SCHEMA_VERSION = "2.0.0";

/** A generous per-table cap — never a truly unbounded fetch (docs/data-access-patterns.md §2). Applies identically to both the JSON and CSV export paths. */
export const EXPORT_ROW_LIMIT_PER_TABLE = 10_000;

/**
 * Household-wide (not per-user) — a hijacked session from *any* member is
 * the threat docs/security-model.md §5 calls out ("a full financial
 * export is a high-value target"), so the limit must cap the household's
 * total export rate, not reset per member.
 */
export const EXPORT_RATE_LIMIT_WINDOW_MINUTES = 60;
export const EXPORT_RATE_LIMIT_MAX_REQUESTS = 5;

/** The activity_events event_type both export actions (JSON and CSV) log under — a single shared bucket, since they're the same abuse vector and should share one rate-limit count (see checkExportRateLimit). */
export const EXPORT_ACTIVITY_EVENT_TYPE = "household.data_exported";

function isExportTableKey(value: string): value is ExportTableKey {
  return (EXPORT_TABLE_KEYS as readonly string[]).includes(value);
}

/** Validates a CSV export request's selected table keys against the registry above — an unrecognized key (stale client, tampered payload) is rejected here rather than reaching a Supabase query with an untyped string. */
export const exportCsvTablesSchema = z.object({
  tables: z
    .array(z.string().refine(isExportTableKey, "Unknown export table."))
    .min(1, "Select at least one table to export.")
    .max(EXPORT_TABLE_KEYS.length, "Too many tables selected."),
});
export type ExportCsvTablesInput = z.input<typeof exportCsvTablesSchema>;
