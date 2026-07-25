"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { GainLossByHoldingRow } from "@/features/investments/queries";
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

type GainLossByHoldingChartProps = {
  rows: readonly GainLossByHoldingRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type ChartRow = { label: string; totalGainLossMinorUnits: number };

function ChartTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.label}</p>
      <p>{money(row.totalGainLossMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * Realized + unrealized gain/loss per holding (base currency only) —
 * "gain/loss by holding" view. A holding with no valuation yet
 * contributes only its realized gain/loss (unrealizedGainLossMinorUnits
 * is null) rather than being silently treated as flat/zero.
 */
export function GainLossByHoldingChart({
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: GainLossByHoldingChartProps) {
  const chartData: ChartRow[] = rows.map((row) => ({
    label: row.holdingLabel,
    totalGainLossMinorUnits:
      row.realizedGainLossMinorUnits + (row.unrealizedGainLossMinorUnits ?? 0),
  }));

  const isEmpty = chartData.length === 0;
  const chartHeight = Math.max(220, chartData.length * 36 + 40);

  const accessibleSummary = `Gain or loss by holding, ${dateRangeLabel}: ${chartData
    .map(
      (row) =>
        `${row.label} — ${money(row.totalGainLossMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Gain/loss by holding"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No holdings with recorded activity yet."
      height={chartHeight}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-border"
          />
          <XAxis
            type="number"
            tickFormatter={(value: number) =>
              formatCompactMoney(value, currencyCode)
            }
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs"
          />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={140}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            isAnimationActive={false}
            dataKey="totalGainLossMinorUnits"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          >
            {chartData.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.totalGainLossMinorUnits < 0
                    ? "var(--color-destructive)"
                    : "var(--color-chart-2)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
