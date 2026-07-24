"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import type { CashFlowTrendRow } from "@/features/dashboard/queries";
import {
  formatCompactMoney,
  formatMonthLabel,
  formatMonthTick,
  money,
} from "@/features/dashboard/charts/chart-format";

type IncomeExpenseTrendChartProps = {
  data: readonly CashFlowTrendRow[];
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type TooltipPayloadEntry = { dataKey: string; value: number };

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const income =
    payload.find((p) => p.dataKey === "incomeMinorUnits")?.value ?? 0;
  const expense =
    payload.find((p) => p.dataKey === "expenseMinorUnits")?.value ?? 0;

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(label)}</p>
      <p>Income: {money(income, currencyCode)}</p>
      <p>Expenses: {money(expense, currencyCode)}</p>
    </div>
  );
}

/** Line chart: income vs. expense, one point per month — see getCashFlowTrend for the underlying kinds. */
export function IncomeExpenseTrendChart({
  data,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: IncomeExpenseTrendChartProps) {
  const isEmpty = data.every(
    (row) => row.incomeMinorUnits === 0 && row.expenseMinorUnits === 0,
  );

  const accessibleSummary = `Income versus expenses by month, ${dateRangeLabel}: ${data
    .map(
      (row) =>
        `${formatMonthLabel(row.monthKey)} — income ${money(row.incomeMinorUnits, currencyCode)}, expenses ${money(row.expenseMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Income vs. expenses"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared income or expense transactions in this period yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
          <Legend
            formatter={(value) =>
              value === "incomeMinorUnits" ? "Income" : "Expenses"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="incomeMinorUnits"
            name="incomeMinorUnits"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="expenseMinorUnits"
            name="expenseMinorUnits"
            stroke="var(--color-chart-4)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
