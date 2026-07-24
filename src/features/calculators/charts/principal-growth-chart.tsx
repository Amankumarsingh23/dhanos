"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export type PrincipalGrowthPoint = {
  label: string;
  principalMinorUnits: number;
  growthMinorUnits: number;
};

type PrincipalGrowthChartProps = {
  title: string;
  data: readonly PrincipalGrowthPoint[];
  currencyCode: string;
  emptyDescription?: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: PrincipalGrowthPoint }[];
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
      <p className="mb-1 font-medium">{label}</p>
      <p>Principal: {money(row.principalMinorUnits, currencyCode)}</p>
      <p>Growth: {money(row.growthMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * Reused across the SIP projection, lump sum, and daily growth
 * calculators — PROMPT 20 acceptance criterion "charts expose principal
 * and estimated growth separately." Every figure here is a projection, not
 * account data — the caption says so explicitly rather than implying a
 * real data cutoff (docs/money-calculation-rules.md §4).
 */
export function PrincipalGrowthChart({
  title,
  data,
  currencyCode,
  emptyDescription = "Enter the calculator's inputs above to see a projection.",
}: PrincipalGrowthChartProps) {
  const isEmpty = data.length === 0;

  const accessibleSummary = `${title}: ${data
    .map(
      (row) =>
        `${row.label} — principal ${money(row.principalMinorUnits, currencyCode)}, growth ${money(row.growthMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title={title}
      dateRangeLabel="Projected values"
      dataCutoffLabel="Assumption-based — not a guarantee"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription={emptyDescription}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...data]}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-border"
          />
          <XAxis
            dataKey="label"
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
          <Legend
            formatter={(value) =>
              value === "principalMinorUnits" ? "Principal" : "Growth"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="principalMinorUnits"
            name="principalMinorUnits"
            stackId="value"
            fill="var(--color-chart-2)"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="growthMinorUnits"
            name="growthMinorUnits"
            stackId="value"
            fill="var(--color-chart-4)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
