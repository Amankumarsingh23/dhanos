import {
  addDays,
  addMonths,
  getDaysInMonth,
  isAfter,
  isBefore,
  parseISO,
  setDate,
  startOfMonth,
} from "date-fns";
import { toIsoDateString } from "@/lib/dates";
import { ValidationError } from "@/lib/errors/app-error";

/**
 * Documented recurring-rule schedule math for PROMPT 14 — the pure
 * arithmetic behind "upcoming commitments," "missed commitments," "skip
 * one occurrence," and "amount change from a particular date." No
 * database access, so it's fully unit-testable, and the only place a new
 * cadence's rules need to be added.
 *
 * Every occurrence is computed directly from its index against the rule's
 * own `startDate` (never by repeatedly adding a cadence to the previous
 * occurrence — see `occurrenceAt`), the same anchoring approach as
 * src/lib/calculations/income-schedule.ts and for the same reason: a
 * clamped short month (expected day 31 landing on a 30-day month) must
 * never drag every later occurrence a day earlier. This is also what
 * "Daily recurrence handles timezone correctly" (PROMPT 14 acceptance
 * criterion) rests on — every date here is a plain YYYY-MM-DD calendar
 * date with no time-of-day component, so there is no time zone for a
 * daily step to be off by; the household's own timezone only matters for
 * deciding what "today" (`asOfDate`) is, which every function below takes
 * as an explicit parameter rather than reading the server's clock itself.
 */

export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "custom";

export type RecurringScheduleSource = {
  frequency: RecurringFrequency;
  /** Always > 0. For 'custom', this is a plain day count — the only interval shape that's unambiguous regardless of calendar month length ("custom interval where safe"). */
  intervalCount: number;
  startDate: string;
  endDate: string | null;
};

const MONTHLY_CADENCE_STEP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/** Sets `date`'s day-of-month to the start date's day, clamped to the last day of that month rather than rolling into the next one. */
function clampToStartDayOfMonth(date: Date, startDay: number): Date {
  const daysInMonth = getDaysInMonth(date);
  return setDate(date, Math.min(startDay, daysInMonth));
}

function occurrenceAt(
  source: RecurringScheduleSource,
  start: Date,
  index: number,
): Date {
  if (source.frequency === "daily" || source.frequency === "custom") {
    return addDays(start, index * source.intervalCount);
  }
  if (source.frequency === "weekly") {
    return addDays(start, index * source.intervalCount * 7);
  }
  if (source.frequency === "biweekly") {
    return addDays(start, index * source.intervalCount * 14);
  }
  const monthsStep = MONTHLY_CADENCE_STEP[source.frequency];
  if (monthsStep === undefined) {
    throw new ValidationError(
      `Unsupported recurring frequency: ${source.frequency}`,
    );
  }
  const anchorMonth = addMonths(
    startOfMonth(start),
    index * monthsStep * source.intervalCount,
  );
  return clampToStartDayOfMonth(anchorMonth, start.getDate());
}

const MAX_OCCURRENCES_SCANNED = 1000;

/** The rule's very first occurrence — always startDate itself (index 0). */
export function computeInitialNextDueDate(
  source: RecurringScheduleSource,
): string {
  return source.startDate;
}

/**
 * The next occurrence strictly after `afterDate` (typically the rule's
 * current next_due_date, once it's been fulfilled or skipped) —
 * `next_due_date` is always advanced by this one-step function, never by
 * naively adding a cadence to itself, so drift can never accumulate.
 * Returns null once the rule has no more occurrences before `endDate`
 * (or the scan bound is exhausted, which only happens for a pathological
 * rule — see MAX_OCCURRENCES_SCANNED).
 */
export function computeNextOccurrenceAfter(
  source: RecurringScheduleSource,
  afterDate: string,
): string | null {
  const start = parseISO(source.startDate);
  const after = parseISO(afterDate);
  const end = source.endDate ? parseISO(source.endDate) : null;

  for (let index = 0; index < MAX_OCCURRENCES_SCANNED; index++) {
    const occurrence = occurrenceAt(source, start, index);
    if (!isAfter(occurrence, after)) {
      continue;
    }
    if (end && isAfter(occurrence, end)) {
      return null;
    }
    return toIsoDateString(occurrence);
  }
  return null;
}

const DEFAULT_GRACE_DAYS = 3;

/** Whether a rule's next_due_date is overdue enough to count as a missed commitment — a grace window avoids flagging something merely due today or yesterday. */
export function isRecurringMissed(params: {
  nextDueDate: string;
  asOfDate: string;
  graceDays?: number;
}): boolean {
  const { nextDueDate, asOfDate, graceDays = DEFAULT_GRACE_DAYS } = params;
  const graceDeadline = addDays(parseISO(nextDueDate), graceDays);
  return isAfter(parseISO(asOfDate), graceDeadline);
}

/** Whether a rule's next_due_date falls within the next `daysAhead` days (inclusive) — "upcoming commitments." */
export function isRecurringUpcoming(params: {
  nextDueDate: string;
  asOfDate: string;
  daysAhead: number;
}): boolean {
  const { nextDueDate, asOfDate, daysAhead } = params;
  const due = parseISO(nextDueDate);
  const asOf = parseISO(asOfDate);
  const horizon = addDays(asOf, daysAhead);
  return !isBefore(due, asOf) && !isAfter(due, horizon);
}

export type AmountScheduleEntry = {
  effectiveDate: string;
  amountMinorUnits: number;
};

/**
 * The amount in effect for a given occurrence date — the base
 * (start-date) amount, unless a scheduled change's effective date is on
 * or before the occurrence date, in which case the latest such change
 * applies. A transaction already generated for a past occurrence keeps
 * its own independently-stored amount forever regardless of schedule
 * changes made afterward — this function only matters when resolving the
 * amount for an occurrence *not yet generated* (PROMPT 14 acceptance
 * criterion "future amount changes do not rewrite past occurrences").
 */
export function resolveAmountForDate(
  baseAmountMinorUnits: number,
  schedule: readonly AmountScheduleEntry[],
  occurrenceDate: string,
): number {
  let resolved = baseAmountMinorUnits;
  let latestEffectiveDate: string | null = null;

  for (const entry of schedule) {
    if (entry.effectiveDate > occurrenceDate) {
      continue;
    }
    if (
      latestEffectiveDate === null ||
      entry.effectiveDate > latestEffectiveDate
    ) {
      latestEffectiveDate = entry.effectiveDate;
      resolved = entry.amountMinorUnits;
    }
  }

  return resolved;
}
