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
import type { NetWorthCurvePoint } from "@/features/net-worth/queries";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type NetWorthCurveChartProps = {
  data: readonly NetWorthCurvePoint[];
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
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>Net worth: {money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/**
 * Net worth over time — every point a real, previously-recorded snapshot
 * (PROMPT 32's "net-worth curve"), never interpolated or projected between
 * snapshots.
 */
export function NetWorthCurveChart({
  data,
  currencyCode,
  dateRangeLabel,
}: NetWorthCurveChartProps) {
  const isEmpty = data.length < 2;

  const accessibleSummary = `Net worth over time, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatDayLabel(point.asOfDate)} — ${money(point.netWorthMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Net worth"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="From recorded snapshots only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Record at least two snapshots to see a trend over time."
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
            dataKey="asOfDate"
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
            type="monotone"
            dataKey="netWorthMinorUnits"
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
