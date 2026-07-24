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

type ExpectedProjectionChartProps = {
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
  payload?: { value: number | null }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const value = payload[0]?.value;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>
        {value == null
          ? "No expected rate set yet"
          : money(value, currencyCode)}
      </p>
    </div>
  );
}

/**
 * The expected-value projection alone, based on each position's own
 * `expected_daily_rate` (see src/lib/calculations/staking-snapshot.ts) —
 * rendered dashed and captioned as an assumption throughout, since PROMPT
 * 19 requires "expected return must never be shown as guaranteed."
 * Positions with no rate set are simply excluded from this figure, never
 * assumed to be zero-growth.
 */
export function ExpectedProjectionChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: ExpectedProjectionChartProps) {
  const isEmpty = data.every((point) => point.expectedValueMinorUnits === null);

  const accessibleSummary = `Expected (projected, not guaranteed) value by day, ${dateRangeLabel} — an assumption based on each position's expected daily rate, excluding positions with no rate set.`;

  return (
    <ChartCard
      title="Expected projection"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No position has an expected daily rate set yet."
    >
      <div className="flex h-full flex-col">
        <p className="text-muted-foreground mb-1 text-xs">
          An assumption, not a guarantee — based on each position&apos;s own
          expected daily rate.
        </p>
        <div className="min-h-0 flex-1">
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
                dataKey="expectedValueMinorUnits"
                stroke="var(--color-chart-4)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
