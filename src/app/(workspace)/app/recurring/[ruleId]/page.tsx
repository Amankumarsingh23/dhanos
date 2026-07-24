import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { RecurringDetailView } from "@/features/recurring/recurring-detail-view";
import { getRecurringRuleDetail } from "@/features/recurring/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { listPeople } from "@/features/people/queries";

export const metadata: Metadata = {
  title: "Recurring rule — DhanOS",
};

type RecurringDetailPageProps = {
  params: Promise<{ ruleId: string }>;
};

export default async function RecurringDetailPage({
  params,
}: RecurringDetailPageProps) {
  const { household } = await requireHousehold();
  const { ruleId } = await params;

  const supabase = await createClient();
  const [rule, accountsPage, categories, peoplePage] = await Promise.all([
    getRecurringRuleDetail(supabase, household.id, ruleId),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listCategories(supabase, household.id, {}),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Recurring", href: "/app/recurring" },
              { label: rule.name },
            ]}
          />
        }
        title={rule.name}
      />
      <RecurringDetailView
        householdId={household.id}
        rule={rule}
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
      />
    </PageShell>
  );
}
