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

export type AmortizationPoint = {
  label: string;
  principalMinorUnits: number;
  interestMinorUnits: number;
};

type AmortizationChartProps = {
  title: string;
  data: readonly AmortizationPoint[];
  currencyCode: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: AmortizationPoint }[];
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
      <p>Interest: {money(row.interestMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * Reused by the EMI and loan-prepayment calculators — principal and
 * interest components of each payment, distinguishable per
 * docs/money-calculation-rules.md §2, aggregated to one bar per year so a
 * multi-decade tenure stays readable.
 */
export function AmortizationChart({
  title,
  data,
  currencyCode,
}: AmortizationChartProps) {
  const isEmpty = data.length === 0;

  const accessibleSummary = `${title}: ${data
    .map(
      (row) =>
        `${row.label} — principal ${money(row.principalMinorUnits, currencyCode)}, interest ${money(row.interestMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title={title}
      dateRangeLabel="Full amortization schedule"
      dataCutoffLabel="Assumption-based — not a guarantee"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Enter the calculator's inputs above to see an amortization schedule."
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
              value === "principalMinorUnits" ? "Principal" : "Interest"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="principalMinorUnits"
            name="principalMinorUnits"
            stackId="value"
            fill="var(--color-chart-2)"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="interestMinorUnits"
            name="interestMinorUnits"
            stackId="value"
            fill="var(--color-chart-3)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
