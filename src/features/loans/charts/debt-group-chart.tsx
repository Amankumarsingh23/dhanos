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
import type { DebtGroupRow } from "@/lib/calculations/debt-metrics";
import { formatCompactMoney, money } from "./chart-format";

type DebtGroupChartProps = {
  title: string;
  rows: readonly DebtGroupRow[];
  currencyCode: string;
  emptyDescription: string;
};

function ChartTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: DebtGroupRow }[];
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
        {row.loanCount} loan{row.loanCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Shared horizontal-bar chart for outstanding debt grouped by lender or by
 * loan type — PROMPT 22's "lender exposure" (and, as a bonus reuse of the
 * same shape, "debt by type"). Modeled on
 * src/features/investments/charts/allocation-chart.tsx's exact visual
 * pattern for consistency across the app: one flat-colored bar per group,
 * sorted highest first, active loans only.
 */
export function DebtGroupChart({
  title,
  rows,
  currencyCode,
  emptyDescription,
}: DebtGroupChartProps) {
  const isEmpty = rows.length === 0;
  const height = Math.max(160, rows.length * 36 + 40);

  const accessibleSummary = `${title}: ${rows
    .map(
      (row) => `${row.key} — ${money(row.outstandingMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title={title}
      dateRangeLabel="Active loans"
      dataCutoffLabel="Current outstanding balances"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription={emptyDescription}
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
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
            isAnimationActive={false}
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
