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
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

export type InsuranceCoverageRow = {
  policyTypeLabel: string;
  coverageAmountMinorUnits: number;
  policyCount: number;
};

type InsuranceCoverageChartProps = {
  rows: readonly InsuranceCoverageRow[];
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
  payload?: { payload: InsuranceCoverageRow }[];
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
      <p className="mb-1 font-medium">{row.policyTypeLabel}</p>
      <p>{money(row.coverageAmountMinorUnits, currencyCode)}</p>
      <p className="text-muted-foreground">
        {row.policyCount} polic{row.policyCount === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}

/** Total sum-insured coverage by policy type, active policies only — a tracking summary, never a legal interpretation of any actual policy document (same standing disclaimer PROMPT 25's InsurancePolicy entity carries). */
export function InsuranceCoverageChart({
  rows,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: InsuranceCoverageChartProps) {
  const isEmpty = rows.length === 0;
  const chartHeight = Math.max(200, rows.length * 36 + 40);

  const accessibleSummary = `Insurance coverage by policy type, ${dateRangeLabel}: ${rows
    .map(
      (row) =>
        `${row.policyTypeLabel} — ${money(row.coverageAmountMinorUnits, currencyCode)} across ${row.policyCount} polic${row.policyCount === 1 ? "y" : "ies"}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Insurance coverage by policy type"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No active insurance policies yet."
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
              formatCompactMoney(value, currencyCode)
            }
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs"
          />
          <YAxis
            type="category"
            dataKey="policyTypeLabel"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="coverageAmountMinorUnits"
            fill="var(--color-chart-2)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
