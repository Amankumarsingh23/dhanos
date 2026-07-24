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
import type { AllocationRow } from "@/features/investments/queries";
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

type AllocationChartProps = {
  title: string;
  rows: readonly AllocationRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
  emptyDescription: string;
  maxBars?: number;
};

type ChartRow = { label: string; currentValueMinorUnits: number };

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
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.label}</p>
      <p>{money(row.currentValueMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * Shared horizontal-bar allocation chart, used for both "asset
 * allocation" and "platform allocation" (PROMPT 18) — the two are
 * identical in shape (current value grouped by one label, largest
 * first), differing only in what produced the grouping, so one
 * component is reused rather than duplicated. Rows are restricted to one
 * currency at a time by the caller (src/features/investments/queries.ts
 * already returns per-currency rows) — never blended.
 */
export function AllocationChart({
  title,
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
  emptyDescription,
  maxBars = 8,
}: AllocationChartProps) {
  const top = rows.slice(0, maxBars);
  const rest = rows.slice(maxBars);
  const otherTotal = rest.reduce(
    (sum, row) => sum + row.currentValueMinorUnits,
    0,
  );

  const chartData: ChartRow[] = top.map((row) => ({
    label: row.label,
    currentValueMinorUnits: row.currentValueMinorUnits,
  }));
  if (otherTotal > 0) {
    chartData.push({ label: "Other", currentValueMinorUnits: otherTotal });
  }

  const isEmpty = chartData.length === 0;
  const chartHeight = Math.max(220, chartData.length * 36 + 40);

  const accessibleSummary = `${title}, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${row.label} — ${money(row.currentValueMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title={title}
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription={emptyDescription}
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
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="currentValueMinorUnits"
            fill="var(--color-chart-2)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
