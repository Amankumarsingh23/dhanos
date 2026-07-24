import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import {
  classifyReminder,
  type ReminderStatus as ClassificationStatus,
  type ReminderView as ClassifiedView,
} from "@/lib/calculations/reminders";
import type { ReminderFilters } from "@/lib/validation/reminders";
import type { Tables } from "@/types/database";

/**
 * Data access for the financial calendar (PROMPT 35). `asOfDate` is always
 * an explicit parameter — computed once by the caller via
 * `getTodayInTimeZone(household.timezone)` (src/lib/dates) — never read
 * from the server's own clock here, so overdue/upcoming classification
 * stays timezone-correct end to end.
 */

export type ReminderRecord = Tables<"reminders">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DEFAULT_LIMIT = 200;

export async function listReminders(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string,
  filters: ReminderFilters = {},
): Promise<ReminderRecord[]> {
  let query = supabase
    .from("reminders")
    .select("*")
    .eq("household_id", householdId);

  if (filters.reminderType) {
    query = query.eq("reminder_type", filters.reminderType);
  }

  const notSnoozed = `snoozed_until.is.null,snoozed_until.lt.${asOfDate}`;
  const view = filters.view ?? "upcoming";
  if (view === "completed") {
    query = query.eq("status", "completed");
  } else if (view === "skipped") {
    query = query.eq("status", "skipped");
  } else if (view === "snoozed") {
    query = query.eq("status", "pending").gte("snoozed_until", asOfDate);
  } else if (view === "overdue") {
    query = query
      .eq("status", "pending")
      .lt("due_date", asOfDate)
      .or(notSnoozed);
  } else {
    query = query
      .eq("status", "pending")
      .gte("due_date", asOfDate)
      .or(notSnoozed);
  }

  query = query
    .order("due_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(DEFAULT_LIMIT);

  return unwrapList(await query);
}

export type RemindersOverview = {
  overdueCount: number;
  upcomingCount: number;
  completedCount: number;
  snoozedCount: number;
};

/** Counts behind the summary cards — reuses classifyReminder so this can never disagree with what listReminders' view filters actually return. */
export async function getRemindersOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string,
): Promise<RemindersOverview> {
  const rows = unwrapList(
    await supabase
      .from("reminders")
      .select("status, due_date, snoozed_until")
      .eq("household_id", householdId)
      .limit(1000),
  );

  const overview: RemindersOverview = {
    overdueCount: 0,
    upcomingCount: 0,
    completedCount: 0,
    snoozedCount: 0,
  };

  for (const row of rows) {
    const view: ClassifiedView = classifyReminder({
      status: row.status as ClassificationStatus,
      dueDate: row.due_date,
      snoozedUntil: row.snoozed_until,
      asOfDate,
    });
    if (view === "overdue") overview.overdueCount += 1;
    else if (view === "upcoming") overview.upcomingCount += 1;
    else if (view === "completed") overview.completedCount += 1;
    else if (view === "snoozed") overview.snoozedCount += 1;
  }

  return overview;
}

export type ReminderEntityLink = { label: string; href: string | null };

/**
 * Batched, no-N+1 resolution of each reminder's related-entity display name
 * and link — one query per entity_type actually present on the page,
 * grouped from the already-fetched reminder rows, same pattern as
 * fetchDocumentCountsByAsset (src/features/assets/queries.ts).
 * entity_type = 'household' (monthly_closing) resolves to no entity link
 * at all — the reminder type's own label already says everything there is
 * to say ("Monthly closing"), and the household itself isn't a page to
 * link to.
 */
