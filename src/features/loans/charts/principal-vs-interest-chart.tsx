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
import type { DebtTrendPoint } from "@/lib/calculations/debt-trend";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "./chart-format";

type PrincipalVsInterestChartProps = {
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
  payload?: { payload: DebtTrendPoint }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>
        Principal repaid:{" "}
        {money(row.cumulativePrincipalPaidMinorUnits, currencyCode)}
      </p>
      <p>
        Interest paid:{" "}
        {money(row.cumulativeInterestPaidMinorUnits, currencyCode)}
      </p>
    </div>
  );
}

/**
 * Cumulative principal repaid versus cumulative interest paid, month by
 * month — PROMPT 22's "principal versus interest." Two lines in one
 * chart, deliberately never merged into a single total, so a household can
 * see how much of what they've paid actually reduced the debt versus
 * covered its cost.
 */
export function PrincipalVsInterestChart({
  data,
  currencyCode,
  dateRangeLabel,
}: PrincipalVsInterestChartProps) {
  const isEmpty = data.every(
    (point) =>
      point.cumulativePrincipalPaidMinorUnits === 0 &&
      point.cumulativeInterestPaidMinorUnits === 0,
  );

  const accessibleSummary = `Principal versus interest paid by month, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatMonthLabel(point.monthKey)} — principal ${money(point.cumulativePrincipalPaidMinorUnits, currencyCode)}, interest ${money(point.cumulativeInterestPaidMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Principal vs. interest paid"
      dateRangeLabel={dateRangeLabel}
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
          <Legend
            formatter={(value) =>
              value === "cumulativePrincipalPaidMinorUnits"
                ? "Principal repaid"
                : "Interest paid"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="cumulativePrincipalPaidMinorUnits"
            name="cumulativePrincipalPaidMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="cumulativeInterestPaidMinorUnits"
            name="cumulativeInterestPaidMinorUnits"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
