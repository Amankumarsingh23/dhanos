import { addDays, parseISO } from "date-fns";
import { toIsoDateString } from "@/lib/dates";
import {
  computeNextOccurrenceAfter,
  type RecurringScheduleSource,
} from "./recurring-schedule";
import {
  computeIncomeSchedule,
  type IncomeScheduleSource,
} from "./income-schedule";
import { computePeriodDateRange } from "./monthly-closing";

/**
 * Pure schedule/classification math behind the financial calendar (PROMPT
 * 35). No database access, so every function here is fully unit-testable —
 * src/features/reminders/sync.ts is the only caller that touches the
 * database, and it does nothing but feed each source table's own rows
 * through the matching generator below and upsert the result.
 *
 * A reminder's due date is always computed from another table's own dates
 * — never invented — and every recurring generator produces *fixed*
 * calendar dates (anchored to a real start date or the source's own
 * pointer), never a date derived from "today." That distinction is what
 * keeps generation idempotent: re-running sync on a later day must not
 * change what due dates a not-yet-resolved obligation has already been
 * assigned (that would defeat the dedup unique constraint by minting a
 * fresh due_date, and therefore a fresh row, every single day).
 */

export type ReminderWindow = { windowStart: string; windowEnd: string };

export type ReminderStatus = "pending" | "completed" | "skipped";
export type ReminderView =
  | "upcoming"
  | "overdue"
  | "snoozed"
  | "completed"
  | "skipped";

/**
 * Classifies one reminder row for display/filtering — the single place
 * "is this overdue" is decided, so the query layer and the UI can never
 * disagree with each other. `asOfDate` should come from
 * `getTodayInTimeZone(household.timezone)` (src/lib/dates), never the
 * server's own UTC clock — "Timezone ... obligations behave correctly"
 * (PROMPT 35 acceptance criterion).
 */
export function classifyReminder(params: {
  status: ReminderStatus;
  dueDate: string;
  snoozedUntil: string | null;
  asOfDate: string;
}): ReminderView {
  if (params.status === "completed") return "completed";
  if (params.status === "skipped") return "skipped";
  if (params.snoozedUntil && params.snoozedUntil >= params.asOfDate) {
    return "snoozed";
  }
  return params.dueDate < params.asOfDate ? "overdue" : "upcoming";
}

const MAX_WINDOW_OCCURRENCES = 24;

/**
 * Every occurrence of a recurring source within [windowStart, windowEnd],
 * inclusive of both ends — built on computeNextOccurrenceAfter
 * (recurring-schedule.ts) so day-31-in-a-short-month clamping and
 * startDate-anchored indexing are never reimplemented here.
 */
export function enumerateOccurrencesInWindow(
  source: RecurringScheduleSource,
  window: ReminderWindow,
): string[] {
  const results: string[] = [];
  let cursor = toIsoDateString(addDays(parseISO(window.windowStart), -1));
  for (let i = 0; i < MAX_WINDOW_OCCURRENCES; i++) {
    const next = computeNextOccurrenceAfter(source, cursor);
    if (!next || next > window.windowEnd) break;
    if (next >= window.windowStart) {
      results.push(next);
    }
    cursor = next;
  }
  return results;
}

export type ReminderCandidate = { entityId: string; dueDate: string };

function withinWindow(dueDate: string, window: ReminderWindow): boolean {
  return dueDate >= window.windowStart && dueDate <= window.windowEnd;
}

// ---------------------------------------------------------------------
// sip_due — investment_sips.next_due_date is already a stored, explicitly
// -advanced pointer (same "next_due_date" shape as recurring_rules) — the
// SIP feature itself only ever knows *one* current next occurrence, so
// this generator reports that single pointer rather than projecting
// hypothetical future ones the SIP feature hasn't reached yet.
// ---------------------------------------------------------------------

export type SipDueSource = {
  id: string;
  nextDueDate: string | null;
  status: string;
};

