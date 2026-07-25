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
import type { AssetGrowthPoint } from "@/features/net-worth/queries";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type AssetGrowthChartProps = {
  data: readonly AssetGrowthPoint[];
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
  payload?: { payload: AssetGrowthPoint }[];
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
      <p>Total assets: {money(row.totalAssetsMinorUnits, currencyCode)}</p>
      <p className="text-muted-foreground mt-1">
        Cash: {money(row.cashAndAccountsMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground">
        Investments: {money(row.investmentsMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground">
        Movable assets: {money(row.movableAssetsMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground">
        Property: {money(row.propertyMinorUnits, currencyCode)}
      </p>
      <p className="text-muted-foreground">
        Receivables: {money(row.receivablesMinorUnits, currencyCode)}
      </p>
    </div>
  );
}

/** Total assets over time (PROMPT 32's "asset growth"), every point from a real recorded snapshot — the tooltip breaks it down by component for transparency, never just the total. */
export function AssetGrowthChart({
  data,
  currencyCode,
  dateRangeLabel,
}: AssetGrowthChartProps) {
  const isEmpty = data.length < 2;

  const accessibleSummary = `Total assets over time, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatDayLabel(point.asOfDate)} — ${money(point.totalAssetsMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Asset growth"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel="From recorded snapshots only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Record at least two snapshots to see asset growth over time."
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
            dataKey="totalAssetsMinorUnits"
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
