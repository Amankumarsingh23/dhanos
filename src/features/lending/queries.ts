import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import {
  computeLendingOutstanding,
  computeLendingRecoveryHistory,
  selectEffectiveRepayments,
  type LendingRecoveryPoint,
} from "@/lib/calculations/lending-outstanding";
import {
  computeLendingOverdue,
  computeLendingTotals,
  groupLendingByBorrower,
  isLendingUpcoming,
  type BorrowerExposureRow,
  type LendingForTotals,
  type LendingOverdueResult,
  type LendingTotals,
} from "@/lib/calculations/lending-metrics";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import type { LendingFilters } from "@/lib/validation/lending";
import type { Tables } from "@/types/database";

export type LendingRecord = Tables<"lendings">;
export type LendingRepaymentRecord = Tables<"lending_repayments">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawLendingRow = LendingRecord & {
  borrower_person: { display_name: string } | null;
  borrower_institution: { name: string } | null;
  source_account: { name: string } | null;
};

const LENDING_SELECT = `
  *,
  borrower_person:people!lendings_borrower_person_id_fkey(display_name),
  borrower_institution:institutions!lendings_borrower_institution_id_fkey(name),
  source_account:financial_accounts!lendings_source_account_id_fkey(name)
`;

export type LendingRow = LendingRecord & {
  borrowerName: string;
  sourceAccountName: string;
  outstandingMinorUnits: number;
  totalPrincipalRecoveredMinorUnits: number;
  totalInterestReceivedMinorUnits: number;
  totalExcessMinorUnits: number;
};

function mapLendingRow(
  row: RawLendingRow,
  effectiveRepayments: readonly LendingRepaymentRecord[],
): LendingRow {
  const { borrower_person, borrower_institution, source_account, ...rest } =
    row;

  const outstanding = computeLendingOutstanding(
    rest.amount_lent_minor_units,
    effectiveRepayments.map((repayment) => ({
      principalComponentMinorUnits: repayment.principal_component_minor_units,
      interestComponentMinorUnits: repayment.interest_component_minor_units,
      excessAmountMinorUnits: repayment.excess_amount_minor_units,
    })),
  );

  return {
    ...rest,
    borrowerName:
      borrower_institution?.name ??
      borrower_person?.display_name ??
      "Unknown borrower",
    sourceAccountName: source_account?.name ?? "Unknown account",
    outstandingMinorUnits: outstanding.outstandingMinorUnits,
    totalPrincipalRecoveredMinorUnits:
      outstanding.totalPrincipalRecoveredMinorUnits,
    totalInterestReceivedMinorUnits:
      outstanding.totalInterestReceivedMinorUnits,
    totalExcessMinorUnits: outstanding.totalExcessMinorUnits,
  };
}

/**
 * Every lending_repayments row for a set of lendings, in one query — same
 * no-N+1 shape as src/features/loans/queries.ts's fetchPaymentsByLoan.
 * Callers narrow to "effective" repayments via selectEffectiveRepayments
 * before computing outstanding, so a reversed repayment and its reversal
 * never double-count.
 */
async function fetchRepaymentsByLending(
  supabase: SupabaseServerClient,
  householdId: string,
  lendingIds: string[],
): Promise<Map<string, LendingRepaymentRecord[]>> {
  if (lendingIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("lending_repayments")
      .select("*")
      .eq("household_id", householdId)
      .in("lending_id", lendingIds)
      .order("repayment_date", { ascending: true }),
  );

  const byLending = new Map<string, LendingRepaymentRecord[]>();
  for (const row of rows) {
    const list = byLending.get(row.lending_id) ?? [];
    list.push(row);
    byLending.set(row.lending_id, list);
  }
  return byLending;
}

/**
 * Filters a full list of lending_repayments rows down to the "effective"
 * ones (excluding a reversed repayment and its reversal row — see
 * src/lib/calculations/lending-outstanding.ts), while preserving every
 * column of the original record.
 */
function toEffectiveRepayments(
  repayments: readonly LendingRepaymentRecord[],
): LendingRepaymentRecord[] {
  return selectEffectiveRepayments(
    repayments.map((repayment) => ({
      id: repayment.id,
      reversesRepaymentId: repayment.reverses_repayment_id,
      principalComponentMinorUnits: repayment.principal_component_minor_units,
      original: repayment,
    })),
  ).map((repayment) => repayment.original);
}

/**
 * Lists a household's lendings, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * name. Outstanding is computed for the whole page from a fixed, small
 * number of queries — never one per lending.
 */
export async function listLendings(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: LendingFilters = {},
  paginationInput: unknown = {},
): Promise<Page<LendingRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("lendings").select(LENDING_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.riskLevel) {
    query = query.eq("risk_level", filters.riskLevel);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawLendingRow[];
  const page = toPage(rawRows, pagination);

  const repaymentsByLending = await fetchRepaymentsByLending(
    supabase,
    householdId,
    page.rows.map((row) => row.id),
  );

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapLendingRow(
        row,
        toEffectiveRepayments(repaymentsByLending.get(row.id) ?? []),
      ),
    ),
  };
}

export type LendingDetail = LendingRow & {
  /** Every recorded repayment, including reversed originals and their reversal rows — the full, never-overwritten audit trail. */
  allRepayments: LendingRepaymentRecord[];
  /** Actual-recovery series for the "recovery history" view — PROMPT 23. */
  recoveryHistory: LendingRecoveryPoint[];
};

