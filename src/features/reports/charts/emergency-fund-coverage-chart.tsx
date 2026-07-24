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
import {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

type EmergencyFundCoverageChartProps = {
  liquidEmergencyMoneyMinorUnits: number;
  targetAmountMinorUnits: number;
  monthsOfCoverage: number | null;
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type ChartRow = { label: string; amountMinorUnits: number; isTarget: boolean };

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
      <p className="mb-1 font-medium">{row.label}</p>
      <p>{money(row.amountMinorUnits, currencyCode)}</p>
    </div>
  );
}

/** Liquid emergency money versus the household's own coverage target — a plain two-bar comparison, never a percentage-only gauge that would hide the actual amounts behind it. */
export function EmergencyFundCoverageChart({
  liquidEmergencyMoneyMinorUnits,
  targetAmountMinorUnits,
  monthsOfCoverage,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: EmergencyFundCoverageChartProps) {
  const chartData: ChartRow[] = [
    {
      label: "Liquid emergency money",
      amountMinorUnits: liquidEmergencyMoneyMinorUnits,
      isTarget: false,
    },
    {
      label: "Target",
      amountMinorUnits: targetAmountMinorUnits,
      isTarget: true,
    },
  ];

  const isEmpty = liquidEmergencyMoneyMinorUnits === 0 && targetAmountMinorUnits === 0;

  const coverageText =
    monthsOfCoverage === null
      ? "no monthly burn rate to divide by"
      : `${monthsOfCoverage.toFixed(1)} months of coverage`;
  const accessibleSummary = `Emergency-fund coverage, ${dateRangeLabel}: liquid emergency money ${money(liquidEmergencyMoneyMinorUnits, currencyCode)} against a target of ${money(targetAmountMinorUnits, currencyCode)} — ${coverageText}.`;

  return (
    <ChartCard
      title="Emergency-fund coverage"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="Set up an emergency-fund plan to see coverage here."
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
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={140}
            className="fill-muted-foreground text-xs"
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
          <Bar
            dataKey="amountMinorUnits"
            radius={[0, 4, 4, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          >
            {chartData.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.isTarget
                    ? "var(--color-chart-5)"
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
