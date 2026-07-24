import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatPercentage } from "@/lib/money";
import {
  LOAN_STATUS_LABELS,
  LOAN_TYPE_LABELS,
  type LoanStatus,
  type LoanType,
} from "@/lib/validation/loans";
import { OutstandingCurveChart } from "./charts/outstanding-curve-chart";
import { PrincipalVsInterestChart } from "./charts/principal-vs-interest-chart";
import { DebtReductionChart } from "./charts/debt-reduction-chart";
import { DebtGroupChart } from "./charts/debt-group-chart";
import { EmiCalendar } from "./emi-calendar";
import {
  PrepaymentSimulator,
  type SimulatablLoan,
} from "./prepayment-simulator";
import { SummaryFigure } from "./summary-figure";
import type { DebtDashboardData } from "./debt-dashboard-queries";

type DebtDashboardProps = {
  data: DebtDashboardData;
};

/**
 * PROMPT 22's debt reporting dashboard — metrics, five charts, an EMI
 * calendar, and a prepayment simulator, all built on real payment history
 * (src/features/loans/debt-dashboard-queries.ts). A Server Component: the
 * only client-side piece is the prepayment simulator, which recomputes
 * live from data already fetched here.
 */
export function DebtDashboard({ data }: DebtDashboardProps) {
  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: data.currencyCode });

  const activeLoans = data.loans.filter(
    (loan) =>
      loan.currency_code === data.currencyCode && loan.status === "active",
  );

  const trackableOverdue = activeLoans.filter((loan) => loan.overdue.trackable);
  const totalOverdueMinorUnits = trackableOverdue.reduce(
    (sum, loan) =>
      sum + (loan.overdue.trackable ? loan.overdue.overdueAmountMinorUnits : 0),
    0,
  );
  const untrackedOverdueCount = activeLoans.length - trackableOverdue.length;

  const simulatableLoans: SimulatablLoan[] = activeLoans
    .filter(
      (loan) =>
        loan.emi_amount_minor_units !== null && loan.outstandingMinorUnits > 0,
    )
    .map((loan) => ({
      id: loan.id,
      name: loan.name,
      currencyCode: loan.currency_code,
      outstandingMinorUnits: loan.outstandingMinorUnits,
      annualInterestRate: loan.annual_interest_rate,
      emiAmountMinorUnits: loan.emi_amount_minor_units as number,
    }));

  const dateRangeLabel =
    data.householdTrend.length > 0
      ? `${data.householdTrend[0]!.monthKey} – ${data.householdTrend[data.householdTrend.length - 1]!.monthKey}`
      : "No history yet";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryFigure
          label="Total outstanding debt"
          value={money(data.totals.totalOutstandingMinorUnits)}
          emphasize
        />
        <SummaryFigure
          label="Original principal (lifetime)"
          value={money(data.totals.totalOriginalPrincipalMinorUnits)}
        />
        <SummaryFigure
          label="Monthly EMI burden"
          value={money(data.totals.monthlyEmiBurdenMinorUnits)}
        />
        <SummaryFigure
          label="Interest paid (lifetime)"
          value={money(data.totals.totalInterestPaidMinorUnits)}
        />
        <SummaryFigure
          label="Principal repaid (lifetime)"
          value={money(data.totals.totalPrincipalRepaidMinorUnits)}
        />
        <SummaryFigure
          label="Overdue amount"
          value={
            trackableOverdue.length === 0
              ? "Not tracked"
              : money(totalOverdueMinorUnits)
          }
          caption={
            untrackedOverdueCount > 0
              ? `${untrackedOverdueCount} active loan${untrackedOverdueCount === 1 ? "" : "s"} without an EMI set — not included`
              : "Based on actual recorded payments"
          }
        />
        <SummaryFigure
          label="Debt-to-income ratio"
          value={
            data.debtToIncomeRatio === null
              ? "Not available"
              : formatPercentage(data.debtToIncomeRatio, {
                  maximumFractionDigits: 0,
                })
          }
          caption={
            data.debtToIncomeRatio === null
              ? "No income recorded in the trailing months"
              : `EMI burden ÷ avg. income, trailing months`
          }
        />
        <SummaryFigure
          label="Active loans"
          value={String(data.totals.activeLoanCount)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <OutstandingCurveChart
          data={data.householdTrend}
          currencyCode={data.currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <PrincipalVsInterestChart
          data={data.householdTrend}
          currencyCode={data.currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <DebtReductionChart
          data={data.householdTrend}
          currencyCode={data.currencyCode}
          dateRangeLabel={dateRangeLabel}
        />
        <DebtGroupChart
          title="Lender exposure"
          rows={data.debtByLender}
          currencyCode={data.currencyCode}
          emptyDescription="No active loans yet."
        />
        <DebtGroupChart
          title="Debt by type"
          rows={data.debtByType}
          currencyCode={data.currencyCode}
          emptyDescription="No active loans yet."
        />
      </div>

      <EmiCalendar
        entries={data.emiCalendar}
        currencyCode={data.currencyCode}
      />

      <PrepaymentSimulator loans={simulatableLoans} asOfDate={data.asOfDate} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Per-loan detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Loan</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Outstanding</th>
                  <th className="px-4 py-2.5 font-medium">Remaining tenure</th>
                  <th className="px-4 py-2.5 font-medium">Overdue</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {activeLoans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        href={`/app/debts/${loan.id}`}
                        className="hover:underline"
                      >
                        {loan.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {LOAN_TYPE_LABELS[loan.loan_type as LoanType]}
                    </td>
                    <td className="px-4 py-2.5">
                      {money(loan.outstandingMinorUnits)}
                    </td>
                    <td className="px-4 py-2.5">
                      {loan.remainingTenure.trackable
                        ? `${loan.remainingTenure.tenureMonths} months`
                        : "Not tracked"}
                    </td>
                    <td className="px-4 py-2.5">
                      {loan.overdue.trackable
                        ? money(loan.overdue.overdueAmountMinorUnits)
                        : "Not tracked"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary">
                        {LOAN_STATUS_LABELS[loan.status as LoanStatus]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button variant="outline" asChild>
              <Link href="/app/debts">Manage loans</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
