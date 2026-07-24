import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import { listInstitutions } from "@/features/institutions/queries";
import {
  listInvestmentAccountOptions,
  listInvestmentAssetOptions,
} from "@/features/investment-sips/queries";
import { StakingManager } from "@/features/staking/staking-manager";
import {
  getDailyValueSeries,
  getPlatformConcentration,
  listSnapshotsForPositions,
  listStakingPositions,
} from "@/features/staking/queries";
import { ActualClosingValueChart } from "@/features/staking/charts/actual-closing-value-chart";
import { CumulativeTrendChart } from "@/features/staking/charts/cumulative-trend-chart";
import { ExpectedProjectionChart } from "@/features/staking/charts/expected-projection-chart";
import { ActualVsExpectedChart } from "@/features/staking/charts/actual-vs-expected-chart";
import { formatDayLabel } from "@/features/staking/charts/chart-format";

export const metadata: Metadata = {
  title: "Staking — DhanOS",
};

const DAYS_BACK = 90;

export default async function StakingPage() {
  const { household } = await requireHousehold();
  const currencyCode = household.base_currency_code;
  const today = toIsoDateString(new Date());

  const supabase = await createClient();
  const [
    positionsPage,
    platformConcentration,
    dailySeries,
    assets,
    platforms,
    institutionsPage,
  ] = await Promise.all([
    listStakingPositions(supabase, household.id, {}, { pageSize: 100 }, today),
    getPlatformConcentration(supabase, household.id, today),
    getDailyValueSeries(supabase, household.id, currencyCode, DAYS_BACK, today),
    listInvestmentAssetOptions(supabase, household.id),
    listInvestmentAccountOptions(supabase, household.id),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  const snapshotsByPosition = await listSnapshotsForPositions(
    supabase,
    household.id,
    positionsPage.rows.map((p) => p.id),
  );

  const dateRangeLabel = `${formatDayLabel(dailySeries[0]?.date ?? today)} – ${formatDayLabel(dailySeries[dailySeries.length - 1]?.date ?? today)}`;
  const dataCutoffLabel = `Data as of ${formatDisplayDate(new Date(), "d MMM yyyy, HH:mm")}`;

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Investments" }, { label: "Staking" }]}
          />
        }
        title="Staking & daily value tracking"
        description="Positions whose value is tracked day by day — every snapshot is a permanent, versioned fact, never overwritten."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/app/investments">
                <ArrowLeftIcon data-icon="inline-start" />
                SIPs
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/investments/portfolio">
                Portfolio & performance
              </Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <StakingManager
          householdId={household.id}
          positions={positionsPage.rows}
          platformConcentration={platformConcentration}
          snapshotsByPosition={snapshotsByPosition}
          assets={assets}
          platforms={platforms}
          institutions={institutionsPage.rows.map((institution) => ({
            id: institution.id,
            name: institution.name,
          }))}
          defaultCurrencyCode={currencyCode}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <ActualClosingValueChart
            data={dailySeries}
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <ActualVsExpectedChart
            data={dailySeries}
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <CumulativeTrendChart
            title="Total contributed"
            data={dailySeries}
            dataKey="cumulativeContributedMinorUnits"
            color="var(--color-chart-2)"
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
            emptyDescription="No contributions recorded yet."
          />
          <CumulativeTrendChart
            title="Accumulated rewards"
            data={dailySeries}
            dataKey="cumulativeRewardsMinorUnits"
            color="var(--color-chart-3)"
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
            emptyDescription="No rewards recorded yet."
          />
          <CumulativeTrendChart
            title="Withdrawals"
            data={dailySeries}
            dataKey="cumulativeWithdrawalsMinorUnits"
            color="var(--color-chart-4)"
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
            emptyDescription="No withdrawals recorded yet."
          />
          <ExpectedProjectionChart
            data={dailySeries}
            currencyCode={currencyCode}
            dateRangeLabel={dateRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
        </div>
      </div>
    </PageShell>
  );
}
