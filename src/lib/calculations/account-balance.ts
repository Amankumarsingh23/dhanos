import { createMoney, type Money } from "@/lib/money";

/**
 * The documented account-balance strategy (see PROMPT 9, "Balance rules",
 * and docs/money-calculation-rules.md §2: "a transaction is not the same as
 * an account balance"). An account's current balance is never a stored,
 * directly-edited field — it is always derived by picking a dated baseline
 * and adding every ledger transaction *after* that baseline:
 *
 *   - Baseline = the account's latest account_balance_snapshots row, if one
 *     exists (a manual entry, a reconciliation, or a system rollup — see
 *     account_balance_snapshots.source). A snapshot's balance already
 *     reflects everything through its as_of_date, so only transactions
 *     strictly *after* that date are added on top.
 *   - Otherwise, baseline = the account's opening_balance_minor_units as of
 *     its opened_date (or the account's creation if opened_date is unset),
 *     and every transaction from opened_date onward is added on top.
 *
 * `transactions.amount_minor_units` is stored as a positive magnitude for
 * every kind — direction comes from `kind` (and, for a transfer, which side
 * of the transfer this account is on), not the sign of the stored value.
 * signedContribution below is the single place that mapping lives, so a new
 * transaction kind can only ever affect a balance by being added here.
 */

export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "investment_contribution"
  | "investment_withdrawal"
  | "loan_disbursement"
  | "loan_payment"
  | "lending_disbursement"
  | "lending_repayment"
  | "refund"
  | "adjustment";

export type BalanceAffectingTransaction = {
  kind: TransactionKind;
  amountMinorUnits: number;
  accountId: string;
  transferAccountId: string | null;
  transactionDate: string;
};

export type BalanceSnapshotBaseline = {
  asOfDate: string;
  balanceMinorUnits: number;
};

export type AccountBalanceInput = {
  accountId: string;
  currencyCode: string;
  openingBalanceMinorUnits: number;
  openedDate: string | null;
  /** The account's most recent confirmed snapshot, if any — pass null to fall back to opening balance. */
  latestSnapshot: BalanceSnapshotBaseline | null;
  /**
   * Every transaction that could affect this account, already filtered to
   * account_id = accountId OR transfer_account_id = accountId. This
   * function itself filters by date against the chosen baseline — callers
   * should not pre-filter by date.
   */
  transactions: readonly BalanceAffectingTransaction[];
};

/**
 * Signed contribution of one transaction to `accountId`'s balance.
 * `adjustment` amounts are taken as-is (they are the signed correction
 * figure written by record_account_balance_correction, which can be
 * negative) — every other kind's stored amount is a positive magnitude
 * whose direction is determined here.
 */
export function signedContribution(
  transaction: BalanceAffectingTransaction,
  accountId: string,
): number {
  const amount = transaction.amountMinorUnits;

  switch (transaction.kind) {
    case "income":
    case "investment_withdrawal":
    case "loan_disbursement":
    case "lending_repayment":
    case "refund":
      return amount;
    case "expense":
    case "investment_contribution":
    case "loan_payment":
    case "lending_disbursement":
      return -amount;
    case "adjustment":
      return amount;
    case "transfer":
      if (transaction.transferAccountId === accountId) {
        return amount;
      }
      if (transaction.accountId === accountId) {
        return -amount;
      }
      return 0;
    default:
      return 0;
  }
}

/**
 * Computes an account's current balance per the strategy documented above.
 * Returns a Money value plus which baseline was used, so callers (the
 * account list/detail views) can show "as of <snapshot date>" or "from
 * opening balance" rather than presenting the figure as unconditionally
 * live.
 */
export function computeAccountBalance(input: AccountBalanceInput): {
  balance: Money;
  baseline: { kind: "snapshot"; asOfDate: string } | { kind: "opening" };
} {
  const baselineDate =
    input.latestSnapshot?.asOfDate ?? input.openedDate ?? null;
  const baselineAmount =
    input.latestSnapshot?.balanceMinorUnits ?? input.openingBalanceMinorUnits;

  const eligible = input.transactions.filter((transaction) => {
    if (baselineDate === null) {
      return true;
    }
    return transaction.transactionDate > baselineDate;
  });

  const total = eligible.reduce(
    (sum, transaction) =>
      sum + signedContribution(transaction, input.accountId),
    baselineAmount,
  );

  return {
    balance: createMoney(total, input.currencyCode),
    baseline: input.latestSnapshot
      ? { kind: "snapshot", asOfDate: input.latestSnapshot.asOfDate }
      : { kind: "opening" },
  };
}
