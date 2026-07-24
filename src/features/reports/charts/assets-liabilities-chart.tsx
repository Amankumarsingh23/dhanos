"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

export type AssetOrLiabilityRow = {
  label: string;
  /** Positive for an asset row, negative for a liability row — signed so the chart can render assets extending right and liabilities extending left of a zero reference line, the same negative-value handling PrincipalVsGrowthChart uses for a loss month. */
  signedAmountMinorUnits: number;
  kind: "asset" | "liability";
};

type AssetsLiabilitiesChartProps = {
  rows: readonly AssetOrLiabilityRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

function ChartTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: AssetOrLiabilityRow }[];
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.label}</p>
      <p>{money(Math.abs(row.signedAmountMinorUnits), currencyCode)}</p>
      <p className="text-muted-foreground capitalize">{row.kind}</p>
    </div>
  );
}

/** Assets (extending right of zero) and liabilities (extending left), one bar per group — never netted into a single figure, so each side's own composition stays visible. */
export function AssetsLiabilitiesChart({
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: AssetsLiabilitiesChartProps) {
  const isEmpty = rows.every((row) => row.signedAmountMinorUnits === 0);
  const chartHeight = Math.max(220, rows.length * 36 + 40);

  const accessibleSummary = `Assets and liabilities, ${dateRangeLabel}: ${rows
    .map(
      (row) =>
        `${row.label} (${row.kind}) — ${money(Math.abs(row.signedAmountMinorUnits), currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Assets and liabilities"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No assets or liabilities recorded yet."
      height={chartHeight}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...rows]}
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
              formatCompactMoney(Math.abs(value), currencyCode)
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
            width={120}
            className="fill-muted-foreground text-xs"
          />
          <ReferenceLine x={0} className="stroke-border" />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="signedAmountMinorUnits"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.kind === "asset"
                    ? "var(--color-chart-2)"
                    : "var(--color-chart-4)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
