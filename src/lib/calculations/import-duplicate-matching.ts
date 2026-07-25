/**
 * Explainable duplicate detection for CSV import (PROMPT 41). Pure — every
 * function here takes an already-resolved row plus an already-fetched list
 * of candidate rows to check against, and returns either `null` (no match)
 * or a specific, human-readable reason naming exactly which signal matched
 * and against what. "Never silently discard uncertain duplicates" means
 * every match this module finds is surfaced to the household as a named
 * warning (`import_rows.duplicate_reason`) they explicitly confirm past,
 * never an auto-skip with no explanation.
 *
 * Three signals, checked in order of strength — the first that matches
 * wins, since a stronger signal's explanation is more useful than a weaker
 * one that happens to also match:
 *
 *  1. External reference (an exact match, scoped to the same account) —
 *     the strongest signal, since two genuinely different transactions
 *     essentially never share a bank/broker-issued reference number.
 *  2. Account + date + amount + description (all four, description
 *     compared case-insensitively/trimmed) — the "this looks like the same
 *     real-world event" signal for data with no reference number.
 *  3. Account + date + amount alone, when description is unavailable or
 *     doesn't match — a weaker, still-worth-flagging signal.
 */

function normalizeText(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export type TransactionDuplicateCandidate = {
  /** What this candidate row actually is — feeds the explanation text. */
  label: string;
  accountId: string;
  transactionDate: string;
  amountMinorUnits: number;
  description: string | null;
  externalReference: string | null;
};

export type TransactionRowForDuplicateCheck = {
  accountId: string;
  transactionDate: string;
  amountMinorUnits: number;
  description: string | null;
  externalReference: string | null;
};

export function findTransactionDuplicate(
  row: TransactionRowForDuplicateCheck,
  candidates: readonly TransactionDuplicateCandidate[],
): string | null {
  if (row.externalReference && row.externalReference.trim() !== "") {
    const ref = normalizeText(row.externalReference);
    const match = candidates.find(
      (candidate) =>
        candidate.accountId === row.accountId &&
        normalizeText(candidate.externalReference) === ref,
    );
    if (match) {
      return `Matches external reference "${row.externalReference.trim()}" on ${match.label}.`;
    }
  }

  const sameAccountDateAmount = candidates.filter(
    (candidate) =>
      candidate.accountId === row.accountId &&
      candidate.transactionDate === row.transactionDate &&
      candidate.amountMinorUnits === row.amountMinorUnits,
  );

  const descriptionMatch = sameAccountDateAmount.find(
    (candidate) => normalizeText(candidate.description) === normalizeText(row.description),
  );
  if (descriptionMatch) {
    return `Same account, date, amount, and description as ${descriptionMatch.label}.`;
  }

  const first = sameAccountDateAmount[0];
  if (first) {
    return `Same account, date, and amount as ${first.label} (description differs or is missing).`;
  }

  return null;
}

export type SnapshotDuplicateCandidate = {
  label: string;
  asOfDate: string;
};

/** Shared by both account-balance and investment-valuation dedup — both are, at their core, "does a snapshot already exist for this [account|holding] on this date." */
function findSnapshotDuplicate(
  asOfDate: string,
  candidates: readonly SnapshotDuplicateCandidate[],
): string | null {
  const match = candidates.find((candidate) => candidate.asOfDate === asOfDate);
  return match ? `A snapshot already exists for ${asOfDate} (${match.label}).` : null;
}

export function findAccountBalanceDuplicate(
  asOfDate: string,
  candidates: readonly SnapshotDuplicateCandidate[],
): string | null {
  return findSnapshotDuplicate(asOfDate, candidates);
}

export function findInvestmentValuationDuplicate(
  asOfDate: string,
  candidates: readonly SnapshotDuplicateCandidate[],
): string | null {
  return findSnapshotDuplicate(asOfDate, candidates);
}
