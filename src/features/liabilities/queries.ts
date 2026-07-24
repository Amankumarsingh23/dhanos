import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  computeLiabilityBalanceHistory,
  computeLiabilityOutstanding,
  selectEffectivePayments,
  type LiabilityBalancePoint,
} from "@/lib/calculations/liability-outstanding";
import {
  computeCombinedDebtBreakdown,
  computeLiabilityTotals,
  groupLiabilitiesByCategory,
  type CombinedDebtBreakdown,
  type LiabilityCategoryRow,
  type LiabilityForTotals,
  type LiabilityTotals,
} from "@/lib/calculations/liability-metrics";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import type {
  LiabilityCategory,
  LiabilityCertainty,
  LiabilityFilters,
  LiabilitySource,
} from "@/lib/validation/liabilities";
import { getDebtSummary } from "@/features/loans/queries";
import type { Tables } from "@/types/database";

export type LiabilityRecord = Tables<"liabilities">;
export type LiabilityPaymentRecord = Tables<"liability_payments">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawLiabilityRow = LiabilityRecord & {
  counterparty_person: { display_name: string } | null;
  counterparty_institution: { name: string } | null;
  payment_account: { name: string } | null;
  receiving_account: { name: string } | null;
};

const LIABILITY_SELECT = `
  *,
  counterparty_person:people!liabilities_counterparty_person_id_fkey(display_name),
  counterparty_institution:institutions!liabilities_counterparty_institution_id_fkey(name),
  payment_account:financial_accounts!liabilities_payment_account_id_fkey(name),
  receiving_account:financial_accounts!liabilities_receiving_account_id_fkey(name)
`;

export type LiabilityRow = LiabilityRecord & {
  counterpartyName: string | null;
  paymentAccountName: string;
  receivingAccountName: string | null;
  outstandingMinorUnits: number;
  totalPrincipalPaidMinorUnits: number;
  totalInterestPaidMinorUnits: number;
  totalExcessMinorUnits: number;
};

function mapLiabilityRow(
  row: RawLiabilityRow,
  effectivePayments: readonly LiabilityPaymentRecord[],
): LiabilityRow {
  const {
    counterparty_person,
    counterparty_institution,
    payment_account,
    receiving_account,
    ...rest
  } = row;

  const outstanding = computeLiabilityOutstanding(
    rest.amount_minor_units,
    effectivePayments.map((payment) => ({
      principalComponentMinorUnits: payment.principal_component_minor_units,
      interestComponentMinorUnits: payment.interest_component_minor_units,
      excessAmountMinorUnits: payment.excess_amount_minor_units,
    })),
  );

  return {
    ...rest,
    counterpartyName:
      counterparty_institution?.name ??
      counterparty_person?.display_name ??
      null,
    paymentAccountName: payment_account?.name ?? "Unknown account",
    receivingAccountName: receiving_account?.name ?? null,
    outstandingMinorUnits: outstanding.outstandingMinorUnits,
    totalPrincipalPaidMinorUnits: outstanding.totalPrincipalPaidMinorUnits,
    totalInterestPaidMinorUnits: outstanding.totalInterestPaidMinorUnits,
    totalExcessMinorUnits: outstanding.totalExcessMinorUnits,
  };
}

async function fetchPaymentsByLiability(
  supabase: SupabaseServerClient,
  householdId: string,
  liabilityIds: string[],
): Promise<Map<string, LiabilityPaymentRecord[]>> {
  if (liabilityIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("liability_payments")
      .select("*")
      .eq("household_id", householdId)
      .in("liability_id", liabilityIds)
      .order("payment_date", { ascending: true }),
  );

  const byLiability = new Map<string, LiabilityPaymentRecord[]>();
  for (const row of rows) {
    const list = byLiability.get(row.liability_id) ?? [];
    list.push(row);
    byLiability.set(row.liability_id, list);
  }
  return byLiability;
}

