"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  LOAN_INTEREST_TYPE_LABELS,
  LOAN_STATUS_LABELS,
  LOAN_TYPE_LABELS,
  type LoanInterestType,
  type LoanStatus,
  type LoanType,
} from "@/lib/validation/loans";
import { DisburseDialog } from "./disburse-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ReversePaymentDialog } from "./reverse-payment-dialog";
import { LoanDialog, type SelectOption } from "./loan-dialog";
import { OutstandingBalanceChart } from "./charts/outstanding-balance-chart";
import { PaymentBreakdownChart } from "./charts/payment-breakdown-chart";
import type { LoanDetail, LoanPaymentRecord } from "./queries";

type LoanDetailViewProps = {
  householdId: string;
  loan: LoanDetail;
  effectivePayments: LoanPaymentRecord[];
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

function statusBadgeVariant(
  status: LoanStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "active") return "secondary";
  if (status === "defaulted") return "destructive";
  return "outline";
}

export function LoanDetailView({
  householdId,
  loan,
  effectivePayments,
  institutions,
  people,
  accounts,
}: LoanDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<LoanPaymentRecord | null>(
    null,
  );

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: loan.currency_code });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {loan.name}
              <Badge variant={statusBadgeVariant(loan.status as LoanStatus)}>
                {LOAN_STATUS_LABELS[loan.status as LoanStatus]}
              </Badge>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {LOAN_TYPE_LABELS[loan.loan_type as LoanType]} · {loan.lenderName}{" "}
              → {loan.borrowerName}
              {loan.coBorrowerName ? ` (with ${loan.coBorrowerName})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {loan.status === "pending_disbursement" && (
              <Button onClick={() => setDisburseOpen(true)}>
                Record disbursement
              </Button>
            )}
            {loan.status === "active" && (
              <Button onClick={() => setPaymentOpen(true)}>
                Record payment
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Original principal"
              value={money(loan.original_principal_minor_units)}
            />
            <Field
              label="Disbursed amount"
              value={
                loan.disbursed_amount_minor_units === null
                  ? "Not yet disbursed"
                  : money(loan.disbursed_amount_minor_units)
              }
            />
            <Field
              label="Outstanding"
              value={money(loan.outstandingMinorUnits)}
            />
            <Field
              label="Total overpaid"
              value={
                loan.totalOverpaidMinorUnits > 0
                  ? money(loan.totalOverpaidMinorUnits)
                  : "—"
              }
            />
            <Field
              label="Annual interest rate"
              value={`${(loan.annual_interest_rate * 100).toFixed(2)}% (${LOAN_INTEREST_TYPE_LABELS[loan.interest_type as LoanInterestType]})`}
            />
            <Field
              label="EMI"
              value={
                loan.emi_amount_minor_units === null
                  ? "Not set"
                  : money(loan.emi_amount_minor_units)
              }
            />
            <Field label="Payment account" value={loan.paymentAccountName} />
            <Field
              label="Start date"
              value={formatDisplayDate(loan.start_date)}
            />
            <Field
              label="Repayment start date"
              value={formatDisplayDate(loan.repayment_start_date)}
            />
            <Field
              label="Maturity date"
              value={
                loan.maturity_date ? formatDisplayDate(loan.maturity_date) : "—"
              }
            />
            <Field label="Collateral" value={loan.collateral ?? "—"} />
            {loan.loan_type === "education" && (
              <>
                <Field
                  label="Educational institution"
                  value={loan.educationalInstitutionName ?? "—"}
                />
                <Field label="Course" value={loan.course ?? "—"} />
                <Field
                  label="Moratorium"
                  value={
                    loan.moratorium
                      ? `Until ${loan.moratorium_end_date ? formatDisplayDate(loan.moratorium_end_date) : "—"}`
                      : "None"
                  }
                />
                <Field
                  label="Interest subsidy"
                  value={
                    loan.interest_subsidy
                      ? (loan.interest_subsidy_notes ?? "Yes")
                      : "None"
                  }
                />
              </>
            )}
          </dl>
          {loan.notes && (
            <p className="text-muted-foreground mt-4 text-sm">{loan.notes}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <OutstandingBalanceChart
          data={loan.balanceHistory}
          currencyCode={loan.currency_code}
        />
        <PaymentBreakdownChart
          payments={effectivePayments}
          currencyCode={loan.currency_code}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Payment history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loan.allPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Principal</th>
                    <th className="px-4 py-2.5 font-medium">Interest</th>
                    <th className="px-4 py-2.5 font-medium">Fee</th>
                    <th className="px-4 py-2.5 font-medium">Penalty</th>
                    <th className="px-4 py-2.5 font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {loan.allPayments.map((payment) => {
                    const isReversal = Boolean(payment.reverses_payment_id);
                    const isReversed = loan.allPayments.some(
                      (p) => p.reverses_payment_id === payment.id,
                    );
                    return (
                      <tr
                        key={payment.id}
                        className={isReversal ? "opacity-70" : undefined}
                      >
                        <td className="px-4 py-2.5">
                          {formatDisplayDate(payment.payment_date)}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(payment.principal_component_minor_units)}
                          {payment.overpayment_amount_minor_units > 0 && (
                            <span className="text-muted-foreground block text-xs">
                              incl.{" "}
                              {money(payment.overpayment_amount_minor_units)}{" "}
                              overpaid
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(payment.interest_component_minor_units)}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(payment.fee_component_minor_units)}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(payment.penalty_component_minor_units)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {money(payment.total_payment_minor_units)}
                        </td>
                        <td className="px-4 py-2.5">
                          {isReversal ? (
                            <Badge variant="outline">
                              Reversal — {payment.reversal_reason}
                            </Badge>
                          ) : isReversed ? (
                            <Badge variant="destructive">Reversed</Badge>
                          ) : (
                            <Badge variant="secondary">Recorded</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!isReversal && !isReversed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReverseTarget(payment)}
                            >
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LoanDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        loan={loan}
        institutions={institutions}
        people={people}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <DisburseDialog
        householdId={householdId}
        open={disburseOpen}
        onOpenChange={setDisburseOpen}
        loan={loan}
        onSaved={() => router.refresh()}
      />
      <RecordPaymentDialog
        householdId={householdId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        loan={loan}
        onSaved={() => router.refresh()}
      />
      {reverseTarget && (
        <ReversePaymentDialog
          householdId={householdId}
          open={Boolean(reverseTarget)}
          onOpenChange={(open) => !open && setReverseTarget(null)}
          payment={reverseTarget}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
