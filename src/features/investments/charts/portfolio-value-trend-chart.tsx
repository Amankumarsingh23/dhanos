"use client";

import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DotProps } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { PortfolioValuePoint } from "@/features/investments/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type PortfolioValueTrendChartProps = {
  data: readonly PortfolioValuePoint[];
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
  payload?: { payload: PortfolioValuePoint }[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>{money(point.currentValueMinorUnits, currencyCode)}</p>
      {!point.hasCompleteValuations && (
        <p className="text-muted-foreground mt-1">
          Incomplete — at least one holding had no valuation yet as of this
          month.
        </p>
      )}
    </div>
  );
}

/** Custom dot renderer — an incomplete month (missing a valuation for at least one holding) gets a hollow/outlined marker instead of a filled one, so incompleteness is visible directly on the line, not just in the tooltip. */
function IncompleteAwareDot(
  props: DotProps & { payload?: PortfolioValuePoint },
) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const incomplete = payload && !payload.hasCompleteValuations;
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={3}
      fill={incomplete ? "var(--color-background)" : "var(--color-chart-2)"}
      stroke="var(--color-chart-2)"
      strokeWidth={incomplete ? 1.5 : 0}
    />
  );
}

/** Portfolio value over time — base-currency holdings only. Months with an incomplete valuation set (at least one holding never valued yet as of that cutoff) render with a hollow marker, never silently treated as fully known. */
export function PortfolioValueTrendChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: PortfolioValueTrendChartProps) {
  const isEmpty = data.every((point) => point.currentValueMinorUnits === 0);

  const accessibleSummary = `Portfolio value by month, ${dateRangeLabel}: ${data
    .map(
      (point) =>
        `${formatMonthLabel(point.monthKey)} — ${money(point.currentValueMinorUnits, currencyCode)}${point.hasCompleteValuations ? "" : " (incomplete: at least one holding not yet valued)"}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Portfolio value over time"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No valuations recorded yet for your base-currency holdings."
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
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="currentValueMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={<IncompleteAwareDot />}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
