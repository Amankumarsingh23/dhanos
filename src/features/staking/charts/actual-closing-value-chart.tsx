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
import type { DailyValuePoint } from "@/features/staking/queries";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type ActualClosingValueChartProps = {
  data: readonly DailyValuePoint[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
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
      <p>{money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/** Actual closing value, day by day, across active base-currency staking positions — solid line, real data only (no projection). */
export function ActualClosingValueChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: ActualClosingValueChartProps) {
  const isEmpty = !data.some((point) => point.hasAnySnapshot);

  const accessibleSummary = `Actual closing value by day, ${dateRangeLabel}. Latest: ${money(
    data[data.length - 1]?.closingValueMinorUnits ?? 0,
    currencyCode,
  )}.`;

  return (
    <ChartCard
      title="Actual closing value"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No daily snapshots recorded yet."
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
            type="monotone"
            dataKey="closingValueMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
