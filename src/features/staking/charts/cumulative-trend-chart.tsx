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

type CumulativeTrendChartProps = {
  title: string;
  data: readonly DailyValuePoint[];
  dataKey:
    | "cumulativeContributedMinorUnits"
    | "cumulativeRewardsMinorUnits"
    | "cumulativeWithdrawalsMinorUnits";
  color: string;
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
  emptyDescription: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
  title,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  currencyCode: string;
  title: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>
        {title}: {money(payload[0]?.value ?? 0, currencyCode)}
      </p>
    </div>
  );
}

/**
 * Shared cumulative-sum daily chart — used for "total contributed",
 * "accumulated rewards", and "withdrawals" (PROMPT 19), which are
 * identical in shape (a running total over the same daily series),
 * differing only in which field and color. One component reused three
 * times rather than duplicated.
 */
export function CumulativeTrendChart({
  title,
  data,
  dataKey,
  color,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
  emptyDescription,
}: CumulativeTrendChartProps) {
  const isEmpty = data.every((point) => point[dataKey] === 0);
  const latest = data[data.length - 1]?.[dataKey] ?? 0;

  const accessibleSummary = `${title} by day, ${dateRangeLabel}. Latest cumulative total: ${money(latest, currencyCode)}.`;

  return (
    <ChartCard
      title={title}
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription={emptyDescription}
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
          <Tooltip
            content={<ChartTooltip currencyCode={currencyCode} title={title} />}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
