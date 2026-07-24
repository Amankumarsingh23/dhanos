import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  isRecurringMissed,
  isRecurringUpcoming,
  resolveAmountForDate,
} from "@/lib/calculations/recurring-schedule";
import { toIsoDateString } from "@/lib/dates";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { RecurringRuleFilters } from "@/lib/validation/recurring-rules";
import type { Tables } from "@/types/database";

export type RecurringRuleRecord = Tables<"recurring_rules">;
export type RecurringRuleEventRecord = Tables<"recurring_rule_events">;
export type RecurringRuleAmountScheduleRecord =
  Tables<"recurring_rule_amount_schedules">;
export type RecurringOccurrenceTransactionRecord = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RecurringRuleRow = RecurringRuleRecord & {
  accountName: string | null;
  transferAccountName: string | null;
  categoryName: string | null;
  personName: string | null;
  /** The amount that would apply if the rule's next occurrence were generated today — resolveAmountForDate against any pending schedule change. */
  currentAmountMinorUnits: number;
  isMissed: boolean;
  isUpcoming: boolean;
};

type RawRecurringRuleRow = RecurringRuleRecord & {
  account: { name: string } | null;
  transfer_account: { name: string } | null;
  category: { name: string } | null;
  person: { display_name: string } | null;
};

const RECURRING_RULE_SELECT =
  "*, account:financial_accounts!recurring_rules_account_id_fkey(name), transfer_account:financial_accounts!recurring_rules_transfer_account_id_fkey(name), category:transaction_categories(name), person:people(display_name)";

/** Batched amount-schedule lookup for a page of rules — one query for the whole page, never one per row. */
async function fetchAmountSchedules(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleIds: string[],
): Promise<Map<string, { effectiveDate: string; amountMinorUnits: number }[]>> {
  if (recurringRuleIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("recurring_rule_amount_schedules")
      .select("recurring_rule_id, effective_date, amount_minor_units")
      .eq("household_id", householdId)
      .in("recurring_rule_id", recurringRuleIds),
  );
  const bySchedule = new Map<
    string,
    { effectiveDate: string; amountMinorUnits: number }[]
  >();
  for (const row of rows) {
    const list = bySchedule.get(row.recurring_rule_id) ?? [];
    list.push({
      effectiveDate: row.effective_date,
      amountMinorUnits: row.amount_minor_units,
    });
    bySchedule.set(row.recurring_rule_id, list);
  }
  return bySchedule;
}

function mapRow(
  row: RawRecurringRuleRow,
  amountSchedule: { effectiveDate: string; amountMinorUnits: number }[],
  asOfDate: string,
  upcomingDaysAhead: number,
): RecurringRuleRow {
  const { account, transfer_account, category, person, ...rest } = row;
  // The amount for the *next* occurrence is resolved as of that
  // occurrence's own date, never "today" — a schedule change already
  // past its effective date but after next_due_date must not apply
  // early. A rule with no more occurrences (next_due_date null) has
  // nothing left to resolve for, so it falls back to "as of today."
  const currentAmountMinorUnits = resolveAmountForDate(
    row.amount_minor_units,
    amountSchedule,
    row.next_due_date ?? asOfDate,
  );
  const isMissed =
    rest.status === "active" &&
    row.next_due_date !== null &&
    isRecurringMissed({ nextDueDate: row.next_due_date, asOfDate });
  const isUpcoming =
    rest.status === "active" &&
    !isMissed &&
    row.next_due_date !== null &&
    isRecurringUpcoming({
      nextDueDate: row.next_due_date,
      asOfDate,
      daysAhead: upcomingDaysAhead,
    });

  return {
    ...rest,
    accountName: account?.name ?? null,
    transferAccountName: transfer_account?.name ?? null,
    categoryName: category?.name ?? null,
    personName: person?.display_name ?? null,
    currentAmountMinorUnits,
    isMissed,
    isUpcoming,
  };
}

/**
 * Lists a household's recurring rules, following the standard query
 * contract (see docs/data-access-patterns.md §2): household-scoped,
 * paginated, deterministically ordered (next_due_date, then id as a
 * tiebreaker), searchable by name. Each row's current resolved amount and
 * missed/upcoming flags are computed for the whole page from a small,
 * fixed number of extra queries — never one per row.
 */
export async function listRecurringRules(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: RecurringRuleFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
  upcomingDaysAhead = 14,
): Promise<Page<RecurringRuleRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("recurring_rules").select(RECURRING_RULE_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.kind) {
    query = query.eq("kind", filters.kind);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.accountId) {
    query = query.or(
      `account_id.eq.${filters.accountId},transfer_account_id.eq.${filters.accountId}`,
    );
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "next_due_date", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawRecurringRuleRow[];
  const page = toPage(rawRows, pagination);

  const ruleIds = page.rows.map((row) => row.id);
  const amountSchedules = await fetchAmountSchedules(
    supabase,
    householdId,
    ruleIds,
  );

  const rows = page.rows.map((row) =>
    mapRow(row, amountSchedules.get(row.id) ?? [], asOfDate, upcomingDaysAhead),
  );

  return { ...page, rows };
}

export type RecurringRuleDetail = RecurringRuleRow & {
  amountSchedule: RecurringRuleAmountScheduleRecord[];
  events: RecurringRuleEventRecord[];
  recentOccurrences: RecurringOccurrenceTransactionRecord[];
};

/** One rule's full detail: schedule, recurrence history, and recently generated occurrences — see PROMPT 14 "recurrence history." */
export async function getRecurringRuleDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleId: string,
  asOfDate: string = toIsoDateString(new Date()),
  upcomingDaysAhead = 14,
): Promise<RecurringRuleDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("recurring_rules")
      .select(RECURRING_RULE_SELECT)
      .eq("household_id", householdId)
      .eq("id", recurringRuleId)
      .maybeSingle(),
  ) as unknown as RawRecurringRuleRow;

  const [amountScheduleResult, eventsResult, occurrencesResult] =
    await Promise.all([
      supabase
        .from("recurring_rule_amount_schedules")
        .select("*")
        .eq("household_id", householdId)
        .eq("recurring_rule_id", recurringRuleId)
        .order("effective_date", { ascending: true }),
      supabase
        .from("recurring_rule_events")
        .select("*")
        .eq("household_id", householdId)
        .eq("recurring_rule_id", recurringRuleId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("transactions")
        .select("*")
        .eq("household_id", householdId)
        .eq("recurring_rule_id", recurringRuleId)
        .order("transaction_date", { ascending: false })
        .limit(20),
    ]);

  const amountSchedule = unwrapList(amountScheduleResult);
  const events = unwrapList(eventsResult);
  const recentOccurrences = unwrapList(occurrencesResult);

  const row = mapRow(
    raw,
    amountSchedule.map((s) => ({
      effectiveDate: s.effective_date,
      amountMinorUnits: s.amount_minor_units,
    })),
    asOfDate,
    upcomingDaysAhead,
  );

  return { ...row, amountSchedule, events, recentOccurrences };
}

/** Rules due within `daysAhead` days — "upcoming commitments." */
export async function getUpcomingRecurringRules(
  supabase: SupabaseServerClient,
  householdId: string,
  daysAhead = 14,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<RecurringRuleRow[]> {
  const page = await listRecurringRules(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
    daysAhead,
  );
  return page.rows.filter((row) => row.isUpcoming);
}

/** Rules whose next_due_date is overdue past its grace period — "missed commitments." */
export async function getMissedRecurringRules(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<RecurringRuleRow[]> {
  const page = await listRecurringRules(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
  );
  return page.rows.filter((row) => row.isMissed);
}
