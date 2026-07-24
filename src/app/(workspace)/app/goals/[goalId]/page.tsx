import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { listAccounts } from "@/features/accounts/queries";
import { listPeople } from "@/features/people/queries";
import { getPortfolioHoldings } from "@/features/investments/queries";
import { getGoalDetail } from "@/features/goals/queries";
import { GoalDetailView } from "@/features/goals/goal-detail-view";

export const metadata: Metadata = {
  title: "Goal — DhanOS",
};

type GoalDetailPageProps = {
  params: Promise<{ goalId: string }>;
};

export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  const { household } = await requireHousehold();
  const { goalId } = await params;

  const supabase = await createClient();
  const [goal, accountsPage, peoplePage, holdings] = await Promise.all([
    getGoalDetail(supabase, household.id, goalId),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    getPortfolioHoldings(supabase, household.id),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Goals" }, { label: goal.name }]} />
        }
        title={goal.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/goals">
              <ArrowLeftIcon data-icon="inline-start" />
              All goals
            </Link>
          </Button>
        }
      />
      <GoalDetailView
        householdId={household.id}
        goal={goal}
        accounts={accountsPage.rows.map((account) => ({
          id: account.id,
          name: account.name,
          currencyCode: account.currency_code,
        }))}
        investmentHoldings={holdings.map((holding) => ({
          id: holding.investmentHoldingId,
          name: `${holding.assetName} (${holding.platformName})`,
          currencyCode: holding.currencyCode,
        }))}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          name: person.display_name,
        }))}
      />
    </PageShell>
  );
}
