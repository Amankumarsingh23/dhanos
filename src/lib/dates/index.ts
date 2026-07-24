import { format, formatISO, isFuture, isValid, parseISO } from "date-fns";
import { ValidationError } from "@/lib/errors/app-error";

/**
 * Dates are stored in the database as UTC timestamps; locale/timezone
 * formatting happens only here, at the display layer. See
 * docs/architecture.md §1 ("Dates").
 */

function toDate(value: Date | string): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** `2026-07-21` — for date-only fields (e.g. a transaction date, a due date). */
export function toIsoDateString(value: Date | string): string {
  return formatISO(toDate(value), { representation: "date" });
}

/**
 * Semantic aliases over toIsoDateString — all share the same YYYY-MM-DD
 * representation, but each name documents *which* domain date a call site
 * is producing (see docs/financial-domain-model.md §3 and
 * src/lib/validation/primitives.ts's matching branded schemas, which
 * validate these same strings coming back in from user input).
 */
export const toTransactionDateString = toIsoDateString;
export const toDueDateString = toIsoDateString;
export const toValuationDateString = toIsoDateString;

/** Locale-aware display string, e.g. "21 Jul 2026". Never used for storage. */
export function formatDisplayDate(
  value: Date | string,
  pattern = "d MMM yyyy",
): string {
  return format(toDate(value), pattern);
}

export function isFutureDate(value: Date | string): boolean {
  return isFuture(toDate(value));
}

export function isValidDate(value: Date | string): boolean {
  return isValid(toDate(value));
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a well-formed `YYYY-MM` month key (matches monthKeySchema in src/lib/validation/primitives.ts). */
export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

/**
 * `2026-07` — the month a transaction/statement/report belongs to, computed
 * in a specific timezone (default UTC). Two users in different timezones
 * can see a transaction near midnight fall into different month keys for
 * the same underlying instant — that's intentional: a household's
 * financial month should be computed in *its* timezone (see
 * households.timezone, docs/database-plan.md §2), never assumed to be UTC
 * or the server's local time.
 */
export function toMonthKey(value: Date | string, timeZone = "UTC"): string {
  const date = toDate(value);
  if (!isValid(date)) {
    throw new ValidationError(`"${String(value)}" is not a valid date.`);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

/**
 * "Today" as a plain YYYY-MM-DD date in a given IANA timezone — the
 * timezone-correct counterpart to `toIsoDateString(new Date())`. Reminders
 * (PROMPT 35) is the first feature to actually need this: a household near
 * UTC midnight can be on a different calendar day locally than the
 * server's own UTC clock, which would make an overdue/upcoming
 * classification wrong for up to several hours a day. Takes an explicit
 * `now` for testability — never reads anything but its own parameters.
 */
export function getTodayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Default timezone for a household with none configured yet — matches profiles.timezone's default (see supabase/migrations/20260721024731_profiles.sql). */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Resolves the timezone to use for a user/household-scoped date
 * computation (e.g. toMonthKey). Falls back to DEFAULT_TIMEZONE for a
 * missing/blank value rather than silently defaulting to the server's own
 * timezone or UTC, which would compute the wrong "financial day" for most
 * users of this app.
 */
export function resolveTimeZone(explicit?: string | null): string {
  return explicit && explicit.trim().length > 0 ? explicit : DEFAULT_TIMEZONE;
}

/** A closed date range an account statement/report covers — distinct from generatedAt/data-cutoff timestamps (see docs/money-calculation-rules.md §3). */
export type StatementPeriod = {
  readonly startDate: string;
  readonly endDate: string;
};

/** Builds a StatementPeriod, rejecting an end date before its start date. */
export function createStatementPeriod(
  startDate: Date | string,
  endDate: Date | string,
): StatementPeriod {
  const start = toIsoDateString(startDate);
  const end = toIsoDateString(endDate);
  if (start > end) {
    throw new ValidationError(
      `A statement period's end date (${end}) cannot be before its start date (${start}).`,
    );
  }
  return { startDate: start, endDate: end };
}
