import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { listAccounts } from "@/features/accounts/queries";
import { listPeople } from "@/features/people/queries";
import { getPortfolioHoldings } from "@/features/investments/queries";
import { getGoalsOverview, listGoals } from "@/features/goals/queries";
import { GoalsManager } from "@/features/goals/goals-manager";
import {
  goalPrioritySchema,
  goalStatusSchema,
  goalTypeSchema,
} from "@/lib/validation/goals";

export const metadata: Metadata = {
  title: "Goals — DhanOS",
};

type GoalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const typeParsed = goalTypeSchema.safeParse(params.type);
  const goalType = typeParsed.success ? typeParsed.data : undefined;
  const statusParsed = goalStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const priorityParsed = goalPrioritySchema.safeParse(params.priority);
  const priority = priorityParsed.success ? priorityParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [goalsPage, accountsPage, peoplePage, holdings, overview] =
    await Promise.all([
      listGoals(
        supabase,
        household.id,
        { search, goalType, status, priority },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      getPortfolioHoldings(supabase, household.id),
      getGoalsOverview(supabase, household.id, household.base_currency_code),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Goals" }]} />}
        title="Financial goals"
        description="Major future needs — emergency fund, home purchase, education, marriage, and more — with funding-gap, required-contribution, and on-track figures computed from real linked accounts and investments. Expected returns are always a stated assumption, never a guarantee."
      />
      <GoalsManager
        householdId={household.id}
        currencyCode={household.base_currency_code}
        goals={goalsPage}
        overview={overview}
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
        filters={{
          search,
          goalType: goalType ?? "",
          status: status ?? "",
          priority: priority ?? "",
        }}
      />
    </PageShell>
  );
}
