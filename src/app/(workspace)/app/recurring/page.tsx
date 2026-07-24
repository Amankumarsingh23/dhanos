import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { RecurringManager } from "@/features/recurring/recurring-manager";
import {
  getMissedRecurringRules,
  getUpcomingRecurringRules,
  listRecurringRules,
} from "@/features/recurring/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { listPeople } from "@/features/people/queries";
import {
  recurringRuleKindSchema,
  recurringRuleStatusSchema,
} from "@/lib/validation/recurring-rules";

export const metadata: Metadata = {
  title: "Recurring commitments — DhanOS",
};

type RecurringPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecurringPage({
  searchParams,
}: RecurringPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  const kindParsed = recurringRuleKindSchema.safeParse(params.kind);
  const kind = kindParsed.success ? kindParsed.data : undefined;
  const statusParsed = recurringRuleStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [rulesPage, upcoming, missed, accountsPage, categories, peoplePage] =
    await Promise.all([
      listRecurringRules(
        supabase,
        household.id,
        { search, accountId, kind, status },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      getUpcomingRecurringRules(supabase, household.id),
      getMissedRecurringRules(supabase, household.id),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listCategories(supabase, household.id, {}),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Recurring" }]} />}
        title="Recurring commitments"
        description="SIPs, salaries, subscriptions, premiums, and EMIs — reminded or auto-created, never silently marked as paid."
      />
      <RecurringManager
        householdId={household.id}
        rules={rulesPage}
        upcoming={upcoming}
        missed={missed}
        accounts={accountsPage.rows.map((a) => ({
          id: a.id,
          name: a.name,
          currencyCode: a.currency_code,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          categoryKind: c.category_kind,
        }))}
        people={peoplePage.rows.map((p) => ({
          id: p.id,
          name: p.display_name,
        }))}
        filters={{
          search,
          kind: kind ?? "",
          status: status ?? "",
          accountId,
        }}
      />
    </PageShell>
  );
}
