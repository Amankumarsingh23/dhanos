import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  computeLoanBalanceHistory,
  computeLoanOutstanding,
  selectEffectivePayments,
  type LoanBalancePoint,
} from "@/lib/calculations/loan-outstanding";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { LoanFilters } from "@/lib/validation/loans";
import type { Tables } from "@/types/database";

export type LoanRecord = Tables<"loans">;
export type LoanPaymentRecord = Tables<"loan_payments">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawLoanRow = LoanRecord & {
  lender_institution: { name: string } | null;
  lender_person: { display_name: string } | null;
  borrower: { display_name: string } | null;
  co_borrower: { display_name: string } | null;
  payment_account: { name: string } | null;
  educational_institution: { name: string } | null;
};

const LOAN_SELECT = `
  *,
  lender_institution:institutions!loans_lender_institution_id_fkey(name),
  lender_person:people!loans_lender_person_id_fkey(display_name),
  borrower:people!loans_borrower_person_id_fkey(display_name),
  co_borrower:people!loans_co_borrower_person_id_fkey(display_name),
  payment_account:financial_accounts!loans_payment_account_id_fkey(name),
  educational_institution:institutions!loans_educational_institution_id_fkey(name)
`;

export type LoanRow = LoanRecord & {
  lenderName: string;
  borrowerName: string;
  coBorrowerName: string | null;
  paymentAccountName: string;
  educationalInstitutionName: string | null;
  outstandingMinorUnits: number;
  totalPrincipalPaidMinorUnits: number;
  totalOverpaidMinorUnits: number;
};

function mapLoanRow(
  row: RawLoanRow,
  effectivePayments: readonly LoanPaymentRecord[],
): LoanRow {
  const {
    lender_institution,
    lender_person,
    borrower,
    co_borrower,
    payment_account,
    educational_institution,
    ...rest
  } = row;

  const outstanding = computeLoanOutstanding(
    rest.disbursed_amount_minor_units,
    effectivePayments.map((payment) => ({
      principalComponentMinorUnits: payment.principal_component_minor_units,
      overpaymentAmountMinorUnits: payment.overpayment_amount_minor_units,
    })),
  );

  return {
    ...rest,
    lenderName:
      lender_institution?.name ??
      lender_person?.display_name ??
      "Unknown lender",
    borrowerName: borrower?.display_name ?? "Unknown borrower",
    coBorrowerName: co_borrower?.display_name ?? null,
    paymentAccountName: payment_account?.name ?? "Unknown account",
    educationalInstitutionName: educational_institution?.name ?? null,
    outstandingMinorUnits: outstanding.outstandingMinorUnits,
    totalPrincipalPaidMinorUnits: outstanding.totalPrincipalPaidMinorUnits,
    totalOverpaidMinorUnits: outstanding.totalOverpaidMinorUnits,
  };
}

/**
 * Every loan_payments row (component amounts + reversal linkage) for a set
 * of loans, in one query — the same no-N+1 shape as
 * src/features/staking/queries.ts's fetchLatestSnapshots. Callers narrow
 * to "effective" payments via selectEffectivePayments before computing
 * outstanding, so a reversed payment and its reversal never double-count.
 */
async function fetchPaymentsByLoan(
  supabase: SupabaseServerClient,
  householdId: string,
  loanIds: string[],
): Promise<Map<string, LoanPaymentRecord[]>> {
  if (loanIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("loan_payments")
      .select("*")
      .eq("household_id", householdId)
      .in("loan_id", loanIds)
      .order("payment_date", { ascending: true }),
  );

  const byLoan = new Map<string, LoanPaymentRecord[]>();
  for (const row of rows) {
    const list = byLoan.get(row.loan_id) ?? [];
    list.push(row);
    byLoan.set(row.loan_id, list);
  }
  return byLoan;
}

/**
 * Filters a full list of loan_payments rows down to the "effective" ones
 * (excluding a reversed payment and its reversal row — see
 * src/lib/calculations/loan-outstanding.ts), while preserving every column
 * of the original record. selectEffectivePayments only requires the three
 * fields it actually inspects; carrying the rest through as `original`
 * lets one call reuse the pure, tested exclusion logic for both the list
 * page (which only needs principal/overpayment) and the detail page
 * (which needs the full row for the balance-history chart).
 */
function toEffectivePayments(
  payments: readonly LoanPaymentRecord[],
): LoanPaymentRecord[] {
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
 * Lists a household's loans, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * name. Outstanding is computed for the whole page from a fixed, small
 * number of queries — never one per loan.
 */
export async function listLoans(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: LoanFilters = {},
  paginationInput: unknown = {},
): Promise<Page<LoanRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("loans").select(LOAN_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.loanType) {
    query = query.eq("loan_type", filters.loanType);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawLoanRow[];
  const page = toPage(rawRows, pagination);

  const paymentsByLoan = await fetchPaymentsByLoan(
    supabase,
    householdId,
    page.rows.map((row) => row.id),
  );

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapLoanRow(row, toEffectivePayments(paymentsByLoan.get(row.id) ?? [])),
    ),
  };
}

export type LoanDetail = LoanRow & {
  /** Every recorded payment, including reversed originals and their reversal rows — the full, never-overwritten audit trail. */
  allPayments: LoanPaymentRecord[];
  /** Actual-payments-and-balances series for debt charts — PROMPT 21 acceptance criterion. */
  balanceHistory: LoanBalancePoint[];
};

export async function getLoanDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  loanId: string,
): Promise<LoanDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("loans")
      .select(LOAN_SELECT)
      .eq("household_id", householdId)
      .eq("id", loanId)
      .maybeSingle(),
  ) as unknown as RawLoanRow;

  const allPayments = unwrapList(
    await supabase
      .from("loan_payments")
      .select("*")
      .eq("household_id", householdId)
      .eq("loan_id", loanId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  );

  const effectiveByDate = [...toEffectivePayments(allPayments)].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date),
  );

  const balanceHistory = computeLoanBalanceHistory(
    raw.disbursed_amount_minor_units,
    effectiveByDate.map((payment) => ({
      paymentDate: payment.payment_date,
      principalComponentMinorUnits: payment.principal_component_minor_units,
      interestComponentMinorUnits: payment.interest_component_minor_units,
      feeComponentMinorUnits: payment.fee_component_minor_units,
      penaltyComponentMinorUnits: payment.penalty_component_minor_units,
    })),
  );

  return {
    ...mapLoanRow(raw, effectiveByDate),
    allPayments,
    balanceHistory,
  };
}

export type DebtSummary = {
  totalOutstandingMinorUnits: number;
  totalOriginalPrincipalMinorUnits: number;
  activeLoanCount: number;
  currencyCode: string;
};

/** Total outstanding across every active loan in one currency — the household's debt-summary figure. */
export async function getDebtSummary(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<DebtSummary> {
  const page = await listLoans(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
  );
  const inCurrency = page.rows.filter(
    (loan) => loan.currency_code === currencyCode,
  );

  return {
    totalOutstandingMinorUnits: inCurrency.reduce(
      (sum, loan) => sum + loan.outstandingMinorUnits,
      0,
    ),
    totalOriginalPrincipalMinorUnits: inCurrency.reduce(
      (sum, loan) => sum + loan.original_principal_minor_units,
      0,
    ),
    activeLoanCount: inCurrency.length,
    currencyCode,
  };
}
