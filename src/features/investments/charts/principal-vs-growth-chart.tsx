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
import type { PortfolioValuePoint } from "@/features/investments/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type PrincipalVsGrowthChartProps = {
  data: readonly PortfolioValuePoint[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type ChartRow = {
  monthKey: string;
  principalMinorUnits: number;
  growthMinorUnits: number;
  hasCompleteValuations: boolean;
};

function toChartRow(point: PortfolioValuePoint): ChartRow {
  return {
    monthKey: point.monthKey,
    principalMinorUnits: point.principalMinorUnits,
    growthMinorUnits: point.currentValueMinorUnits - point.principalMinorUnits,
    hasCompleteValuations: point.hasCompleteValuations,
  };
}

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
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
      <p>Principal: {money(row.principalMinorUnits, currencyCode)}</p>
      <p>Growth: {money(row.growthMinorUnits, currencyCode)}</p>
      {!row.hasCompleteValuations && (
        <p className="text-muted-foreground mt-1">
          Incomplete — at least one holding had no valuation yet.
        </p>
      )}
    </div>
  );
}

/**
 * Principal (cost basis of what's still held) versus growth (current
 * value minus principal), one bar pair per month — PROMPT 18 acceptance
 * criterion "principal and growth are visually separable." Rendered as
 * two stacked bars rather than a stacked area: a negative growth month
 * (value below cost — a paper loss) extends *below* the zero axis while
 * principal extends above it, which stays visually correct for both a
 * gain and a loss month, unlike a stacked area's ambiguous handling of a
 * negative segment.
 */
export function PrincipalVsGrowthChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: PrincipalVsGrowthChartProps) {
  const chartData = data.map(toChartRow);
  const isEmpty = chartData.every((row) => row.principalMinorUnits === 0);

  const accessibleSummary = `Principal versus growth by month, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — principal ${money(row.principalMinorUnits, currencyCode)}, growth ${money(row.growthMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Principal vs. growth"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No contributions recorded yet for your base-currency holdings."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
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
              value === "principalMinorUnits" ? "Principal" : "Growth"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="principalMinorUnits"
            name="principalMinorUnits"
            stackId="value"
            fill="var(--color-chart-2)"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="growthMinorUnits"
            name="growthMinorUnits"
            stackId="value"
            fill="var(--color-chart-4)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
