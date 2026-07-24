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
import type { ExpenseByCategoryRow } from "@/features/expenses/queries";
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

type ExpenseCategoryChartProps = {
  rows: readonly ExpenseByCategoryRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
  maxCategories?: number;
};

type ChartRow = { categoryName: string; totalMinorUnits: number };

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
      <p className="mb-1 font-medium">{row.categoryName}</p>
      <p>{money(row.totalMinorUnits, currencyCode)}</p>
    </div>
  );
}

/** Horizontal bar chart of net expense totals by category, largest first, folding the long tail into "Other". */
export function ExpenseCategoryChart({
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
  maxCategories = 8,
}: ExpenseCategoryChartProps) {
  const positiveRows = rows.filter((row) => row.totalMinorUnits > 0);
  const top = positiveRows.slice(0, maxCategories);
  const rest = positiveRows.slice(maxCategories);
  const otherTotal = rest.reduce((sum, row) => sum + row.totalMinorUnits, 0);

  const chartData: ChartRow[] = top.map((row) => ({
    categoryName: row.categoryName,
    totalMinorUnits: row.totalMinorUnits,
  }));
  if (otherTotal > 0) {
    chartData.push({ categoryName: "Other", totalMinorUnits: otherTotal });
  }

  const isEmpty = chartData.length === 0;

  const accessibleSummary = `Expenses by category, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${row.categoryName} — ${money(row.totalMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  // Recharts sizes a vertical bar chart's category axis by row count — tall
  // enough that each label has room, never crammed onto one fixed height.
  const chartHeight = Math.max(220, chartData.length * 36 + 40);

  return (
    <ChartCard
      title="Expenses by category"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared expenses in this period yet."
      height={chartHeight}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
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
            dataKey="categoryName"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="totalMinorUnits"
            fill="var(--color-chart-2)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