export async function getLendingDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  lendingId: string,
): Promise<LendingDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("lendings")
      .select(LENDING_SELECT)
      .eq("household_id", householdId)
      .eq("id", lendingId)
      .maybeSingle(),
  ) as unknown as RawLendingRow;

  const allRepayments = unwrapList(
    await supabase
      .from("lending_repayments")
      .select("*")
      .eq("household_id", householdId)
      .eq("lending_id", lendingId)
      .order("repayment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  );

  const effectiveByDate = [...toEffectiveRepayments(allRepayments)].sort(
    (a, b) => a.repayment_date.localeCompare(b.repayment_date),
  );

  const recoveryHistory = computeLendingRecoveryHistory(
    raw.amount_lent_minor_units,
    effectiveByDate.map((repayment) => ({
      repaymentDate: repayment.repayment_date,
      principalComponentMinorUnits: repayment.principal_component_minor_units,
      interestComponentMinorUnits: repayment.interest_component_minor_units,
    })),
  );

  return {
    ...mapLendingRow(raw, effectiveByDate),
    allRepayments,
    recoveryHistory,
  };
}

export type LendingWithOverdue = LendingRow & { overdue: LendingOverdueResult };

export type LendingOverviewData = {
  currencyCode: string;
  asOfDate: string;
  totals: LendingTotals;
  borrowerExposure: BorrowerExposureRow[];
  /** A household-wide recovery series — treats every lending ever recorded in `currencyCode` as one combined balance, so it can reuse computeLendingRecoveryHistory's single "amount lent minus recovered" curve. Built only from real repayments, same "actual, never projected" rule as a single lending's own chart. */
  recoveryHistory: LendingRecoveryPoint[];
  overdue: LendingWithOverdue[];
  upcoming: LendingRow[];
};

/**
 * The single combined fetch behind the lending overview (PROMPT 23's
 * "Views": total lent, total outstanding, overdue, upcoming, borrower
 * exposure, recovery history) — every lending plus every one of its
 * repayments, fetched once each, then run through the pure calculators in
 * src/lib/calculations/lending-metrics.ts. `currencyCode` scopes every
 * total/grouping — lending is never blended across currencies.
 */
export async function getLendingOverviewData(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<LendingOverviewData> {
  const lendingsPage = await listLendings(
    supabase,
    householdId,
    {},
    { pageSize: MAX_PAGE_SIZE },
  );
  const lendings = lendingsPage.rows;
  const inCurrency = lendings.filter(
    (lending) => lending.currency_code === currencyCode,
  );

  const totalsInput: LendingForTotals[] = lendings.map((lending) => ({
    currencyCode: lending.currency_code,
    status: lending.status,
    borrowerKey: lending.borrowerName,
    amountLentMinorUnits: lending.amount_lent_minor_units,
    outstandingMinorUnits: lending.outstandingMinorUnits,
    principalRecoveredMinorUnits: lending.totalPrincipalRecoveredMinorUnits,
    interestReceivedMinorUnits: lending.totalInterestReceivedMinorUnits,
  }));

  const totals = computeLendingTotals(totalsInput, currencyCode);
  const borrowerExposure = groupLendingByBorrower(totalsInput, currencyCode);

  const overdue: LendingWithOverdue[] = [];
  const upcoming: LendingRow[] = [];
  for (const lending of inCurrency) {
    const schedule = {
      status: lending.status,
      expectedRepaymentDate: lending.expected_repayment_date,
    };
    const overdueResult = computeLendingOverdue(
      schedule,
      lending.outstandingMinorUnits,
      asOfDate,
    );
    if (overdueResult.trackable) {
      overdue.push({ ...lending, overdue: overdueResult });
    }
    if (isLendingUpcoming(schedule, lending.outstandingMinorUnits, asOfDate)) {
      upcoming.push(lending);
    }
  }
  overdue.sort((a, b) =>
    a.overdue.trackable && b.overdue.trackable
      ? b.overdue.daysOverdue - a.overdue.daysOverdue
      : 0,
  );
  upcoming.sort((a, b) =>
    (a.expected_repayment_date ?? "").localeCompare(
      b.expected_repayment_date ?? "",
    ),
  );

  const repaymentsByLending = await fetchRepaymentsByLending(
    supabase,
    householdId,
    lendings.map((lending) => lending.id),
  );
  const allEffectiveRepayments = inCurrency
    .flatMap((lending) =>
      toEffectiveRepayments(repaymentsByLending.get(lending.id) ?? []),
    )
    .sort((a, b) => a.repayment_date.localeCompare(b.repayment_date));
  const lifetimeLentInCurrency = inCurrency.reduce(
    (sum, lending) => sum + lending.amount_lent_minor_units,
    0,
  );
  const recoveryHistory = computeLendingRecoveryHistory(
    lifetimeLentInCurrency,
    allEffectiveRepayments.map((repayment) => ({
      repaymentDate: repayment.repayment_date,
      principalComponentMinorUnits: repayment.principal_component_minor_units,
      interestComponentMinorUnits: repayment.interest_component_minor_units,
    })),
  );

  return {
    currencyCode,
    asOfDate,
    totals,
    borrowerExposure,
    recoveryHistory,
    overdue,
    upcoming,
  };
}
