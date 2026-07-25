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

export type GoalReadinessRow = {
  status: "funded" | "on_track" | "needs_contribution" | "overdue";
  statusLabel: string;
  goalCount: number;
};

type GoalReadinessChartProps = {
  rows: readonly GoalReadinessRow[];
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

const STATUS_COLOR: Record<GoalReadinessRow["status"], string> = {
  funded: "var(--color-chart-2)",
  on_track: "var(--color-chart-1)",
  needs_contribution: "var(--color-chart-5)",
  overdue: "var(--color-chart-4)",
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: GoalReadinessRow }[];
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
      <p className="mb-1 font-medium">{row.statusLabel}</p>
      <p>
        {row.goalCount} goal{row.goalCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Active goals bucketed by computeGoalOnTrackStatus (src/lib/calculations/goals.ts) — a computed status, never a stored one, so this always agrees with what each goal's own detail page shows. */
export function GoalReadinessChart({
  rows,
  dateRangeLabel,
  dataCutoffLabel,
}: GoalReadinessChartProps) {
  const isEmpty = rows.every((row) => row.goalCount === 0);

  const accessibleSummary = `Goal readiness, ${dateRangeLabel}: ${rows
    .map((row) => `${row.statusLabel} — ${row.goalCount}`)
    .join("; ")}.`;

  return (
    <ChartCard
      title="Goal readiness"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No active goals yet."
      height={220}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
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
            dataKey="statusLabel"
            tickLine={false}
            axisLine={false}
            width={130}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            dataKey="goalCount"
            radius={[0, 4, 4, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell key={row.status} fill={STATUS_COLOR[row.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
