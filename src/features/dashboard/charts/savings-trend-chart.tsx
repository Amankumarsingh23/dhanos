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
import type { CashFlowTrendRow } from "@/features/dashboard/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type SavingsTrendChartProps = {
  data: readonly CashFlowTrendRow[];
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
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>Free cash flow: {money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/**
 * Monthly free cash flow (income minus expenses minus debt payments) —
 * the amount actually available to save each month. Bars are sign-aware
 * (a shortfall month renders in the destructive color), and each bar
 * carries a direct value label so the sign is never conveyed by color
 * alone.
 */
export function SavingsTrendChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: SavingsTrendChartProps) {
  const isEmpty = data.every((row) => row.freeCashFlowMinorUnits === 0);

  const accessibleSummary = `Monthly free cash flow (savings), ${dateRangeLabel}: ${data
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — ${money(row.freeCashFlowMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Monthly savings trend"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared cash-flow transactions in this period yet."
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
            dataKey="freeCashFlowMinorUnits"
            radius={[4, 4, 4, 4]}
            maxBarSize={40}
          >
            {data.map((row) => (
              <Cell
                key={row.monthKey}
                fill={
                  row.freeCashFlowMinorUnits < 0
                    ? "var(--color-destructive)"
                    : "var(--color-chart-2)"
                }
              />
            ))}
            <LabelList
              dataKey="freeCashFlowMinorUnits"
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
