"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { DebtTrendPoint } from "@/lib/calculations/debt-trend";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "./chart-format";

type DebtReductionChartProps = {
  data: readonly DebtTrendPoint[];
  currencyCode: string;
  dateRangeLabel: string;
};

type ChartRow = { monthKey: string; reductionMinorUnits: number };

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
      <p>
        {row.reductionMinorUnits >= 0
          ? "Debt reduced by "
          : "Debt increased by "}
        {money(Math.abs(row.reductionMinorUnits), currencyCode)}
      </p>
    </div>
  );
}

/**
 * How much total outstanding debt fell (or, if a new loan was disbursed
 * that month, rose) month over month — PROMPT 22's "debt reduction,"
 * distinct from the outstanding-balance curve: that shows the running
 * level, this shows the month-to-month pace of paying it down.
 */
export function DebtReductionChart({
  data,
  currencyCode,
  dateRangeLabel,
}: DebtReductionChartProps) {
  const chartData: ChartRow[] = data.slice(1).map((point, index) => ({
    monthKey: point.monthKey,
    reductionMinorUnits:
      data[index]!.outstandingMinorUnits - point.outstandingMinorUnits,
  }));
  const isEmpty = chartData.every((row) => row.reductionMinorUnits === 0);

  const accessibleSummary = `Month-over-month change in outstanding debt, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — ${row.reductionMinorUnits >= 0 ? "reduced by" : "increased by"} ${money(Math.abs(row.reductionMinorUnits), currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Debt reduction"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="Actual balances only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Not enough history yet to show month-over-month change."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
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
          <Bar
            isAnimationActive={false}
            dataKey="reductionMinorUnits"
            fill="var(--color-chart-2)"
            radius={[2, 2, 2, 2]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
