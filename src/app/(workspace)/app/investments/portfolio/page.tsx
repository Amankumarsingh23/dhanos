import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney, formatPercentage } from "@/lib/money";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import {
  getAssetAllocation,
  getContributionHistory,
  getGainLossByHolding,
  getPlatformAllocation,
  getPortfolioHoldings,
  getPortfolioSummary,
  getPortfolioValueTrend,
} from "@/features/investments/queries";
import { HoldingsTable } from "@/features/investments/holdings-table";
import { PortfolioValueTrendChart } from "@/features/investments/charts/portfolio-value-trend-chart";
import { PrincipalVsGrowthChart } from "@/features/investments/charts/principal-vs-growth-chart";
import { ContributionHistoryChart } from "@/features/investments/charts/contribution-history-chart";
import { AllocationChart } from "@/features/investments/charts/allocation-chart";
import { GainLossByHoldingChart } from "@/features/investments/charts/gain-loss-by-holding-chart";
import { formatMonthLabel } from "@/features/dashboard/charts/chart-format";

export const metadata: Metadata = {
  title: "Portfolio — DhanOS",
};

const TREND_MONTHS = 6;

export default async function PortfolioPage() {
  const { household } = await requireHousehold();
  const currencyCode = household.base_currency_code;
  const today = toIsoDateString(new Date());

  const supabase = await createClient();
  const [
    summaries,
    holdings,
    assetAllocation,
    platformAllocation,
    gainLossByHolding,
    valueTrend,
    contributionHistory,
  ] = await Promise.all([
    getPortfolioSummary(supabase, household.id, today),
    getPortfolioHoldings(supabase, household.id, today),
    getAssetAllocation(supabase, household.id, today),
    getPlatformAllocation(supabase, household.id, today),
    getGainLossByHolding(supabase, household.id, currencyCode, today),
    getPortfolioValueTrend(
      supabase,
      household.id,
      currencyCode,
      TREND_MONTHS,
      today,
    ),
    getContributionHistory(
      supabase,
      household.id,
      currencyCode,
      TREND_MONTHS,
      today,
    ),
  ]);

  const baseSummary = summaries.find((s) => s.currencyCode === currencyCode);
  const otherCurrencySummaries = summaries.filter(
    (s) => s.currencyCode !== currencyCode,
  );

  const dataCutoffLabel = `Data as of ${formatDisplayDate(new Date(), "d MMM yyyy, HH:mm")}`;
  const trendRangeLabel = `${formatMonthLabel(valueTrend[0]?.monthKey ?? today.slice(0, 7))} – ${formatMonthLabel(valueTrend[valueTrend.length - 1]?.monthKey ?? today.slice(0, 7))}`;
  const asOfLabel = `As of ${formatDisplayDate(today)}`;

  const zero = formatMoney({ amountMinorUnits: 0, currencyCode });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Investments" }, { label: "Portfolio" }]}
          />
        }
        title="Portfolio & performance"
        description="Contributions, current value, gains, and how your money is allocated — across every holding."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/app/investments">
                <ArrowLeftIcon data-icon="inline-start" />
                SIPs
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/investments/staking">Staking</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {baseSummary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Total contributed"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.totalContributedMinorUnits,
                  currencyCode,
                })}
                caption={asOfLabel}
              />
              <SummaryCard
                title="Current value"
                amount={
                  baseSummary.holdingsMissingValuationCount ===
                  holdings.filter((h) => h.currencyCode === currencyCode).length
                    ? "—"
                    : formatMoney({
                        amountMinorUnits: baseSummary.currentValueMinorUnits,
                        currencyCode,
                      })
                }
                caption={
                  baseSummary.holdingsMissingValuationCount > 0
                    ? `${baseSummary.holdingsMissingValuationCount} holding${baseSummary.holdingsMissingValuationCount === 1 ? "" : "s"} not yet valued — excluded, not counted as zero`
                    : baseSummary.holdingsWithStaleValuationCount > 0
                      ? `${baseSummary.holdingsWithStaleValuationCount} holding${baseSummary.holdingsWithStaleValuationCount === 1 ? "" : "s"} with a stale valuation`
                      : asOfLabel
                }
              />
              <SummaryCard
                title="Realized gain/loss"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.realizedGainLossMinorUnits,
                  currencyCode,
                })}
                caption="From sales/withdrawals to date"
              />
              <SummaryCard
                title="Unrealized gain/loss"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.unrealizedGainLossMinorUnits,
                  currencyCode,
                })}
                caption="Current value minus remaining cost basis"
              />
              <SummaryCard
                title="Income received"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.incomeReceivedMinorUnits,
                  currencyCode,
                })}
                caption="Dividends + interest — never valuation gain"
              />
              <SummaryCard
                title="Fees"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.totalFeesMinorUnits,
                  currencyCode,
                })}
                caption="Inline + standalone fees, to date"
              />
              <SummaryCard
                title="Absolute return"
                amount={formatMoney({
                  amountMinorUnits: baseSummary.absoluteReturnMinorUnits,
                  currencyCode,
                })}
                caption="Realized + unrealized + income − fees (not annualized)"
              />
              <SummaryCard
                title="Annualized return (XIRR)"
                amount={
                  baseSummary.xirr.converged
                    ? formatPercentage(baseSummary.xirr.ratePercent / 100)
                    : "—"
                }
                caption={
                  baseSummary.xirr.converged
                    ? "Money-weighted, assumes reinvestment at this rate"
                    : baseSummary.xirr.message
                }
              />
            </div>

            {otherCurrencySummaries.length > 0 && (
              <div className="text-muted-foreground text-xs">
                Holdings in other currencies (
                {otherCurrencySummaries.map((s) => s.currencyCode).join(", ")})
                are tracked separately above — never combined with{" "}
                {currencyCode} without an explicit conversion.
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Total contributed"
              amount={zero}
              caption="No holdings yet"
            />
          </div>
        )}

        <HoldingsTable holdings={holdings} />

        <div className="grid gap-4 xl:grid-cols-2">
          <PortfolioValueTrendChart
            data={valueTrend}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <PrincipalVsGrowthChart
            data={valueTrend}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <ContributionHistoryChart
            data={contributionHistory}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <GainLossByHoldingChart
            rows={gainLossByHolding}
            currencyCode={currencyCode}
            dateRangeLabel={asOfLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <AllocationChart
            title="Asset allocation"
            rows={assetAllocation.filter(
              (row) => row.currencyCode === currencyCode,
            )}
            currencyCode={currencyCode}
            dateRangeLabel={asOfLabel}
            dataCutoffLabel={dataCutoffLabel}
            emptyDescription="No valued holdings yet."
          />
          <AllocationChart
            title="Platform allocation"
            rows={platformAllocation.filter(
              (row) => row.currencyCode === currencyCode,
            )}
            currencyCode={currencyCode}
            dateRangeLabel={asOfLabel}
            dataCutoffLabel={dataCutoffLabel}
            emptyDescription="No valued holdings yet."
          />
        </div>
      </div>
    </PageShell>
  );
}
