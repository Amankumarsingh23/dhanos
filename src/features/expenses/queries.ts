import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import {
  bucketClassification,
  computeAverageDailySpend,
  computeMonthOverMonth,
  netExpenseAmount,
  type CategoryClassification,
  type MonthOverMonthComparison,
} from "@/lib/calculations/expense-analysis";
import { toIsoDateString } from "@/lib/dates";
import type { ExpenseFilters } from "@/lib/validation/expenses";
import type { Tables } from "@/types/database";

export type ExpenseTransactionRecord = Tables<"transactions">;
export type ExpenseSplitRecord = Tables<"transaction_splits">;
export type ExpenseAttachmentRecord = Tables<"attachments">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ExpenseRow = ExpenseTransactionRecord & {
  accountName: string | null;
  categoryName: string | null;
  categoryClassification: CategoryClassification;
  personName: string | null;
  splitCount: number;
  receiptCount: number;
  /** Sum of non-cancelled refunds against this expense — see getRefundedAmount in src/features/transactions/queries.ts. */
  refundedAmountMinorUnits: number;
};

type RawExpenseRow = ExpenseTransactionRecord & {
  account: { name: string } | null;
  category: { name: string; classification: string | null } | null;
  person: { display_name: string } | null;
  splits: { count: number }[] | null;
};

const EXPENSE_SELECT =
  "*, account:financial_accounts!transactions_account_id_fkey(name), category:transaction_categories(name, classification), person:people(display_name), splits:transaction_splits(count)";

/**
 * Batched refunded-amount lookup for a set of expense transactions — one
 * query for the whole set, never one per row. A feature-local copy of the
 * same pattern used in src/features/transactions/queries.ts (kept local
 * rather than imported since that helper isn't exported — each feature
 * owns its own read queries, same convention as src/features/income).
 */
async function fetchRefundedAmounts(
  supabase: SupabaseServerClient,
  householdId: string,
  expenseTransactionIds: string[],
): Promise<Map<string, number>> {
  if (expenseTransactionIds.length === 0) {
    return new Map();
  }

  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("reverses_transaction_id, amount_minor_units")
      .eq("household_id", householdId)
      .in("reverses_transaction_id", expenseTransactionIds)
      .neq("status", "cancelled"),
  );

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.reverses_transaction_id) {
      continue;
    }
    totals.set(
      row.reverses_transaction_id,
      (totals.get(row.reverses_transaction_id) ?? 0) + row.amount_minor_units,
    );
  }
  return totals;
}

/** Batched receipt-count lookup for a page of expenses — one query, not one per row. */
async function fetchReceiptCounts(
  supabase: SupabaseServerClient,
  householdId: string,
  transactionIds: string[],
): Promise<Map<string, number>> {
  if (transactionIds.length === 0) {
    return new Map();
  }

  const rows = unwrapList(
    await supabase
      .from("attachments")
      .select("attachable_id")
      .eq("household_id", householdId)
      .eq("attachable_type", "transaction")
      .in("attachable_id", transactionIds),
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.attachable_id, (counts.get(row.attachable_id) ?? 0) + 1);
  }
  return counts;
}

function mapRow(
  row: RawExpenseRow,
  refundedAmountMinorUnits: number,
  receiptCount: number,
): ExpenseRow {
  const { account, category, person, splits, ...rest } = row;
  return {
    ...rest,
    accountName: account?.name ?? null,
    categoryName: category?.name ?? null,
    categoryClassification:
      (category?.classification as CategoryClassification) ?? null,
    personName: person?.display_name ?? null,
    splitCount: splits?.[0]?.count ?? 0,
    refundedAmountMinorUnits,
    receiptCount,
  };
}

/** The category ids in a household whose classification falls into one bucket — see bucketClassification. */
async function fetchCategoryIdsForBucket(
  supabase: SupabaseServerClient,
  householdId: string,
  bucket: "essential" | "discretionary",
): Promise<string[]> {
  const classifications =
    bucket === "essential" ? ["need", "obligation", "protection"] : ["want"];

  const rows = unwrapList(
    await supabase
      .from("transaction_categories")
      .select("id")
      .eq("household_id", householdId)
      .in("classification", classifications),
  );
  return rows.map((row) => row.id);
}

/**
 * Lists a household's expenses (kind = 'expense'), following the standard
 * query contract (see docs/data-access-patterns.md §2): household-scoped,
 * paginated, deterministically ordered, explicit about cancelled rows, and
 * searchable by counterparty/description. Powers every flat-list expense
 * view (all / this month / essentials / discretionary / irregular /
 * recurring / unplanned) — see src/lib/validation/expenses.ts's
 * ExpenseFilters for how each view maps to a filter combination.
 */
