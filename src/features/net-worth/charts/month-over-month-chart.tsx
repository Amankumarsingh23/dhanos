"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { MonthOverMonthNetWorthChange } from "@/lib/calculations/net-worth";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "./chart-format";

type MonthOverMonthChartProps = {
  data: readonly MonthOverMonthNetWorthChange[];
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
  payload?: { payload: MonthOverMonthNetWorthChange }[];
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
      <p>Change: {money(row.changeMinorUnits, currencyCode)}</p>
      {row.changePercentage !== null && (
        <p className="text-muted-foreground">
          {row.changePercentage >= 0 ? "+" : ""}
          {row.changePercentage.toFixed(1)}% vs. the prior month
        </p>
      )}
    </div>
  );
}

/**
 * Month-over-month change in net worth (PROMPT 32) — one bar per month
 * that has a recorded snapshot, compared against the latest snapshot in
 * the prior month. Sign-aware (a decline renders in the destructive
 * color) with a direct value label, same convention as the dashboard's
 * SavingsTrendChart, so the sign is never conveyed by color alone.
 */
export function MonthOverMonthChart({
  data,
  currencyCode,
  dateRangeLabel,
}: MonthOverMonthChartProps) {
  const isEmpty = data.length < 2;

  const accessibleSummary = `Month-over-month net worth change, ${dateRangeLabel}: ${data
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — ${money(row.changeMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Month-over-month change"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="From recorded snapshots only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Record snapshots in at least two different months to see month-over-month change."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
          data={[...data]}
          margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
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
          <ReferenceLine y={0} className="stroke-border" />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            isAnimationActive={false}
            dataKey="changeMinorUnits"
            radius={[4, 4, 4, 4]}
            maxBarSize={40}
          >
            {data.map((row) => (
              <Cell
                key={row.monthKey}
                fill={
                  row.changeMinorUnits < 0
                    ? "var(--color-destructive)"
                    : "var(--color-chart-2)"
                }
              />
            ))}
            <LabelList
              dataKey="changeMinorUnits"
              position="top"
              className="fill-muted-foreground"
              fontSize={10}
              formatter={(
                value: string | number | boolean | null | undefined,
              ) => formatCompactMoney(Number(value ?? 0), currencyCode)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
