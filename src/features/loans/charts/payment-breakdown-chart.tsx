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
import type { LoanPaymentRecord } from "@/features/loans/queries";
import {
  formatCompactMoney,
  formatDayLabel,
  formatDayTick,
  money,
} from "./chart-format";

type PaymentBreakdownChartProps = {
  payments: readonly LoanPaymentRecord[];
  currencyCode: string;
};

type ChartRow = {
  date: string;
  principalMinorUnits: number;
  interestMinorUnits: number;
  feeMinorUnits: number;
  penaltyMinorUnits: number;
};

function ChartTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
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
      <p className="mb-1 font-medium">{formatDayLabel(label)}</p>
      <p>Principal: {money(row.principalMinorUnits, currencyCode)}</p>
      <p>Interest: {money(row.interestMinorUnits, currencyCode)}</p>
      {row.feeMinorUnits > 0 && (
        <p>Fee: {money(row.feeMinorUnits, currencyCode)}</p>
      )}
      {row.penaltyMinorUnits > 0 && (
        <p>Penalty: {money(row.penaltyMinorUnits, currencyCode)}</p>
      )}
    </div>
  );
}

/**
 * Every actual effective payment, split into its four components —
 * PROMPT 21: "separate principal, interest, fee, penalty, total payment"
 * and "debt charts use actual payments and balances." `payments` must
 * already be the *effective* (non-reversed) set, sorted by date — see
 * src/features/loans/queries.ts.
 */
export function PaymentBreakdownChart({
  payments,
  currencyCode,
}: PaymentBreakdownChartProps) {
  const data: ChartRow[] = payments.map((payment) => ({
    date: payment.payment_date,
    principalMinorUnits: payment.principal_component_minor_units,
    interestMinorUnits: payment.interest_component_minor_units,
    feeMinorUnits: payment.fee_component_minor_units,
    penaltyMinorUnits: payment.penalty_component_minor_units,
  }));
  const isEmpty = data.length === 0;

  const accessibleSummary = `Payment breakdown by date: ${data
    .map(
      (row) =>
        `${formatDayLabel(row.date)} — principal ${money(row.principalMinorUnits, currencyCode)}, interest ${money(row.interestMinorUnits, currencyCode)}`,
    )
    .join("; ")}.`;

  return (
    <ChartCard
      title="Payment breakdown"
      dateRangeLabel="Every recorded payment"
      dataCutoffLabel="Actual payments only"
      accessibleSummary={accessibleSummary}
      isEmpty={isEmpty}
      emptyDescription="No payments recorded yet."
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
            dataKey="date"
            tickFormatter={formatDayTick}
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
              ({
                principalMinorUnits: "Principal",
                interestMinorUnits: "Interest",
                feeMinorUnits: "Fee",
                penaltyMinorUnits: "Penalty",
              })[value as string] ?? value
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="principalMinorUnits"
            name="principalMinorUnits"
            stackId="value"
            fill="var(--color-chart-2)"
          />
          <Bar
            isAnimationActive={false}
            dataKey="interestMinorUnits"
            name="interestMinorUnits"
            stackId="value"
            fill="var(--color-chart-3)"
          />
          <Bar
            isAnimationActive={false}
            dataKey="feeMinorUnits"
            name="feeMinorUnits"
            stackId="value"
            fill="var(--color-chart-4)"
          />
          <Bar
            isAnimationActive={false}
            dataKey="penaltyMinorUnits"
            name="penaltyMinorUnits"
            stackId="value"
            fill="var(--color-chart-5)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