export function generateSipDueCandidates(
  sips: readonly SipDueSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const sip of sips) {
    if (sip.status !== "active" || sip.nextDueDate === null) continue;
    if (withinWindow(sip.nextDueDate, window)) {
      candidates.push({ entityId: sip.id, dueDate: sip.nextDueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// emi_due — loans has no per-EMI due-date column (see
// src/lib/calculations/debt-trend.ts's generateEmiCalendar, which only
// works at month-key granularity). A day-level EMI reminder needs an
// actual day of month, so this generator assumes the EMI recurs monthly on
// repayment_start_date's own day-of-month — reusing recurring-schedule's
// clamped monthly stepping, the same "day 31 never drags later occurrences
// earlier" guarantee recurring_rules relies on. Skipped for a loan
// currently in moratorium (emi_amount_minor_units null — nothing
// determinate to remind about).
// ---------------------------------------------------------------------

export type LoanEmiSource = {
  id: string;
  repaymentStartDate: string;
  maturityDate: string | null;
  emiAmountMinorUnits: number | null;
  status: string;
};

export function generateEmiDueCandidates(
  loans: readonly LoanEmiSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const loan of loans) {
    if (loan.status !== "active" || loan.emiAmountMinorUnits === null) {
      continue;
    }
    const source: RecurringScheduleSource = {
      frequency: "monthly",
      intervalCount: 1,
      startDate: loan.repaymentStartDate,
      endDate: loan.maturityDate,
    };
    for (const dueDate of enumerateOccurrencesInWindow(source, window)) {
      candidates.push({ entityId: loan.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// loan_review — no review-cadence field exists anywhere in the schema;
// this is a genuinely new concept PROMPT 35 introduces. Assumption (stated
// here, not hidden): an annual review, anchored to the loan's own
// start_date.
// ---------------------------------------------------------------------

export type LoanReviewSource = {
  id: string;
  startDate: string;
  maturityDate: string | null;
  status: string;
};

export function generateLoanReviewCandidates(
  loans: readonly LoanReviewSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const loan of loans) {
    if (loan.status !== "active") continue;
    const source: RecurringScheduleSource = {
      frequency: "yearly",
      intervalCount: 1,
      startDate: loan.startDate,
      endDate: loan.maturityDate,
    };
    for (const dueDate of enumerateOccurrencesInWindow(source, window)) {
      candidates.push({ entityId: loan.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// insurance_premium — insurance_policies has no stored next-premium-due
// date (premiums are recorded as ordinary expense transactions, not
// against a schedule table). Assumption: the premium recurs on
// premium_frequency, anchored to start_date. 'one_time' policies never
// produce a premium reminder — there is nothing to recur.
// ---------------------------------------------------------------------

export type InsurancePremiumSource = {
  id: string;
  startDate: string;
  premiumFrequency: string;
  renewalDate: string | null;
  expiryDate: string | null;
  status: string;
};

const PREMIUM_FREQUENCIES = new Set([
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
]);

export function generateInsurancePremiumCandidates(
  policies: readonly InsurancePremiumSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const policy of policies) {
    if (
      policy.status !== "active" ||
      !PREMIUM_FREQUENCIES.has(policy.premiumFrequency)
    ) {
      continue;
    }
    const source: RecurringScheduleSource = {
      frequency: policy.premiumFrequency as RecurringScheduleSource["frequency"],
      intervalCount: 1,
      startDate: policy.startDate,
      endDate: policy.expiryDate ?? policy.renewalDate ?? null,
    };
    for (const dueDate of enumerateOccurrencesInWindow(source, window)) {
      candidates.push({ entityId: policy.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// policy_renewal — a single fixed date per policy row (renewal_date, or
// expiry_date if no renewal_date is set); a real renewal creates a brand
// new insurance_policies row (PROMPT 25), so recurrence is already handled
// at the entity level, not here.
// ---------------------------------------------------------------------

export type PolicyRenewalSource = {
  id: string;
  renewalDate: string | null;
  expiryDate: string | null;
  status: string;
};

export function generatePolicyRenewalCandidates(
  policies: readonly PolicyRenewalSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const policy of policies) {
    if (policy.status !== "active") continue;
    const dueDate = policy.renewalDate ?? policy.expiryDate;
    if (dueDate && withinWindow(dueDate, window)) {
      candidates.push({ entityId: policy.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// expected_income — reuses computeIncomeSchedule (income-schedule.ts)
// unchanged, walking its `nextExpectedDate` forward one occurrence at a
// time to enumerate every occurrence in the window (income schedules can
// use a different day-of-month than a source's own start date, so they
// aren't representable as a RecurringScheduleSource).
// ---------------------------------------------------------------------

export type ExpectedIncomeSource = IncomeScheduleSource & { id: string };

export function generateExpectedIncomeCandidates(
  sources: readonly ExpectedIncomeSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const src of sources) {
    let cursor = toIsoDateString(addDays(parseISO(window.windowStart), -1));
    for (let i = 0; i < MAX_WINDOW_OCCURRENCES; i++) {
      const schedule = computeIncomeSchedule(src, cursor);
      const next = schedule.nextExpectedDate;
      if (!next || next > window.windowEnd) break;
      if (next >= window.windowStart) {
        candidates.push({ entityId: src.id, dueDate: next });
      }
      cursor = next;
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// lending_repayment — a single fixed date (expected_repayment_date), only
// for a lending that's still owed. Installment-level reminders aren't
// modeled — lendings.installment_frequency has no per-installment date
// rows to anchor to, only a total schedule shape.
// ---------------------------------------------------------------------

export type LendingRepaymentSource = {
  id: string;
  expectedRepaymentDate: string | null;
  status: string;
};

export const LENDING_OWED_STATUSES = [
  "active",
  "partially_repaid",
  "delayed",
  "disputed",
] as const;

export function generateLendingRepaymentCandidates(
  lendings: readonly LendingRepaymentSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const lending of lendings) {
    if (
      !(LENDING_OWED_STATUSES as readonly string[]).includes(lending.status)
    ) {
      continue;
    }
    const dueDate = lending.expectedRepaymentDate;
    if (dueDate && withinWindow(dueDate, window)) {
      candidates.push({ entityId: lending.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// document_expiry — documents.expiry_date, for active (non-archived)
// documents only.
// ---------------------------------------------------------------------

export type DocumentExpirySource = {
  id: string;
  expiryDate: string | null;
  status: string;
};

export function generateDocumentExpiryCandidates(
  documents: readonly DocumentExpirySource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const document of documents) {
    if (document.status !== "active" || document.expiryDate === null) {
      continue;
    }
    if (withinWindow(document.expiryDate, window)) {
      candidates.push({ entityId: document.id, dueDate: document.expiryDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// fixed_deposit_maturity — financial_accounts.maturity_date (PROMPT 35),
// for accounts still open.
// ---------------------------------------------------------------------

export type FixedDepositMaturitySource = {
  id: string;
  maturityDate: string | null;
  isActive: boolean;
};

export function generateFixedDepositMaturityCandidates(
  accounts: readonly FixedDepositMaturitySource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const account of accounts) {
    if (!account.isActive || account.maturityDate === null) continue;
    if (withinWindow(account.maturityDate, window)) {
      candidates.push({ entityId: account.id, dueDate: account.maturityDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// goal_review — no review-cadence field exists; a genuinely new concept.
// Assumption: a quarterly review, anchored to the goal's own created_at
// date, only while the goal is still active.
// ---------------------------------------------------------------------

export type GoalReviewSource = {
  id: string;
  createdAtDate: string;
  targetDate: string;
  status: string;
};

export function generateGoalReviewCandidates(
  goals: readonly GoalReviewSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const goal of goals) {
    if (goal.status !== "active") continue;
    const source: RecurringScheduleSource = {
      frequency: "quarterly",
      intervalCount: 1,
      startDate: goal.createdAtDate,
      endDate: goal.targetDate,
    };
    for (const dueDate of enumerateOccurrencesInWindow(source, window)) {
      candidates.push({ entityId: goal.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// monthly_closing — "due" isn't a stored flag anywhere; it's inferred by
// absence, exactly the way the closing feature itself resolves "is there a
// current closing for this period" (see resolveCurrentClosing,
// monthly-closing.ts). Only the last few elapsed periods are checked —
// an old unclosed month from years ago isn't worth resurfacing forever.
// ---------------------------------------------------------------------

const MONTHLY_CLOSING_LOOKBACK_MONTHS = 3;

/**
 * Shifts a "YYYY-MM" period by a (possibly negative) number of months —
 * pure integer arithmetic, deliberately never round-tripped through a
 * `Date`/`Intl` timezone conversion (unlike toMonthKey, which formats in an
 * explicit timezone): mixing a local-time-parsed Date with a UTC-formatted
 * month key would silently shift this calculation by a month in any
 * process not itself running in UTC.
 */
function shiftPeriod(period: string, monthsDelta: number): string {
  const [yearStr, monthStr] = period.split("-");
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + monthsDelta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function generateMonthlyClosingCandidates(
  householdId: string,
  closedPeriods: ReadonlySet<string>,
  asOfDate: string,
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  const currentPeriod = asOfDate.slice(0, 7);
  for (let i = 1; i <= MONTHLY_CLOSING_LOOKBACK_MONTHS; i++) {
    const period = shiftPeriod(currentPeriod, -i);
    if (closedPeriods.has(period)) continue;
    const { dateTo } = computePeriodDateRange(period);
    if (dateTo >= asOfDate) continue; // the period hasn't fully elapsed yet
    const dueDate = toIsoDateString(addDays(parseISO(dateTo), 1));
    if (withinWindow(dueDate, window)) {
      candidates.push({ entityId: householdId, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// asset_valuation_review — no staleness threshold exists anywhere in the
// schema; a genuinely new concept. Assumption: review annually, anchored
// to the asset's latest valuation (or its creation date, if never valued).
// Anchoring the cadence to a fixed calendar date — never to "today" — is
// what keeps this idempotent: a long-neglected asset's due date is still a
// fixed yearly anniversary, not a value that changes (and re-triggers
// dedup) on every sync run.
// ---------------------------------------------------------------------

export type AssetValuationReviewSource = {
  id: string;
  createdAtDate: string;
  latestValuationDate: string | null;
};

export function generateAssetValuationReviewCandidates(
  assets: readonly AssetValuationReviewSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const asset of assets) {
    const anchor = asset.latestValuationDate ?? asset.createdAtDate;
    const source: RecurringScheduleSource = {
      frequency: "yearly",
      intervalCount: 1,
      startDate: anchor,
      endDate: null,
    };
    for (const dueDate of enumerateOccurrencesInWindow(source, window)) {
      candidates.push({ entityId: asset.id, dueDate });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------
// decision_review — decision_journal_entries.review_date (PROMPT 37: "a
// review date creates a reminder"), a single fixed date per entry, only
// while the decision is live (decided/under review — an 'open' draft was
// never finalized, and a reversed/superseded entry has nothing left to
// review).
// ---------------------------------------------------------------------

export type DecisionReviewSource = {
  id: string;
  reviewDate: string | null;
  status: string;
};

const DECISION_REVIEW_STATUSES = ["decided", "under_review"] as const;

export function generateDecisionReviewCandidates(
  decisions: readonly DecisionReviewSource[],
  window: ReminderWindow,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const decision of decisions) {
    if (
      !(DECISION_REVIEW_STATUSES as readonly string[]).includes(
        decision.status,
      ) ||
      decision.reviewDate === null
    ) {
      continue;
    }
    if (withinWindow(decision.reviewDate, window)) {
      candidates.push({ entityId: decision.id, dueDate: decision.reviewDate });
    }
  }
  return candidates;
}
