/**
 * Pure arithmetic behind the core cash-flow dashboard (PROMPT 15). No
 * database access — every function here takes already-fetched,
 * already-netted minor-unit totals for one period and returns a derived
 * figure, so the same inputs always produce the same outputs.
 *
 * ## Which transaction kinds feed each dashboard card
 *
 * - **Income** — `kind = 'income'`, `status = 'cleared'`. Never `'refund'`
 *   (a refund reverses an expense, it is not earnings — see
 *   docs/money-calculation-rules.md §2).
 * - **Expenses** — `kind = 'expense'`, `status = 'cleared'`, net of any
 *   `kind = 'refund'` rows reversing them (see
 *   src/lib/calculations/expense-analysis.ts's `netExpenseAmount`, reused
 *   as-is via `getExpenseSummary`).
 * - **Investments** — `kind = 'investment_contribution'`,
 *   `status = 'cleared'`. `investment_withdrawal` (a sale) is never folded
 *   into this figure or into Income — a sale's proceeds are not earnings
 *   unless the household explicitly records the receipt as `kind = 'income'`.
 * - **Debt payments** — `kind = 'loan_payment'`, `status = 'cleared'`
 *   (principal + interest combined). `loan_disbursement` (money borrowed)
 *   is never counted here or as income — borrowing is not earning.
 * - **Insurance premiums** — the subset of the Expenses total whose
 *   category has `classification = 'protection'`. Informational only: it
 *   is already inside the Expenses total and is never added a second time.
 *
 * Never counted anywhere on this dashboard, by construction:
 * - transfers (`kind = 'transfer'`) — money moving between owned accounts,
 *   never income or expense (docs/money-calculation-rules.md §2).
 * - account-opening balances (`financial_accounts.opening_balance_minor_units`)
 *   — a starting point for balance calculation, not a period's cash flow.
 * - valuation gains — this app has no valuation-snapshot-derived "income"
 *   concept; an unrealized gain is never cash flow.
 * - `loan_disbursement` as income, or `investment_withdrawal` as income —
 *   see above.
 *
 * ## Free cash flow, savings rate, investment rate
 *
 * **Free cash flow** = Income − Expenses − Debt payments: what is left
 * after living costs and debt obligations, before any of it is allocated
 * to saving or investing.
 *
 * **Savings rate** = Free cash flow ÷ Income: the share of income not
 * consumed by expenses or debt service. Returns 0 (never NaN/Infinity)
 * when income is 0, mirroring src/lib/money's `calculateRatio`.
 *
 * **Investment rate** = Investments ÷ Income: the share of income actually
 * invested this period, independent of whether it was funded by this
 * period's free cash flow or drawn from savings held from an earlier one.
 */

export type CashFlowTotals = {
  incomeMinorUnits: number;
  expenseMinorUnits: number;
  investmentMinorUnits: number;
  debtPaymentMinorUnits: number;
};

export function computeFreeCashFlow(totals: CashFlowTotals): number {
  return (
    totals.incomeMinorUnits -
    totals.expenseMinorUnits -
    totals.debtPaymentMinorUnits
  );
}

/** 0 when income is 0 — a savings rate is undefined with no income, not infinite. */
export function computeSavingsRate(
  freeCashFlowMinorUnits: number,
  incomeMinorUnits: number,
): number {
  if (incomeMinorUnits === 0) {
    return 0;
  }
  return freeCashFlowMinorUnits / incomeMinorUnits;
}

/** 0 when income is 0, same convention as computeSavingsRate. */
export function computeInvestmentRate(
  investmentMinorUnits: number,
  incomeMinorUnits: number,
): number {
  if (incomeMinorUnits === 0) {
    return 0;
  }
  return investmentMinorUnits / incomeMinorUnits;
}
