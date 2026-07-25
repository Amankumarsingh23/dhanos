"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { IncomeBySourceRow } from "@/features/income/queries";
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

type IncomeBySourceChartProps = {
  rows: readonly IncomeBySourceRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
  maxSources?: number;
};

type ChartRow = { sourceName: string; totalMinorUnits: number };

function ChartTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.sourceName}</p>
      <p>{money(row.totalMinorUnits, currencyCode)}</p>
    </div>
  );
}

/** Horizontal bar chart of income totals by source, largest first, folding the long tail into "Other" — same shape as ExpenseCategoryChart. */
export function IncomeBySourceChart({
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
  maxSources = 8,
}: IncomeBySourceChartProps) {
  const positiveRows = rows.filter((row) => row.totalMinorUnits > 0);
  const top = positiveRows.slice(0, maxSources);
  const rest = positiveRows.slice(maxSources);
  const otherTotal = rest.reduce((sum, row) => sum + row.totalMinorUnits, 0);

  const chartData: ChartRow[] = top.map((row) => ({
    sourceName: row.sourceName,
    totalMinorUnits: row.totalMinorUnits,
  }));
  if (otherTotal > 0) {
    chartData.push({ sourceName: "Other", totalMinorUnits: otherTotal });
  }

  const isEmpty = chartData.length === 0;

  const accessibleSummary = `Income by source, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${row.sourceName} — ${money(row.totalMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  const chartHeight = Math.max(220, chartData.length * 36 + 40);

  return (
    <ChartCard
      title="Income by source"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared income in this period yet."
      height={chartHeight}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-border"
          />
          <XAxis
            type="number"
            tickFormatter={(value: number) =>
              formatCompactMoney(value, currencyCode)
            }
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs"
          />
          <YAxis
            type="category"
            dataKey="sourceName"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="totalMinorUnits"
            fill="var(--color-chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
