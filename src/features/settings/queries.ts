import type { createClient } from "@/lib/supabase/server";

/** Every household-scoped table this module reads from — a plain literal union (matching this codebase's own convention of not deriving table-name types) rather than `string`, so `.from(table)` stays fully typed. */
type HouseholdScopedTable =
  | "institutions"
  | "financial_accounts"
  | "transaction_categories"
  | "people"
  | "recurring_rules"
  | "investment_sips"
  | "staking_positions"
  | "loans"
  | "lendings"
  | "insurance_policies"
  | "liabilities"
  | "goals"
  | "documents"
  | "transactions"
  | "investment_assets"
  | "investment_holdings"
  | "assets"
  | "decision_journal_entries";

/**
 * Settings > Data > "Archived records" (PROMPT 40) — a lightweight,
 * count-only summary of how many records in each entity are in an
 * archived/closed/ended state, each linking back to that entity's own list
 * page (with its existing archived-record filter deep-linked where one
 * exists). Every query here is a `count: "exact", head: true` request —
 * no rows are ever fetched, just a number, so this stays cheap regardless
 * of household size.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ArchivedRecordSummaryRow = {
  label: string;
  count: number;
  href: string;
};

async function countRows(
  supabase: SupabaseServerClient,
  table: HouseholdScopedTable,
  householdId: string,
  column: string,
  values: readonly (string | boolean)[],
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .in(column, values);
  return count ?? 0;
}

export async function getArchivedRecordsSummary(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<ArchivedRecordSummaryRow[]> {
  const [
    institutions,
    accounts,
    categories,
    people,
    recurringRules,
    sips,
    stakingPositions,
    loans,
    lendings,
    insurancePolicies,
    liabilities,
    goals,
    documents,
  ] = await Promise.all([
    countRows(supabase, "institutions", householdId, "is_archived", [true]),
    countRows(supabase, "financial_accounts", householdId, "is_active", [false]),
    countRows(supabase, "transaction_categories", householdId, "is_archived", [true]),
    countRows(supabase, "people", householdId, "is_active", [false]),
    countRows(supabase, "recurring_rules", householdId, "status", ["ended"]),
    countRows(supabase, "investment_sips", householdId, "status", ["cancelled"]),
    countRows(supabase, "staking_positions", householdId, "status", ["closed"]),
    countRows(supabase, "loans", householdId, "status", ["closed", "settled"]),
    countRows(supabase, "lendings", householdId, "status", ["repaid", "written_off"]),
    countRows(supabase, "insurance_policies", householdId, "status", ["expired", "cancelled"]),
    countRows(supabase, "liabilities", householdId, "status", ["paid"]),
    countRows(supabase, "goals", householdId, "status", ["achieved", "abandoned"]),
    countRows(supabase, "documents", householdId, "status", ["archived"]),
  ]);

  return [
    { label: "Institutions", count: institutions, href: "/app/institutions?archived=true" },
    { label: "Accounts (closed)", count: accounts, href: "/app/accounts?closed=true" },
    { label: "Categories", count: categories, href: "/app/cash-flow/categories?archived=true" },
    { label: "People", count: people, href: "/app/people?archived=true" },
    { label: "Recurring commitments (ended)", count: recurringRules, href: "/app/recurring" },
    { label: "SIPs (cancelled)", count: sips, href: "/app/investments" },
    { label: "Staking positions (closed)", count: stakingPositions, href: "/app/investments/staking" },
    { label: "Loans (closed/settled)", count: loans, href: "/app/debts" },
    { label: "Lending (repaid/written off)", count: lendings, href: "/app/lending" },
    { label: "Insurance policies (expired/cancelled)", count: insurancePolicies, href: "/app/insurance" },
    { label: "Liabilities (paid)", count: liabilities, href: "/app/liabilities" },
    { label: "Goals (achieved/abandoned)", count: goals, href: "/app/goals" },
    { label: "Documents", count: documents, href: "/app/documents?archived=true" },
  ];
}

// The full household data export (PROMPT 40, expanded by PROMPT 42) now
// lives in ./export/build.ts — a much larger table registry (see
// src/lib/validation/export.ts), versioned output, per-table failure
// reporting, a CSV path, rate limiting, and owner/admin-only access. See
// ./actions.ts's exportHouseholdDataAction/exportHouseholdTablesCsvAction.
