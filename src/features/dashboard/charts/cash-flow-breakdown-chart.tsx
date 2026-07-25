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

type CashFlowBreakdownChartProps = {
  incomeMinorUnits: number;
  expenseMinorUnits: number;
  investmentMinorUnits: number;
  debtPaymentMinorUnits: number;
  freeCashFlowMinorUnits: number;
  currencyCode: string;
  dateRangeLabel: string;
  dataCutoffLabel: string;
};

type ChartRow = { step: string; amountMinorUnits: number; isTotal: boolean };

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
      <p className="mb-1 font-medium">{row.step}</p>
      <p>{money(row.amountMinorUnits, currencyCode)}</p>
    </div>
  );
}

/**
 * A "how did income turn into free cash flow" breakdown for one period —
 * this dashboard's equivalent of a cash-flow waterfall. Rendered as five
 * independent magnitude bars in flow order (Income → Expenses →
 * Investments → Debt payments → Free cash flow) rather than a floating
 * waterfall, deliberately: each bar's true zero-based length stays legible
 * at a glance and free cash flow's sign (surplus vs. shortfall) reads
 * directly off its own bar, without needing to track a running baseline
 * across segments.
 */
export function CashFlowBreakdownChart({
  incomeMinorUnits,
  expenseMinorUnits,
  investmentMinorUnits,
  debtPaymentMinorUnits,
  freeCashFlowMinorUnits,
  currencyCode,
  dateRangeLabel,
  dataCutoffLabel,
}: CashFlowBreakdownChartProps) {
  const data: ChartRow[] = [
    { step: "Income", amountMinorUnits: incomeMinorUnits, isTotal: true },
    { step: "Expenses", amountMinorUnits: expenseMinorUnits, isTotal: false },
    {
      step: "Investments",
      amountMinorUnits: investmentMinorUnits,
      isTotal: false,
    },
    {
      step: "Debt payments",
      amountMinorUnits: debtPaymentMinorUnits,
      isTotal: false,
    },
    {
      step: "Free cash flow",
      amountMinorUnits: freeCashFlowMinorUnits,
      isTotal: true,
    },
  ];

  const isEmpty = data.every((row) => row.amountMinorUnits === 0);

  const accessibleSummary = `Cash flow breakdown, ${dateRangeLabel}: ${data
    .map((row) => `${row.step} — ${money(row.amountMinorUnits, currencyCode)}`)
    .join("; ")}. Free cash flow is income minus expenses minus debt payments.`;

  return (
    <ChartCard
      title="Cash flow breakdown"
      dateRangeLabel={dateRangeLabel}
      dataCutoffLabel={dataCutoffLabel}
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No cleared cash-flow transactions in this period yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          desc={accessibleSummary}
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-border"
          />
          <XAxis
            dataKey="step"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
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
          <Bar
            isAnimationActive={false}
            dataKey="amountMinorUnits"
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
          >
            {data.map((row) => (
              <Cell
                key={row.step}
                fill={
                  row.amountMinorUnits < 0
                    ? "var(--color-destructive)"
                    : row.isTotal
                      ? "var(--color-chart-2)"
                      : "var(--color-chart-3)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
