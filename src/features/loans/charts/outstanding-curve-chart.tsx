"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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

type OutstandingCurveChartProps = {
  data: readonly DebtTrendPoint[];
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
  payload?: { value: number }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>Outstanding: {money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/**
 * Total outstanding debt across every active/still-repaying loan, month
 * by month — PROMPT 22's "outstanding balance curve." Every point comes
 * from real, already-recorded payments (src/lib/calculations/debt-trend.ts),
 * never a projected schedule.
 */
export function OutstandingCurveChart({
  data,
  currencyCode,
  dateRangeLabel,
}: OutstandingCurveChartProps) {
  const isEmpty = data.every((point) => point.outstandingMinorUnits === 0);

  const accessibleSummary = `Outstanding balance by month, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatMonthLabel(point.monthKey)} — ${money(point.outstandingMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Outstanding balance"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="Actual balances only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No disbursed loans yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Line
            type="monotone"
            dataKey="outstandingMinorUnits"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
