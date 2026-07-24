"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { SipConsistencyRow } from "@/lib/calculations/reports";

type SipConsistencyChartProps = {
  rows: readonly SipConsistencyRow[];
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: SipConsistencyRow }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.sipName}</p>
      <p>Expected: {row.expectedCount}</p>
      <p>Completed: {row.completedCount}</p>
      <p>
        {row.consistencyPercentage === null
          ? "Nothing due in this period"
          : `${row.consistencyPercentage}% consistent`}
      </p>
    </div>
  );
}

/**
 * Expected vs. completed contribution counts per SIP, grouped bars —
 * "distinguish actual from projected" (chart rules): expected is a
 * schedule-derived figure (src/lib/calculations/reports.ts's
 * computeSipConsistency, reusing the same schedule-stepping primitive
 * reminders.ts uses for sip_due), completed is only ever a real recorded
 * investment_transactions row — the two series are visually and
 * semantically distinct, never blended into one bar.
 */
export function SipConsistencyChart({
  rows,
  dateRangeLabel,
  dataCutoffLabel,
}: SipConsistencyChartProps) {
  const isEmpty = rows.length === 0;
  const chartHeight = Math.max(220, rows.length * 44 + 40);

  const accessibleSummary = `SIP consistency, ${dateRangeLabel}: ${rows
    .map(
      (row) =>
        `${row.sipName} — ${row.completedCount} of ${row.expectedCount} expected contributions completed${row.consistencyPercentage === null ? "" : ` (${row.consistencyPercentage}%)`}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="SIP consistency"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No active SIPs yet."
      height={chartHeight}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...rows]}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          barCategoryGap={12}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-border"
          />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs"
          />
          <YAxis
            type="category"
            dataKey="sipName"
            tickLine={false}
            axisLine={false}
            width={110}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            formatter={(value) =>
              value === "expectedCount" ? "Expected" : "Completed"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="expectedCount"
            name="expectedCount"
            fill="var(--color-chart-5)"
            radius={[0, 4, 4, 0]}
            maxBarSize={14}
            isAnimationActive={false}
          />
          <Bar
            dataKey="completedCount"
            name="completedCount"
            fill="var(--color-chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={14}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
