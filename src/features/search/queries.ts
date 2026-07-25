import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/validation/accounts";
import {
  TRANSACTION_KIND_LABELS,
  type TransactionKind,
} from "@/lib/validation/transactions";
import {
  CATEGORY_KIND_LABELS,
  type CategoryKind,
} from "@/lib/validation/transaction-categories";
import {
  RELATIONSHIP_TYPE_LABELS,
  type RelationshipType,
} from "@/lib/validation/people";
import {
  INSTITUTION_TYPE_LABELS,
  type InstitutionType,
} from "@/lib/validation/institutions";
import {
  INVESTMENT_ASSET_CLASS_LABELS,
  type InvestmentAssetClass,
} from "@/lib/validation/investments";
import {
  INVESTMENT_SIP_STATUS_LABELS,
  type InvestmentSipStatus,
} from "@/lib/validation/investment-sips";
import {
  STAKING_POSITION_STATUS_LABELS,
  type StakingPositionStatus,
} from "@/lib/validation/staking";
import {
  LOAN_STATUS_LABELS,
  LOAN_TYPE_LABELS,
  type LoanStatus,
  type LoanType,
} from "@/lib/validation/loans";
import {
  LENDING_STATUS_LABELS,
  type LendingStatus,
} from "@/lib/validation/lending";
import {
  POLICY_STATUS_LABELS,
  POLICY_TYPE_LABELS,
  type PolicyStatus,
  type PolicyType,
} from "@/lib/validation/insurance";
import {
  ASSET_CATEGORY_LABELS,
  type AssetCategory,
} from "@/lib/validation/assets";
import {
  LIABILITY_CATEGORY_LABELS,
  type LiabilityCategory,
} from "@/lib/validation/liabilities";
import {
  GOAL_STATUS_LABELS,
  GOAL_TYPE_LABELS,
  type GoalStatus,
  type GoalType,
} from "@/lib/validation/goals";
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
} from "@/lib/validation/documents";
import {
  DECISION_STATUS_LABELS,
  type DecisionStatus,
} from "@/lib/validation/decisions";
import { SEARCH_ENTITY_ORDER, SEARCH_ENTITY_LABELS } from "./types";
import type {
  SearchEntityType,
  SearchResultGroup,
  SearchResultRow,
} from "./types";

/**
 * Global search (PROMPT 39) data access. Every function below is a plain,
 * household-scoped, `ilike`-filtered `select` against one existing table —
 * the exact same query shape src/features/*\/queries.ts's own "search by
 * name" filters already use (see docs/data-access-patterns.md §2) — never a
 * new RPC. RLS is the actual enforcement point (the same policies each
 * entity's own list/detail page relies on), so "another household never
 * appears" and "permissions matching direct pages" hold by construction,
 * not by any search-specific check. `supabase/migrations/
 * 20260726100000_global_search_trgm_indexes.sql`'s trigram GIN indexes are
 * what keep every one of these `ilike '%term%'` filters index-backed
 * instead of a sequential scan.
 *
 * A multi-column match (e.g. a transaction's description OR counterparty)
 * is deliberately two separate `ilike` queries merged and deduped in this
 * module, never a single PostgREST `.or("col1.ilike.x,col2.ilike.x")` call
 * — `.or()`'s filter string is built by directly interpolating the raw
 * search term, and a term containing a comma or parenthesis would corrupt
 * that filter DSL (RLS would still block a cross-household read either
 * way, but a malformed filter is still a correctness bug worth avoiding
 * outright).
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MIN_QUERY_LENGTH = 2;

/**
 * Escapes ILIKE's own wildcard characters (`%`, `_`) and the escape
 * character itself (`\`) so a literal percent sign or underscore typed by
 * a household is matched literally, not treated as a pattern wildcard.
 */
