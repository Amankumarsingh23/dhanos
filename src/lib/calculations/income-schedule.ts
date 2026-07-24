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
import type { IncomeFrequency } from "@/lib/validation/income-sources";

/**
 * Documented income-schedule math for PROMPT 11's "compare expected with
 * received" / "missed-income indicator" / "recurring-income schedule"
 * features. Pure date arithmetic only — no database access, so it's fully
 * unit-testable and the only place a new cadence's rules need to be added.
 *
 * An occurrence's date is always computed directly from its index (never
 * by repeatedly adding a cadence to the previous occurrence), so a
 * clamped short month (e.g. expected day 31 landing on a 30-day month)
 * never drags every later occurrence a day earlier — each occurrence is
 * independently anchored to the household's declared start date.
 */

export type IncomeScheduleSource = {
  frequency: IncomeFrequency;
  /** Required for monthly/quarterly/half_yearly/yearly; ignored for weekly/biweekly/irregular. */
  expectedDayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

const MONTHLY_CADENCE_STEP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/** Sets `date`'s day-of-month to `day`, clamped to the last day of that month rather than rolling into the next one. */
function clampDayOfMonth(date: Date, day: number): Date {
  const daysInMonth = getDaysInMonth(date);
  return setDate(date, Math.min(day, daysInMonth));
}

function occurrenceAt(
  source: IncomeScheduleSource,
  start: Date,
  index: number,
): Date {
  if (source.frequency === "weekly") {
    return addDays(start, index * 7);
  }
  if (source.frequency === "biweekly") {
    return addDays(start, index * 14);
  }
  const monthsStep = MONTHLY_CADENCE_STEP[source.frequency];
  if (monthsStep === undefined || source.expectedDayOfMonth === null) {
    throw new ValidationError(
      "A monthly-or-slower income frequency requires expectedDayOfMonth.",
    );
  }
  const anchorMonth = addMonths(startOfMonth(start), index * monthsStep);
  return clampDayOfMonth(anchorMonth, source.expectedDayOfMonth);
}

const MAX_OCCURRENCES_SCANNED = 1000;

export type IncomeSchedule = {
  /** The most recent occurrence on or before asOfDate, or null if the source hasn't started yet, is irregular, or is inactive. */
  mostRecentDueDate: string | null;
  /** The next occurrence strictly after asOfDate, or null if the source has ended, is irregular, or is inactive. */
  nextExpectedDate: string | null;
};

/**
 * Computes a source's most-recently-due and next-expected occurrence
 * relative to `asOfDate`. Returns both null for an 'irregular' or inactive
 * source — there's no schedule to compute.
 */
export function computeIncomeSchedule(
  source: IncomeScheduleSource,
  asOfDate: string,
): IncomeSchedule {
  if (source.frequency === "irregular" || !source.isActive) {
    return { mostRecentDueDate: null, nextExpectedDate: null };
  }

  const start = parseISO(source.startDate);
  const asOf = parseISO(asOfDate);
  const end = source.endDate ? parseISO(source.endDate) : null;

  let mostRecentDue: Date | null = null;
  let nextExpected: Date | null = null;

  for (let index = 0; index < MAX_OCCURRENCES_SCANNED; index++) {
    const occurrence = occurrenceAt(source, start, index);

    if (isBefore(occurrence, start)) {
      continue;
    }
    if (end && isAfter(occurrence, end)) {
      break;
    }

    if (!isAfter(occurrence, asOf)) {
      mostRecentDue = occurrence;
    } else {
      nextExpected = occurrence;
      break;
    }
  }

  return {
    mostRecentDueDate: mostRecentDue ? toIsoDateString(mostRecentDue) : null,
    nextExpectedDate: nextExpected ? toIsoDateString(nextExpected) : null,
  };
}

const DEFAULT_GRACE_DAYS = 7;

/**
 * Whether a source's most-recently-due occurrence should be flagged as
 * missed: the due date's grace period has elapsed, and nothing was
 * received on or after that due date. Grace days give a source that pays
 * "around the 5th" room to land a few days late without a false alarm.
 */
export function isIncomeMissed(params: {
  mostRecentDueDate: string | null;
  lastReceivedDate: string | null;
  asOfDate: string;
  graceDays?: number;
}): boolean {
  const {
    mostRecentDueDate,
    lastReceivedDate,
    asOfDate,
    graceDays = DEFAULT_GRACE_DAYS,
  } = params;

  if (!mostRecentDueDate) {
    return false;
  }

  const due = parseISO(mostRecentDueDate);
  const asOf = parseISO(asOfDate);
  const graceDeadline = addDays(due, graceDays);

  if (!isAfter(asOf, graceDeadline)) {
    return false;
  }

  if (!lastReceivedDate) {
    return true;
  }

  return isBefore(parseISO(lastReceivedDate), due);
}
