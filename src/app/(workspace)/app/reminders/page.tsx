import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { getTodayInTimeZone } from "@/lib/dates";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SummaryCard } from "@/components/shared/summary-card";
import {
  getRemindersOverview,
  listReminders,
  resolveReminderEntityLinks,
} from "@/features/reminders/queries";
import { syncReminders } from "@/features/reminders/sync";
import { RemindersManager } from "@/features/reminders/reminders-manager";
import {
  reminderTypeSchema,
  reminderViewSchema,
  type ReminderType,
  type ReminderView,
} from "@/lib/validation/reminders";

export const metadata: Metadata = {
  title: "Reminders — DhanOS",
};

type RemindersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RemindersPage({
  searchParams,
}: RemindersPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const viewParsed = reminderViewSchema.safeParse(params.view);
  const view: ReminderView = viewParsed.success ? viewParsed.data : "upcoming";
  const typeParsed = reminderTypeSchema.safeParse(params.type);
  const reminderType = typeParsed.success ? typeParsed.data : undefined;

  const supabase = await createClient();
  const asOfDate = getTodayInTimeZone(household.timezone);

  // Best-effort, idempotent generation on every page load — never fails
  // the page itself if it errors (a stale calendar is far better than a
  // broken one). The same function backs the manual "Refresh" button
  // (syncRemindersAction) for whenever a household wants to force it.
  await syncReminders(supabase, household).catch(() => {});

  const [reminders, overview] = await Promise.all([
    listReminders(supabase, household.id, asOfDate, { view, reminderType }),
    getRemindersOverview(supabase, household.id, asOfDate),
  ]);
  const entityLinksMap = await resolveReminderEntityLinks(
    supabase,
    household.id,
    reminders,
  );
  const entityLinks = Object.fromEntries(entityLinksMap);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Reminders" }]} />}
        title="Reminders"
        description="A financial calendar generated from SIPs, EMIs, insurance, income, lending, documents, deposits, goals, and closings — completing a reminder only ever acknowledges it, never marks anything paid."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Overdue"
          amount={String(overview.overdueCount)}
          caption="Past due, unresolved"
        />
        <SummaryCard
          title="Upcoming"
          amount={String(overview.upcomingCount)}
          caption="Within the next 90 days"
        />
        <SummaryCard
          title="Snoozed"
          amount={String(overview.snoozedCount)}
          caption="Hidden until their snooze date"
        />
        <SummaryCard
          title="Completed"
          amount={String(overview.completedCount)}
          caption="Acknowledged — not a payment record"
        />
      </div>

      <RemindersManager
        householdId={household.id}
        reminders={reminders}
        entityLinks={entityLinks}
        asOfDate={asOfDate}
        filters={{
          view,
          reminderType: (reminderType ?? "") as ReminderType | "",
        }}
      />
    </PageShell>
  );
}
