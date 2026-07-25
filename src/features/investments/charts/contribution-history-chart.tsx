"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { ContributionHistoryPoint } from "@/features/investments/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type ContributionHistoryChartProps = {
  data: readonly ContributionHistoryPoint[];
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
      <p>{money(payload[0]?.value ?? 0, currencyCode)}</p>
    </div>
  );
}

/** Monthly contribution/purchase totals — "contribution history" view. */
export function ContributionHistoryChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: ContributionHistoryChartProps) {
  const isEmpty = data.every((point) => point.amountMinorUnits === 0);

  const accessibleSummary = `Contribution history by month, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatMonthLabel(point.monthKey)} — ${money(point.amountMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Contribution history"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No contributions or purchases recorded in this period yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
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
          <Bar
            isAnimationActive={false}
            dataKey="amountMinorUnits"
            fill="var(--color-chart-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