export async function resolveReminderEntityLinks(
  supabase: SupabaseServerClient,
  householdId: string,
  reminders: readonly ReminderRecord[],
): Promise<Map<string, ReminderEntityLink>> {
  const links = new Map<string, ReminderEntityLink>();

  const idsByType = new Map<string, string[]>();
  for (const reminder of reminders) {
    if (reminder.entity_type === "household") continue;
    const ids = idsByType.get(reminder.entity_type) ?? [];
    ids.push(reminder.entity_id);
    idsByType.set(reminder.entity_type, ids);
  }

  const key = (entityType: string, entityId: string) =>
    `${entityType}:${entityId}`;

  await Promise.all([
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("loan"),
      "loans",
      "name",
      (id, name) => links.set(key("loan", id), { label: name, href: `/app/debts/${id}` }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("insurance_policy"),
      "insurance_policies",
      "name",
      (id, name) =>
        links.set(key("insurance_policy", id), {
          label: name,
          href: `/app/insurance/${id}`,
        }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("income_source"),
      "income_sources",
      "name",
      (id, name) =>
        links.set(key("income_source", id), {
          label: name,
          href: `/app/income/${id}`,
        }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("document"),
      "documents",
      "display_name",
      (id, name) =>
        links.set(key("document", id), { label: name, href: `/app/documents` }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("financial_account"),
      "financial_accounts",
      "name",
      (id, name) =>
        links.set(key("financial_account", id), {
          label: name,
          href: `/app/accounts/${id}`,
        }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("goal"),
      "goals",
      "name",
      (id, name) => links.set(key("goal", id), { label: name, href: `/app/goals/${id}` }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("asset"),
      "assets",
      "name",
      (id, name) => links.set(key("asset", id), { label: name, href: `/app/assets/${id}` }),
    ),
    resolveSimple(
      supabase,
      householdId,
      idsByType.get("decision_journal_entry"),
      "decision_journal_entries",
      "title",
      (id, title) =>
        links.set(key("decision_journal_entry", id), {
          label: title,
          href: `/app/decisions/${id}`,
        }),
    ),
    resolveSips(supabase, householdId, idsByType.get("investment_sip"), links),
    resolveLendings(supabase, householdId, idsByType.get("lending"), links),
  ]);

  return links;
}

async function resolveSimple(
  supabase: SupabaseServerClient,
  householdId: string,
  ids: string[] | undefined,
  table: "loans" | "insurance_policies" | "income_sources" | "documents" | "financial_accounts" | "goals" | "assets" | "decision_journal_entries",
  labelColumn: string,
  onRow: (id: string, label: string) => void,
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const rows = unwrapList(
    await supabase
      .from(table)
      .select(`id, ${labelColumn}`)
      .eq("household_id", householdId)
      .in("id", ids),
  );
  for (const row of rows as unknown as Record<string, string>[]) {
    onRow(row.id ?? "", row[labelColumn] ?? "");
  }
}

async function resolveSips(
  supabase: SupabaseServerClient,
  householdId: string,
  ids: string[] | undefined,
  links: Map<string, ReminderEntityLink>,
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const rows = unwrapList(
    await supabase
      .from("investment_sips")
      .select("id, investment_holdings(investment_assets(name))")
      .eq("household_id", householdId)
      .in("id", ids),
  );
  for (const row of rows as unknown as {
    id: string;
    investment_holdings: { investment_assets: { name: string } | null } | null;
  }[]) {
    const label = row.investment_holdings?.investment_assets?.name ?? "SIP";
    links.set(`investment_sip:${row.id}`, { label, href: "/app/investments" });
  }
}

async function resolveLendings(
  supabase: SupabaseServerClient,
  householdId: string,
  ids: string[] | undefined,
  links: Map<string, ReminderEntityLink>,
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const rows = unwrapList(
    await supabase
      .from("lendings")
      .select(
        "id, purpose, person:people(display_name), institution:institutions(name)",
      )
      .eq("household_id", householdId)
      .in("id", ids),
  );
  for (const row of rows as unknown as {
    id: string;
    purpose: string | null;
    person: { display_name: string } | null;
    institution: { name: string } | null;
  }[]) {
    const label =
      row.purpose ||
      row.person?.display_name ||
      row.institution?.name ||
      "Lending";
    links.set(`lending:${row.id}`, { label, href: `/app/lending/${row.id}` });
  }
}
