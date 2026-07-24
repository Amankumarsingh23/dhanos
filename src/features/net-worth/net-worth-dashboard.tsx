"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import { recordNetWorthSnapshotAction } from "./actions";
import { NetWorthCurveChart } from "./charts/net-worth-curve-chart";
import { AssetGrowthChart } from "./charts/asset-growth-chart";
import { DebtReductionChart } from "./charts/debt-reduction-chart";
import { ContributionVsValuationChart } from "./charts/contribution-vs-valuation-chart";
import { MonthOverMonthChart } from "./charts/month-over-month-chart";
import type { NetWorthBreakdown, NetWorthChartsData } from "./queries";

type NetWorthDashboardProps = {
  householdId: string;
  breakdown: NetWorthBreakdown;
  charts: NetWorthChartsData;
  hasSnapshotToday: boolean;
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

function completenessBadgeVariant(
  percentage: number,
): "secondary" | "outline" | "destructive" {
  if (percentage >= 100) return "secondary";
  if (percentage >= 75) return "outline";
  return "destructive";
}

export function NetWorthDashboard({
  householdId,
  breakdown,
  charts,
  hasSnapshotToday,
}: NetWorthDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { currencyCode } = breakdown;

  function handleRecordSnapshot() {
    startTransition(async () => {
      const result = await recordNetWorthSnapshotAction(
        householdId,
        currencyCode,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Net worth snapshot recorded");
      router.refresh();
    });
  }

  const dateRangeLabel =
    charts.netWorthCurve.length > 0
      ? `${formatDisplayDate(charts.netWorthCurve[0]!.asOfDate)} – ${formatDisplayDate(
          charts.netWorthCurve[charts.netWorthCurve.length - 1]!.asOfDate,
        )}`
      : "No snapshots yet";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Computed live, as of today ({formatDisplayDate(breakdown.asOfDate)}).
          Record a snapshot to add today&rsquo;s figure to your history below.
        </p>
        <Button
          onClick={handleRecordSnapshot}
          disabled={isPending || hasSnapshotToday}
        >
          {isPending
            ? "Recording…"
            : hasSnapshotToday
              ? "Already recorded today"
              : "Record snapshot"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Net worth"
          amount={money(breakdown.netWorthMinorUnits, currencyCode)}
          caption="Total assets minus total liabilities"
        />
        <SummaryCard
          title="Total assets"
          amount={money(breakdown.totalAssetsMinorUnits, currencyCode)}
          caption="Cash + investments + assets + receivables"
        />
        <SummaryCard
          title="Total liabilities"
          amount={money(breakdown.totalLiabilitiesMinorUnits, currencyCode)}
          caption="Loans + other confirmed liabilities"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm font-medium">
            What&rsquo;s counted, and how complete it is
          </CardTitle>
          <Badge
            variant={completenessBadgeVariant(breakdown.completenessPercentage)}
          >
            {breakdown.completenessPercentage.toFixed(0)}% complete
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Cash & accounts"
              value={money(breakdown.cashAndAccountsMinorUnits, currencyCode)}
            />
            <Field
              label="Investments"
              value={money(breakdown.investmentsMinorUnits, currencyCode)}
            />
            <Field
              label="Movable assets"
              value={money(breakdown.movableAssetsMinorUnits, currencyCode)}
            />
            <Field
              label="Property"
              value={money(breakdown.propertyMinorUnits, currencyCode)}
            />
            <Field
              label="Receivables"
              value={money(breakdown.receivablesMinorUnits, currencyCode)}
            />
            <Field
              label="Loans"
              value={money(breakdown.loansMinorUnits, currencyCode)}
            />
            <Field
              label="Other liabilities"
              value={money(breakdown.otherLiabilitiesMinorUnits, currencyCode)}
            />
          </dl>
          <div className="text-muted-foreground space-y-1 border-t pt-3 text-xs">
            {breakdown.missingValuationCount > 0 ? (
              <p>
                {breakdown.missingValuationCount} of{" "}
                {breakdown.valuationDependentItemCount} investment/asset
                valuation(s) are missing — those items count as ₹0 toward the
                total above rather than a guess, which is exactly why
                completeness is below 100%, not because the total itself is
                wrong.
              </p>
            ) : (
              <p>
                Every investment and asset that counts toward net worth has a
                real, recorded valuation.
              </p>
            )}
            {breakdown.estimatedGeneralObligationsExcludedMinorUnits > 0 && (
              <p>
                {money(
                  breakdown.estimatedGeneralObligationsExcludedMinorUnits,
                  currencyCode,
                )}{" "}
                in estimated (not yet confirmed) general obligations is
                deliberately excluded from &ldquo;other liabilities&rdquo; above
                — only confirmed liabilities reduce net worth.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Why eligible accounts and ownership percentage matter
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Credit cards and loan accounts are never counted as cash here —
            their balance represents money owed, not money you have. Similarly,
            a jointly-owned asset only contributes its owned share (ownership
            percentage) to net worth, and a disputed or expected-only asset
            contributes nothing at all until its ownership is confirmed.
          </p>
          <p>
            Illiquid or uncertain items — a disputed receivable, an unconfirmed
            general obligation — either don&rsquo;t count or are shown as a
            separate, clearly labeled figure rather than being blended into the
            confirmed total.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <NetWorthCurveChart
          data={charts.netWorthCurve}
          currencyCode={currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <AssetGrowthChart
          data={charts.assetGrowth}
          currencyCode={currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <DebtReductionChart
          data={charts.debtReduction}
          currencyCode={currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <ContributionVsValuationChart
          data={charts.contributionVsValuation}
          currencyCode={currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <MonthOverMonthChart
          data={charts.monthOverMonth}
          currencyCode={currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