function toEffectivePayments(
  payments: readonly LiabilityPaymentRecord[],
): LiabilityPaymentRecord[] {
  return selectEffectivePayments(
    payments.map((payment) => ({
      id: payment.id,
      reversesPaymentId: payment.reverses_payment_id,
      principalComponentMinorUnits: payment.principal_component_minor_units,
      original: payment,
    })),
  ).map((payment) => payment.original);
}

/**
 * Lists a household's liabilities, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * name. Outstanding is computed for the whole page from a fixed, small
 * number of queries — never one per liability.
 */
export async function listLiabilities(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: LiabilityFilters = {},
  paginationInput: unknown = {},
): Promise<Page<LiabilityRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("liabilities").select(LIABILITY_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.liabilitySource) {
    query = query.eq("liability_source", filters.liabilitySource);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.certainty) {
    query = query.eq("certainty", filters.certainty);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawLiabilityRow[];
  const page = toPage(rawRows, pagination);

  const paymentsByLiability = await fetchPaymentsByLiability(
    supabase,
    householdId,
    page.rows.map((row) => row.id),
  );

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapLiabilityRow(
        row,
        toEffectivePayments(paymentsByLiability.get(row.id) ?? []),
      ),
    ),
  };
}

export type LiabilityDetail = LiabilityRow & {
  allPayments: LiabilityPaymentRecord[];
  balanceHistory: LiabilityBalancePoint[];
};

export async function getLiabilityDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  liabilityId: string,
): Promise<LiabilityDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("liabilities")
      .select(LIABILITY_SELECT)
      .eq("household_id", householdId)
      .eq("id", liabilityId)
      .maybeSingle(),
  ) as unknown as RawLiabilityRow;

  const allPayments = unwrapList(
    await supabase
      .from("liability_payments")
      .select("*")
      .eq("household_id", householdId)
      .eq("liability_id", liabilityId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  );

  const effectiveByDate = [...toEffectivePayments(allPayments)].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date),
  );

  const balanceHistory = computeLiabilityBalanceHistory(
    raw.amount_minor_units,
    effectiveByDate.map((payment) => ({
      paymentDate: payment.payment_date,
      principalComponentMinorUnits: payment.principal_component_minor_units,
      interestComponentMinorUnits: payment.interest_component_minor_units,
    })),
  );

  return {
    ...mapLiabilityRow(raw, effectiveByDate),
    allPayments,
    balanceHistory,
  };
}

export type LiabilitiesOverview = {
  currencyCode: string;
  totals: LiabilityTotals;
  categoryBreakdown: LiabilityCategoryRow[];
  combinedDebt: CombinedDebtBreakdown;
};

/**
 * The single combined fetch behind the liabilities register's summary
 * section (PROMPT 24: "integrate with total debt but keep institutional
 * and informal debt distinguishable") — every liability in one query,
 * combined with loans' own getDebtSummary (institutional debt), never
 * blended into one unlabeled number.
 */
export async function getLiabilitiesOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<LiabilitiesOverview> {
  const liabilitiesPage = await listLiabilities(
    supabase,
    householdId,
    {},
    { pageSize: MAX_PAGE_SIZE },
  );
  const liabilities = liabilitiesPage.rows;

  const totalsInput: LiabilityForTotals[] = liabilities.map((liability) => ({
    currencyCode: liability.currency_code,
    status: liability.status,
    liabilitySource: liability.liability_source as LiabilitySource,
    category: liability.category as LiabilityCategory,
    certainty: liability.certainty as LiabilityCertainty,
    outstandingMinorUnits: liability.outstandingMinorUnits,
  }));

  const totals = computeLiabilityTotals(totalsInput, currencyCode);
  const categoryBreakdown = groupLiabilitiesByCategory(
    totalsInput,
    currencyCode,
  );

  const debtSummary = await getDebtSummary(supabase, householdId, currencyCode);
  const combinedDebt = computeCombinedDebtBreakdown(
    debtSummary.totalOutstandingMinorUnits,
    totals,
  );

  return { currencyCode, totals, categoryBreakdown, combinedDebt };
}