function escapeIlikeSpecialChars(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function ilikePattern(term: string): string {
  return `%${escapeIlikeSpecialChars(term)}%`;
}

/** Merges two id-keyed result arrays for the same entity type, deduping by id (a row matching on both columns should appear once, not twice). */
function mergeById(rows: readonly SearchResultRow[][]): SearchResultRow[] {
  const byId = new Map<string, SearchResultRow>();
  for (const group of rows) {
    for (const row of group) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

async function searchAccounts(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  // Also matches on masked_identifier (e.g. a household searching the last
  // 4 digits it entered) — the value shown back is exactly the
  // already-masked string on file, never anything more revealing (PROMPT
  // 39: "masked identifiers remain masked" — this app never stores an
  // unmasked account number to leak in the first place).
  function toResult(row: {
    id: string;
    name: string;
    account_type: string;
    is_active: boolean;
    masked_identifier: string | null;
  }): SearchResultRow {
    const subtitleParts = [
      ACCOUNT_TYPE_LABELS[row.account_type as AccountType],
      ...(row.is_active ? [] : ["Closed"]),
      ...(row.masked_identifier ? [row.masked_identifier] : []),
    ];
    return {
      entityType: "account",
      id: row.id,
      title: row.name,
      subtitle: subtitleParts.join(" • "),
      href: `/app/accounts/${row.id}`,
    };
  }

  const selectColumns = "id, name, account_type, is_active, masked_identifier";
  const [byName, byMaskedIdentifier] = await Promise.all([
    unwrapList(
      await supabase
        .from("financial_accounts")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("name", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("financial_accounts")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("masked_identifier", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([
    byName.map(toResult),
    byMaskedIdentifier.map(toResult),
  ]).slice(0, limit);
}

async function searchTransactions(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  function toResult(row: {
    id: string;
    description: string | null;
    counterparty: string | null;
    kind: string;
    transaction_date: string;
  }): SearchResultRow {
    const title = row.description ?? row.counterparty ?? "Transaction";
    return {
      entityType: "transaction",
      id: row.id,
      title,
      subtitle: `${TRANSACTION_KIND_LABELS[row.kind as TransactionKind]} • ${row.transaction_date}`,
      href: `/app/cash-flow?search=${encodeURIComponent(row.counterparty ?? row.description ?? "")}`,
    };
  }

  const selectColumns = "id, description, counterparty, kind, transaction_date";
  const [byDescription, byCounterparty] = await Promise.all([
    unwrapList(
      await supabase
        .from("transactions")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("description", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("transactions")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("counterparty", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([
    byDescription.map(toResult),
    byCounterparty.map(toResult),
  ]).slice(0, limit);
}

async function searchCategories(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("transaction_categories")
      .select("id, name, category_kind")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "category",
    id: row.id,
    title: row.name,
    subtitle: CATEGORY_KIND_LABELS[row.category_kind as CategoryKind],
    href: `/app/cash-flow/categories`,
  }));
}

async function searchPeople(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("people")
      .select("id, display_name, relationship_type")
      .eq("household_id", householdId)
      .ilike("display_name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "person",
    id: row.id,
    title: row.display_name,
    subtitle: RELATIONSHIP_TYPE_LABELS[row.relationship_type as RelationshipType],
    href: `/app/people?search=${encodeURIComponent(row.display_name)}`,
  }));
}

async function searchInstitutions(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("institutions")
      .select("id, name, institution_type")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "institution",
    id: row.id,
    title: row.name,
    subtitle: INSTITUTION_TYPE_LABELS[row.institution_type as InstitutionType],
    href: `/app/institutions?search=${encodeURIComponent(row.name)}`,
  }));
}

async function searchInvestments(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  function toResult(row: {
    id: string;
    name: string;
    asset_class: string;
  }): SearchResultRow {
    return {
      entityType: "investment",
      id: row.id,
      title: row.name,
      subtitle: INVESTMENT_ASSET_CLASS_LABELS[row.asset_class as InvestmentAssetClass],
      href: `/app/investments/portfolio`,
    };
  }

  const selectColumns = "id, name, asset_class";
  const [byName, bySymbol] = await Promise.all([
    unwrapList(
      await supabase
        .from("investment_assets")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("name", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("investment_assets")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("symbol_or_identifier", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([byName.map(toResult), bySymbol.map(toResult)]).slice(
    0,
    limit,
  );
}

async function searchSips(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  function toResult(row: {
    id: string;
    name: string;
    status: string;
  }): SearchResultRow {
    return {
      entityType: "sip",
      id: row.id,
      title: row.name,
      subtitle: INVESTMENT_SIP_STATUS_LABELS[row.status as InvestmentSipStatus],
      href: `/app/investments`,
    };
  }

  const selectColumns = "id, name, status";
  const [byName, byProvider] = await Promise.all([
    unwrapList(
      await supabase
        .from("investment_sips")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("name", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("investment_sips")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("provider", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([byName.map(toResult), byProvider.map(toResult)]).slice(
    0,
    limit,
  );
}

async function searchStakingPositions(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("staking_positions")
      .select("id, name, status")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "staking_position",
    id: row.id,
    title: row.name,
    subtitle: STAKING_POSITION_STATUS_LABELS[row.status as StakingPositionStatus],
    href: `/app/investments/staking`,
  }));
}

async function searchLoans(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("loans")
      .select("id, name, loan_type, status")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "loan",
    id: row.id,
    title: row.name,
    subtitle: `${LOAN_TYPE_LABELS[row.loan_type as LoanType]} • ${LOAN_STATUS_LABELS[row.status as LoanStatus]}`,
    href: `/app/debts/${row.id}`,
  }));
}

async function searchBorrowers(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("lendings")
      .select("id, name, status")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "borrower",
    id: row.id,
    title: row.name,
    subtitle: LENDING_STATUS_LABELS[row.status as LendingStatus],
    href: `/app/lending/${row.id}`,
  }));
}

async function searchInsurancePolicies(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  // Also matches on masked_policy_number — shown back exactly as entered
  // (already-masked, e.g. "XXXX-4821"), same "never more revealing than
  // what's on file" reasoning as searchAccounts' masked_identifier.
  function toResult(row: {
    id: string;
    name: string;
    policy_type: string;
    status: string;
    masked_policy_number: string | null;
  }): SearchResultRow {
    const subtitleParts = [
      POLICY_TYPE_LABELS[row.policy_type as PolicyType],
      POLICY_STATUS_LABELS[row.status as PolicyStatus],
      ...(row.masked_policy_number ? [row.masked_policy_number] : []),
    ];
    return {
      entityType: "insurance_policy",
      id: row.id,
      title: row.name,
      subtitle: subtitleParts.join(" • "),
      href: `/app/insurance/${row.id}`,
    };
  }

  const selectColumns = "id, name, policy_type, status, masked_policy_number";
  const [byName, byMaskedPolicyNumber] = await Promise.all([
    unwrapList(
      await supabase
        .from("insurance_policies")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("name", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("insurance_policies")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("masked_policy_number", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([
    byName.map(toResult),
    byMaskedPolicyNumber.map(toResult),
  ]).slice(0, limit);
}

async function searchAssets(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("assets")
      .select("id, name, category")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "asset",
    id: row.id,
    title: row.name,
    subtitle: ASSET_CATEGORY_LABELS[row.category as AssetCategory],
    href: `/app/assets/${row.id}`,
  }));
}

async function searchLiabilities(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("liabilities")
      .select("id, name, category")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "liability",
    id: row.id,
    title: row.name,
    subtitle: LIABILITY_CATEGORY_LABELS[row.category as LiabilityCategory],
    href: `/app/liabilities/${row.id}`,
  }));
}

async function searchGoals(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("goals")
      .select("id, name, goal_type, status")
      .eq("household_id", householdId)
      .ilike("name", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "goal",
    id: row.id,
    title: row.name,
    subtitle: `${GOAL_TYPE_LABELS[row.goal_type as GoalType]} • ${GOAL_STATUS_LABELS[row.status as GoalStatus]}`,
    href: `/app/goals/${row.id}`,
  }));
}

async function searchDocuments(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  // Metadata only — display_name/original_filename, never the stored file
  // content (PROMPT 39: "no binary-document content indexing yet").
  function toResult(row: {
    id: string;
    display_name: string;
    category: string;
  }): SearchResultRow {
    return {
      entityType: "document",
      id: row.id,
      title: row.display_name,
      subtitle: DOCUMENT_CATEGORY_LABELS[row.category as DocumentCategory],
      href: `/app/documents?search=${encodeURIComponent(row.display_name)}`,
    };
  }

  const selectColumns = "id, display_name, category";
  const [byDisplayName, byFilename] = await Promise.all([
    unwrapList(
      await supabase
        .from("documents")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("display_name", pattern)
        .limit(limit),
    ),
    unwrapList(
      await supabase
        .from("documents")
        .select(selectColumns)
        .eq("household_id", householdId)
        .ilike("original_filename", pattern)
        .limit(limit),
    ),
  ]);
  return mergeById([
    byDisplayName.map(toResult),
    byFilename.map(toResult),
  ]).slice(0, limit);
}

async function searchDecisions(
  supabase: SupabaseServerClient,
  householdId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultRow[]> {
  const rows = unwrapList(
    await supabase
      .from("decision_journal_entries")
      .select("id, title, status, decision_date")
      .eq("household_id", householdId)
      .ilike("title", pattern)
      .limit(limit),
  );
  return rows.map((row) => ({
    entityType: "decision",
    id: row.id,
    title: row.title,
    subtitle: `${DECISION_STATUS_LABELS[row.status as DecisionStatus]} • ${row.decision_date}`,
    href: `/app/decisions/${row.id}`,
  }));
}

/**
 * Runs all 16 entity searches in parallel and returns a flat, unsorted list
 * — group order/labeling is applied by groupSearchResults. Returns `[]`
 * immediately for a query shorter than MIN_QUERY_LENGTH, both to avoid a
 * near-unbounded fan-out scan across 16 tables on a 1-character query and
 * because a single character isn't a meaningful "partial name" match
 * anyway.
 */
export async function searchHousehold(
  supabase: SupabaseServerClient,
  householdId: string,
  rawQuery: string,
  limitPerEntity: number,
): Promise<SearchResultRow[]> {
  const trimmed = rawQuery.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return [];
  }
  const pattern = ilikePattern(trimmed);

  const results = await Promise.all([
    searchAccounts(supabase, householdId, pattern, limitPerEntity),
    searchTransactions(supabase, householdId, pattern, limitPerEntity),
    searchCategories(supabase, householdId, pattern, limitPerEntity),
    searchPeople(supabase, householdId, pattern, limitPerEntity),
    searchInstitutions(supabase, householdId, pattern, limitPerEntity),
    searchInvestments(supabase, householdId, pattern, limitPerEntity),
    searchSips(supabase, householdId, pattern, limitPerEntity),
    searchStakingPositions(supabase, householdId, pattern, limitPerEntity),
    searchLoans(supabase, householdId, pattern, limitPerEntity),
    searchBorrowers(supabase, householdId, pattern, limitPerEntity),
    searchInsurancePolicies(supabase, householdId, pattern, limitPerEntity),
    searchAssets(supabase, householdId, pattern, limitPerEntity),
    searchLiabilities(supabase, householdId, pattern, limitPerEntity),
    searchGoals(supabase, householdId, pattern, limitPerEntity),
    searchDocuments(supabase, householdId, pattern, limitPerEntity),
    searchDecisions(supabase, householdId, pattern, limitPerEntity),
  ]);

  return results.flat();
}

/** Buckets a flat result list into the fixed SEARCH_ENTITY_ORDER, dropping any entity type with zero matches — "grouped results" with no empty sections. */
export function groupSearchResults(
  rows: readonly SearchResultRow[],
): SearchResultGroup[] {
  const byType = new Map<SearchEntityType, SearchResultRow[]>();
  for (const row of rows) {
    const list = byType.get(row.entityType) ?? [];
    list.push(row);
    byType.set(row.entityType, list);
  }
  return SEARCH_ENTITY_ORDER.filter((entityType) => byType.has(entityType)).map(
    (entityType) => ({
      entityType,
      label: SEARCH_ENTITY_LABELS[entityType],
      rows: byType.get(entityType) ?? [],
    }),
  );
}
