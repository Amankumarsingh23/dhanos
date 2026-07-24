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

type EssentialVsDiscretionaryChartProps = {
  essentialMinorUnits: number;
  discretionaryMinorUnits: number;
  unclassifiedMinorUnits: number;
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type ChartRow = { bucket: string; amountMinorUnits: number };

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
  if (!row) {
    return null;
  }
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.bucket}</p>
      <p>{money(row.amountMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * Essential vs. discretionary vs. unclassified net expense totals for the
 * period — the same three buckets src/lib/calculations/expense-analysis.ts's
 * bucketClassification already establishes (need/obligation/protection ->
 * essential, want -> discretionary, no classification -> unclassified).
 * "Unclassified" is always shown, never folded silently into either
 * bucket — a household with uncategorized spending should see that as its
 * own visible fact, not have it guessed into essential or discretionary.
 */
export function EssentialVsDiscretionaryChart({
  essentialMinorUnits,
  discretionaryMinorUnits,
  unclassifiedMinorUnits,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: EssentialVsDiscretionaryChartProps) {
  const chartData: ChartRow[] = [
    { bucket: "Essential", amountMinorUnits: essentialMinorUnits },
    { bucket: "Discretionary", amountMinorUnits: discretionaryMinorUnits },
  ];
  if (unclassifiedMinorUnits > 0) {
    chartData.push({ bucket: "Unclassified", amountMinorUnits: unclassifiedMinorUnits });
  }

  const isEmpty =
    essentialMinorUnits === 0 &&
    discretionaryMinorUnits === 0 &&
    unclassifiedMinorUnits === 0;

  const accessibleSummary = `Essential versus discretionary spending, ${dateRangeLabel}: ${chartData
    .map((row) => `${row.bucket} — ${money(row.amountMinorUnits, currencyCode)}`)
    .join("; ")}.`;

  return (
    <ChartCard
      title="Essential vs. discretionary"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared expenses in this period yet."
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          barCategoryGap={16}
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
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            width={90}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="amountMinorUnits"
            fill="var(--color-chart-3)"
            radius={[0, 4, 4, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
