"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { AccountBalanceTrendRow } from "@/features/dashboard/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type AccountBalanceTrendChartProps = {
  data: readonly AccountBalanceTrendRow[];
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

/** Single-series line/area chart of total open-account balance (base currency only) at each month end. */
export function AccountBalanceTrendChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: AccountBalanceTrendChartProps) {
  const isEmpty = data.every((row) => row.totalMinorUnits === 0);

  const accessibleSummary = `Total account balance by month, ${dateRangeLabel}: ${data
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — ${money(row.totalMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Account balance trend"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No open accounts in your base currency yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={[...data]}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="account-balance-fill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-chart-2)"
                stopOpacity={0.25}
              />
              <stop
                offset="100%"
                stopColor="var(--color-chart-2)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="totalMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            fill="url(#account-balance-fill)"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
