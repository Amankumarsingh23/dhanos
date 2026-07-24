import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { toIsoDateString } from "@/lib/dates";
import { listAccounts } from "@/features/accounts/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { SipsManager } from "@/features/investment-sips/sips-manager";
import {
  getAssetClassDistribution,
  getCompletedSipContributions,
  getMissedSips,
  getPlatformDistribution,
  getTotalCommitment,
  getUpcomingSips,
  listInvestmentAccountOptions,
  listInvestmentAssetOptions,
  listSips,
} from "@/features/investment-sips/queries";
import { investmentSipStatusSchema } from "@/lib/validation/investment-sips";

export const metadata: Metadata = {
  title: "Investments — DhanOS",
};

type InvestmentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvestmentsPage({
  searchParams,
}: InvestmentsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const statusParsed = investmentSipStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const now = new Date();
  const monthStart = toIsoDateString(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );
  const today = toIsoDateString(now);

  const supabase = await createClient();
  const [
    sipsPage,
    upcoming,
    missed,
    completedThisMonth,
    totalCommitment,
    platformDistribution,
    assetClassDistribution,
    assets,
    platforms,
    institutionsPage,
    contributionAccountsPage,
  ] = await Promise.all([
    listSips(
      supabase,
      household.id,
      { search, status },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
      today,
    ),
    getUpcomingSips(supabase, household.id, 14, today),
    getMissedSips(supabase, household.id, today),
    getCompletedSipContributions(supabase, household.id, monthStart, today),
    getTotalCommitment(supabase, household.id),
    getPlatformDistribution(supabase, household.id),
    getAssetClassDistribution(supabase, household.id),
    listInvestmentAssetOptions(supabase, household.id),
    listInvestmentAccountOptions(supabase, household.id),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Investments" }]} />}
        title="Investments"
        description="Systematic investment plans — contributions, schedules, and commitments across every platform and asset."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/app/investments/staking">Staking</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/investments/portfolio">
                Portfolio & performance
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        }
      />
      <SipsManager
        householdId={household.id}
        sips={sipsPage}
        upcoming={upcoming}
        missed={missed}
        completedThisMonth={completedThisMonth}
        totalCommitment={totalCommitment}
        platformDistribution={platformDistribution}
        assetClassDistribution={assetClassDistribution}
        assets={assets}
        platforms={platforms}
        institutions={institutionsPage.rows.map((institution) => ({
          id: institution.id,
          name: institution.name,
        }))}
        contributionAccounts={contributionAccountsPage.rows.map((account) => ({
          id: account.id,
          name: account.name,
          currencyCode: account.currency_code,
        }))}
        defaultCurrencyCode={household.base_currency_code}
        filters={{ search, status: status ?? "" }}
      />
    </PageShell>
  );
}
