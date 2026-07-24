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
import type { BorrowerExposureRow } from "@/lib/calculations/lending-metrics";
import { formatCompactMoney, money } from "./chart-format";

type BorrowerExposureChartProps = {
  rows: readonly BorrowerExposureRow[];
  currencyCode: string;
};

function ChartTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: BorrowerExposureRow }[];
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.key}</p>
      <p>{money(row.outstandingMinorUnits, currencyCode)}</p>
      <p className="text-muted-foreground">
        {row.lendingCount} lending{row.lendingCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Horizontal-bar chart of outstanding receivables grouped by borrower —
 * PROMPT 23's "borrower exposure" view. Modeled on
 * src/features/loans/charts/debt-group-chart.tsx's exact visual pattern for
 * consistency across the app: one flat-colored bar per borrower, sorted
 * highest first, currently-owed lendings only.
 */
export function BorrowerExposureChart({
  rows,
  currencyCode,
}: BorrowerExposureChartProps) {
  const isEmpty = rows.length === 0;
  const height = Math.max(160, rows.length * 36 + 40);

  const accessibleSummary = `Borrower exposure: ${rows
    .map(
      (row) => `${row.key} — ${money(row.outstandingMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Borrower exposure"
      dateRangeLabel="Currently owed"
      dataCutoffLabel="Current outstanding balances"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Nothing currently outstanding."
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...rows]}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
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
            dataKey="key"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="outstandingMinorUnits"
            fill="var(--color-chart-2)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
