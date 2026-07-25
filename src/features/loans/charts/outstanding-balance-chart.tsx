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
import type { LoanBalancePoint } from "@/lib/calculations/loan-outstanding";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type OutstandingBalanceChartProps = {
  data: readonly LoanBalancePoint[];
  currencyCode: string;
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
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>Outstanding: {money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/**
 * Outstanding principal after every actual recorded payment — PROMPT 21
 * acceptance criterion "debt charts use actual payments and balances."
 * Built only from real loan_payments rows (via
 * src/lib/calculations/loan-outstanding.ts's computeLoanBalanceHistory),
 * never a projection.
 */
export function OutstandingBalanceChart({
  data,
  currencyCode,
}: OutstandingBalanceChartProps) {
  const isEmpty = data.length === 0;
  const latest = data[data.length - 1]?.outstandingMinorUnits ?? 0;

  const accessibleSummary = `Outstanding balance after each payment: ${data
    .map(
      (point) =>
        `${formatDayLabel(point.date)} — ${money(point.outstandingMinorUnits, currencyCode)}`,
    )
    .join("; ")}. Currently ${money(latest, currencyCode)}.`;

  return (
    <ChartCard
      title="Outstanding balance"
      dateRangeLabel="Every recorded payment"
      dataCutoffLabel="Actual payments only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No payments recorded yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            dataKey="date"
            tickFormatter={formatDayTick}
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
            isAnimationActive={false}
            type="stepAfter"
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
