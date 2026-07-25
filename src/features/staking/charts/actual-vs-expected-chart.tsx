"use client";

import {
  CartesianGrid,
  Legend,
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

type ActualVsExpectedChartProps = {
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
  payload?: { dataKey: string; value: number | null }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const actual = payload.find(
    (p) => p.dataKey === "closingValueMinorUnits",
  )?.value;
  const expected = payload.find(
    (p) => p.dataKey === "expectedValueMinorUnits",
  )?.value;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>Actual: {money(actual ?? 0, currencyCode)}</p>
      <p>
        Expected (assumption):{" "}
        {expected == null ? "not set" : money(expected, currencyCode)}
      </p>
    </div>
  );
}

/**
 * Actual (solid) versus expected/projected (dashed) value, overlaid —
 * PROMPT 19 acceptance criterion "projection and actual data are visually
 * distinct." Never merged into a single series or styling.
 */
export function ActualVsExpectedChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: ActualVsExpectedChartProps) {
  const isEmpty = !data.some((point) => point.hasAnySnapshot);

  const accessibleSummary = `Actual versus expected value by day, ${dateRangeLabel}. The expected line is a projection based on each position's expected daily rate, not a guarantee.`;

  return (
    <ChartCard
      title="Actual vs. expected"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No daily snapshots recorded yet."
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
          <Legend
            formatter={(value) =>
              value === "closingValueMinorUnits"
                ? "Actual"
                : "Expected (assumption)"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="closingValueMinorUnits"
            name="closingValueMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="expectedValueMinorUnits"
            name="expectedValueMinorUnits"
            stroke="var(--color-chart-4)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
