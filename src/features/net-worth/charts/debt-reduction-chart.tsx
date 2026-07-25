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
import type { DebtReductionPoint } from "@/features/net-worth/queries";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type DebtReductionChartProps = {
  data: readonly DebtReductionPoint[];
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
  payload?: { payload: DebtReductionPoint }[];
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
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>
        Total liabilities: {money(row.totalLiabilitiesMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground mt-1">
        Loans: {money(row.loansMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground">
        Other liabilities: {money(row.otherLiabilitiesMinorUnits, currencyCode)}
      </p>
    </div>
  );
}

/** Total liabilities over time (PROMPT 32's "debt reduction"), every point from a real recorded snapshot — split by loans vs. other liabilities in the tooltip. */
export function DebtReductionChart({
  data,
  currencyCode,
  dateRangeLabel,
}: DebtReductionChartProps) {
  const isEmpty = data.length < 2;

  const accessibleSummary = `Total liabilities over time, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatDayLabel(point.asOfDate)} — ${money(point.totalLiabilitiesMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Debt reduction"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="From recorded snapshots only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Record at least two snapshots to see debt reduction over time."
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
            isAnimationActive={false}
            type="monotone"
            dataKey="totalLiabilitiesMinorUnits"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
