"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { ContributionVsValuationPoint } from "@/features/net-worth/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "./chart-format";

type ContributionVsValuationChartProps = {
  data: readonly ContributionVsValuationPoint[];
  currencyCode: string;
  dateRangeLabel: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: ContributionVsValuationPoint }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>Contribution: {money(row.contributionMinorUnits, currencyCode)}</p>
      <p>
        Valuation change: {money(row.valuationChangeMinorUnits, currencyCode)}
      </p>
    </div>
  );
}

/**
 * How much of each month's change in investment value came from actual
 * money put in (or taken out) versus market movement — PROMPT 32's
 * "contribution versus valuation change." Rendered as two stacked bars
 * (matching PROMPT 18's principal-vs-growth pattern) so a valuation *loss*
 * extends below the zero axis while a positive contribution still extends
 * above it, staying visually correct even in a down month.
 */
export function ContributionVsValuationChart({
  data,
  currencyCode,
  dateRangeLabel,
}: ContributionVsValuationChartProps) {
  const isEmpty = data.every(
    (point) =>
      point.contributionMinorUnits === 0 &&
      point.valuationChangeMinorUnits === 0,
  );

  const accessibleSummary = `Contribution versus valuation change by month, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatMonthLabel(point.monthKey)} — contribution ${money(point.contributionMinorUnits, currencyCode)}, valuation change ${money(point.valuationChangeMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Contribution vs. valuation change"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="Investments only, from recorded snapshots and transactions"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Record at least two snapshots with investment activity to see this breakdown."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
          data={[...data]}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-border"
          />
          <XAxis
            dataKey="monthKey"
            tickFormatter={formatMonthTick}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs"
          />
          <YAxis
            tickFormatter={(value: number) =>
              formatCompactMoney(value, currencyCode)
            }
            tickLine={false}
            axisLine={false}
            width={64}
            className="fill-muted-foreground text-xs"
          />
          <ReferenceLine y={0} className="stroke-border" />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Legend
            formatter={(value) =>
              value === "contributionMinorUnits"
                ? "Contribution"
                : "Valuation change"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="contributionMinorUnits"
            name="contributionMinorUnits"
            stackId="value"
            fill="var(--color-chart-2)"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="valuationChangeMinorUnits"
            name="valuationChangeMinorUnits"
            stackId="value"
            fill="var(--color-chart-4)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
