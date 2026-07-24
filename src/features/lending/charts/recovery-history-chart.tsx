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
import type { LendingRecoveryPoint } from "@/lib/calculations/lending-outstanding";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type RecoveryHistoryChartProps = {
  data: readonly LendingRecoveryPoint[];
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
 * Outstanding balance after every actual recorded repayment — PROMPT 23's
 * "recovery history" view. Built only from real lending_repayments rows
 * (via src/lib/calculations/lending-outstanding.ts's
 * computeLendingRecoveryHistory), never a projection.
 */
export function RecoveryHistoryChart({
  data,
  currencyCode,
}: RecoveryHistoryChartProps) {
  const isEmpty = data.length === 0;
  const latest = data[data.length - 1]?.outstandingMinorUnits ?? 0;

  const accessibleSummary = `Outstanding balance after each repayment: ${data
    .map(
      (point) =>
        `${formatDayLabel(point.date)} — ${money(point.outstandingMinorUnits, currencyCode)}`,
    )
    .join("; ")}. Currently ${money(latest, currencyCode)}.`;

  return (
    <ChartCard
      title="Recovery history"
      dateRangeLabel="Every recorded repayment"
      dataCutoffLabel="Actual repayments only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No repayments recorded yet."
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