export async function listExpenses(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: ExpenseFilters = {},
  paginationInput: unknown = {},
): Promise<Page<ExpenseRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("transactions").select(EXPENSE_SELECT);
  query = scopeToHousehold(query, householdId);
  query = query.eq("kind", "expense");

  if (filters.includeCancelled) {
    // no-op: all statuses included
  } else {
    query = query.neq("status", "cancelled");
  }

  if (filters.accountId) {
    query = query.eq("account_id", filters.accountId);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.relatedPersonId) {
    query = query.eq("related_person_id", filters.relatedPersonId);
  }
  if (filters.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("transaction_date", filters.dateTo);
  }
  if (filters.isRecurring === true) {
    query = query.not("recurring_rule_id", "is", null);
  } else if (filters.isRecurring === false) {
    query = query.is("recurring_rule_id", null);
  }
  if (filters.isPlanned === true) {
    query = query.eq("is_planned", true);
  } else if (filters.isPlanned === false) {
    query = query.eq("is_planned", false);
  }

  if (filters.classificationBucket) {
    const categoryIds = await fetchCategoryIdsForBucket(
      supabase,
      householdId,
      filters.classificationBucket,
    );
    if (categoryIds.length === 0) {
      return {
        rows: [],
        page: pagination.page,
        pageSize: pagination.pageSize,
        hasMore: false,
      };
    }
    query = query.in("category_id", categoryIds);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.or(
      `counterparty.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  query = applyDeterministicOrder(query, "transaction_date", "desc");

  const rows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawExpenseRow[];

  const ids = rows.map((row) => row.id);
  const [refundedAmounts, receiptCounts] = await Promise.all([
    fetchRefundedAmounts(supabase, householdId, ids),
    fetchReceiptCounts(supabase, householdId, ids),
  ]);

  const mapped = rows.map((row) =>
    mapRow(
      row,
      refundedAmounts.get(row.id) ?? 0,
      receiptCounts.get(row.id) ?? 0,
    ),
  );

  return toPage(mapped, pagination);
}

/** Fetches the splits for one expense, for the edit dialog to prefill. */
export async function listExpenseSplits(
  supabase: SupabaseServerClient,
  householdId: string,
  transactionId: string,
): Promise<ExpenseSplitRecord[]> {
  return unwrapList(
    await supabase
      .from("transaction_splits")
      .select("*")
      .eq("household_id", householdId)
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true }),
  );
}

/** Receipts attached to one expense — see attachExpenseReceiptAction. */
export async function listExpenseReceipts(
  supabase: SupabaseServerClient,
  householdId: string,
  transactionId: string,
): Promise<ExpenseAttachmentRecord[]> {
  return unwrapList(
    await supabase
      .from("attachments")
      .select("*")
      .eq("household_id", householdId)
      .eq("attachable_type", "transaction")
      .eq("attachable_id", transactionId)
      .order("created_at", { ascending: false }),
  );
}

type RawNetExpenseRow = {
  id: string;
  category_id: string | null;
  related_person_id: string | null;
  counterparty: string | null;
  transaction_date: string;
  amount_minor_units: number;
  is_planned: boolean;
  recurring_rule_id: string | null;
};

type NetExpenseRow = RawNetExpenseRow & { netAmountMinorUnits: number };

/**
 * Every expense analysis output below reads kind = 'expense',
 * status = 'cleared' (see docs/money-calculation-rules.md, "reports use
 * cleared transactions by default") within [dateFrom, dateTo], and nets
 * each row against its own refunds — regardless of which period the
 * refund itself landed in — so "refunds reduce the appropriate totals"
 * (PROMPT 12 acceptance criterion) holds no matter how a refund's date
 * relates to the reporting window.
 */
async function fetchNetExpenseRows(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<NetExpenseRow[]> {
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select(
        "id, category_id, related_person_id, counterparty, transaction_date, amount_minor_units, is_planned, recurring_rule_id",
      )
      .eq("household_id", householdId)
      .eq("kind", "expense")
      .eq("status", "cleared")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo),
  );

  const refunded = await fetchRefundedAmounts(
    supabase,
    householdId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    netAmountMinorUnits: netExpenseAmount(
      row.amount_minor_units,
      refunded.get(row.id) ?? 0,
    ),
  }));
}

async function fetchCategoryLookup(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<Map<string, { name: string; classification: string | null }>> {
  const rows = unwrapList(
    await supabase
      .from("transaction_categories")
      .select("id, name, classification")
      .eq("household_id", householdId),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, classification: row.classification },
    ]),
  );
}

export type ExpenseByCategoryRow = {
  categoryId: string | null;
  categoryName: string;
  classification: CategoryClassification;
  totalMinorUnits: number;
  transactionCount: number;
};

/** Net expense totals grouped by category — PROMPT 12's "category totals" analysis output, also the data behind the "By category" view. */
export async function getExpenseByCategory(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExpenseByCategoryRow[]> {
  const [rows, categories] = await Promise.all([
    fetchNetExpenseRows(supabase, householdId, dateFrom, dateTo),
    fetchCategoryLookup(supabase, householdId),
  ]);

  const totals = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const key = row.category_id ?? "__none__";
    const existing = totals.get(key) ?? { total: 0, count: 0 };
    existing.total += row.netAmountMinorUnits;
    existing.count += 1;
    totals.set(key, existing);
  }

  return Array.from(totals.entries())
    .map(([key, { total, count }]) => ({
      categoryId: key === "__none__" ? null : key,
      categoryName:
        key === "__none__"
          ? "Uncategorized"
          : (categories.get(key)?.name ?? "Unknown category"),
      classification:
        key === "__none__"
          ? null
          : ((categories.get(key)?.classification ??
              null) as CategoryClassification),
      totalMinorUnits: total,
      transactionCount: count,
    }))
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

export type ExpenseByPersonRow = {
  personId: string | null;
  personName: string;
  totalMinorUnits: number;
  transactionCount: number;
};

/** Net expense totals grouped by family member — data behind the "By family member" view. */
export async function getExpenseByPerson(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExpenseByPersonRow[]> {
  const [rows, people] = await Promise.all([
    fetchNetExpenseRows(supabase, householdId, dateFrom, dateTo),
    unwrapList(
      await supabase
        .from("people")
        .select("id, display_name")
        .eq("household_id", householdId),
    ),
  ]);

  const personNames = new Map(people.map((p) => [p.id, p.display_name]));
  const totals = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const key = row.related_person_id ?? "__none__";
    const existing = totals.get(key) ?? { total: 0, count: 0 };
    existing.total += row.netAmountMinorUnits;
    existing.count += 1;
    totals.set(key, existing);
  }

  return Array.from(totals.entries())
    .map(([key, { total, count }]) => ({
      personId: key === "__none__" ? null : key,
      personName:
        key === "__none__"
          ? "Unassigned"
          : (personNames.get(key) ?? "Unknown person"),
      totalMinorUnits: total,
      transactionCount: count,
    }))
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

export type ExpenseByMerchantRow = {
  merchant: string;
  totalMinorUnits: number;
  transactionCount: number;
};

/** Net expense totals grouped by merchant/counterparty — data behind the "By merchant" view. Grouped case-insensitively; displayed using the first-seen casing. */
export async function getExpenseByMerchant(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExpenseByMerchantRow[]> {
  const rows = await fetchNetExpenseRows(
    supabase,
    householdId,
    dateFrom,
    dateTo,
  );

  const totals = new Map<
    string,
    { display: string; total: number; count: number }
  >();
  for (const row of rows) {
    const trimmed = row.counterparty?.trim() ?? "";
    const key = trimmed === "" ? "__none__" : trimmed.toLowerCase();
    const existing = totals.get(key) ?? {
      display: trimmed === "" ? "No merchant" : trimmed,
      total: 0,
      count: 0,
    };
    existing.total += row.netAmountMinorUnits;
    existing.count += 1;
    totals.set(key, existing);
  }

  return Array.from(totals.values())
    .map(({ display, total, count }) => ({
      merchant: display,
      totalMinorUnits: total,
      transactionCount: count,
    }))
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

export type ExpenseSummary = {
  totalMinorUnits: number;
  essentialMinorUnits: number;
  discretionaryMinorUnits: number;
  unclassifiedMinorUnits: number;
  unplannedMinorUnits: number;
  averageDailySpendMinorUnits: number;
  transactionCount: number;
};

/** The core deterministic summary PROMPT 12 asks for: essential amount, discretionary amount, unplanned amount, and average daily spend, all net of refunds, over one date range. */
export async function getExpenseSummary(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExpenseSummary> {
  const [rows, categories] = await Promise.all([
    fetchNetExpenseRows(supabase, householdId, dateFrom, dateTo),
    fetchCategoryLookup(supabase, householdId),
  ]);

  let total = 0;
  let essential = 0;
  let discretionary = 0;
  let unclassified = 0;
  let unplanned = 0;

  for (const row of rows) {
    total += row.netAmountMinorUnits;
    if (!row.is_planned) {
      unplanned += row.netAmountMinorUnits;
    }
    const classification = row.category_id
      ? ((categories.get(row.category_id)?.classification ??
          null) as CategoryClassification)
      : null;
    const bucket = bucketClassification(classification);
    if (bucket === "essential") {
      essential += row.netAmountMinorUnits;
    } else if (bucket === "discretionary") {
      discretionary += row.netAmountMinorUnits;
    } else {
      unclassified += row.netAmountMinorUnits;
    }
  }

  return {
    totalMinorUnits: total,
    essentialMinorUnits: essential,
    discretionaryMinorUnits: discretionary,
    unclassifiedMinorUnits: unclassified,
    unplannedMinorUnits: unplanned,
    averageDailySpendMinorUnits: computeAverageDailySpend(
      total,
      dateFrom,
      dateTo,
    ),
    transactionCount: rows.length,
  };
}

/** This-month-to-date vs the full previous calendar month, both net of refunds — PROMPT 12's "month-over-month comparison." */
export async function getExpenseMonthOverMonth(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<MonthOverMonthComparison> {
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  const currentMonthStart = toIsoDateString(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)),
  );
  const previousMonthStart = toIsoDateString(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1)),
  );
  const previousMonthEnd = toIsoDateString(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0)),
  );

  const [currentRows, previousRows] = await Promise.all([
    fetchNetExpenseRows(supabase, householdId, currentMonthStart, asOfDate),
    fetchNetExpenseRows(
      supabase,
      householdId,
      previousMonthStart,
      previousMonthEnd,
    ),
  ]);

  const currentTotal = currentRows.reduce(
    (sum, row) => sum + row.netAmountMinorUnits,
    0,
  );
  const previousTotal = previousRows.reduce(
    (sum, row) => sum + row.netAmountMinorUnits,
    0,
  );

  return computeMonthOverMonth(currentTotal, previousTotal);
}

export type ExpenseTrendRow = {
  monthKey: string;
  totalMinorUnits: number;
};

/** Monthly net-expense totals for the trailing `monthsBack` months (including the current month), oldest first — mirrors getIncomeTrend in src/features/income/queries.ts. */
export async function getExpenseTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<ExpenseTrendRow[]> {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  const dateFrom = toIsoDateString(rangeStart);

  const rows = await fetchNetExpenseRows(
    supabase,
    householdId,
    dateFrom,
    asOfDate,
  );

  const totals = new Map<string, number>();
  for (let i = 0; i < monthsBack; i++) {
    const monthDate = new Date(
      Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + i, 1),
    );
    const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    totals.set(key, 0);
  }

  for (const row of rows) {
    const key = row.transaction_date.slice(0, 7);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.netAmountMinorUnits);
    }
  }

  return Array.from(totals.entries()).map(([monthKey, totalMinorUnits]) => ({
    monthKey,
    totalMinorUnits,
  }));
}

export type LargestExpenseRow = ExpenseRow;

/**
 * The largest single expenses (net of their own refunds) in a date range —
 * PROMPT 12's "largest expenses" analysis output. Overfetches by gross
 * amount (bounded to a reasonable multiple of the requested limit) so a
 * heavily-refunded large expense can still be correctly out-ranked by net
 * amount without scanning the household's entire expense history.
 */
export async function getLargestExpenses(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
  limit = 10,
): Promise<LargestExpenseRow[]> {
  const overfetchLimit = Math.max(limit * 5, 50);

  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select(EXPENSE_SELECT)
      .eq("household_id", householdId)
      .eq("kind", "expense")
      .eq("status", "cleared")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("amount_minor_units", { ascending: false })
      .limit(overfetchLimit),
  ) as unknown as RawExpenseRow[];

  const ids = rows.map((row) => row.id);
  const [refundedAmounts, receiptCounts] = await Promise.all([
    fetchRefundedAmounts(supabase, householdId, ids),
    fetchReceiptCounts(supabase, householdId, ids),
  ]);

  return rows
    .map((row) =>
      mapRow(
        row,
        refundedAmounts.get(row.id) ?? 0,
        receiptCounts.get(row.id) ?? 0,
      ),
    )
    .sort(
      (a, b) =>
        b.amount_minor_units -
        b.refundedAmountMinorUnits -
        (a.amount_minor_units - a.refundedAmountMinorUnits),
    )
    .slice(0, limit);
}
