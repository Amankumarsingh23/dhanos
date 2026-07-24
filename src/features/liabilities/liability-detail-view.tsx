"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  LIABILITY_CATEGORY_LABELS,
  LIABILITY_DOCUMENTATION_STATUS_LABELS,
  LIABILITY_INSTALLMENT_FREQUENCY_LABELS,
  LIABILITY_INTEREST_TYPE_LABELS,
  LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS,
  LIABILITY_SOURCE_LABELS,
  LIABILITY_STATUS_LABELS,
  manualLiabilityStatusSchema,
  type LiabilityCategory,
  type LiabilityDocumentationStatus,
  type LiabilityInstallmentFrequency,
  type LiabilityInterestType,
  type LiabilityRepaymentScheduleType,
  type LiabilitySource,
  type LiabilityStatus,
  type ManualLiabilityStatus,
} from "@/lib/validation/liabilities";
import { setLiabilityStatusAction } from "./actions";
import { LiabilityDialog, type SelectOption } from "./liability-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ReversePaymentDialog } from "./reverse-payment-dialog";
import type { LiabilityDetail, LiabilityPaymentRecord } from "./queries";

type LiabilityDetailViewProps = {
  householdId: string;
  liability: LiabilityDetail;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const CURRENTLY_OWED_STATUSES: LiabilityStatus[] = [
  "active",
  "partially_paid",
  "disputed",
];

function statusBadgeVariant(
  status: LiabilityStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "paid") return "secondary";
  if (status === "disputed") return "destructive";
  return "outline";
}

export function LiabilityDetailView({
  householdId,
  liability,
  people,
  institutions,
  accounts,
}: LiabilityDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reverseTarget, setReverseTarget] =
    useState<LiabilityPaymentRecord | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: liability.currency_code });

  const canRecordPayment = CURRENTLY_OWED_STATUSES.includes(
    liability.status as LiabilityStatus,
  );

  function handleStatusChange(status: ManualLiabilityStatus) {
    startStatusTransition(async () => {
      const result = await setLiabilityStatusAction(householdId, {
        liabilityId: liability.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${LIABILITY_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {liability.name}
              <Badge
                variant={statusBadgeVariant(
                  liability.status as LiabilityStatus,
                )}
              >
                {LIABILITY_STATUS_LABELS[liability.status as LiabilityStatus]}
              </Badge>
              {liability.certainty === "estimated" ? (
                <Badge variant="destructive">Estimated</Badge>
              ) : (
                <Badge variant="secondary">Confirmed</Badge>
              )}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {
                LIABILITY_SOURCE_LABELS[
                  liability.liability_source as LiabilitySource
                ]
              }{" "}
              ·{" "}
              {
                LIABILITY_CATEGORY_LABELS[
                  liability.category as LiabilityCategory
                ]
              }
              {liability.counterpartyName
                ? ` · ${liability.counterpartyName}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {canRecordPayment && (
              <Button onClick={() => setPaymentOpen(true)}>
                Record payment
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isStatusPending}>
                  Change status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {manualLiabilityStatusSchema.options.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={status === liability.status}
                    onClick={() => handleStatusChange(status)}
                  >
                    Mark {LIABILITY_STATUS_LABELS[status].toLowerCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Amount" value={money(liability.amount_minor_units)} />
            <Field
              label="Outstanding"
              value={money(liability.outstandingMinorUnits)}
            />
            <Field
              label="Principal paid"
              value={money(liability.totalPrincipalPaidMinorUnits)}
            />
            <Field
              label="Interest paid"
              value={
                liability.totalInterestPaidMinorUnits > 0
                  ? money(liability.totalInterestPaidMinorUnits)
                  : "—"
              }
            />
            <Field
              label="Excess paid"
              value={
                liability.totalExcessMinorUnits > 0
                  ? money(liability.totalExcessMinorUnits)
                  : "—"
              }
            />
            <Field
              label="Start date"
              value={formatDisplayDate(liability.start_date)}
            />
            <Field
              label="Due date"
              value={
                liability.due_date ? formatDisplayDate(liability.due_date) : "—"
              }
            />
            <Field
              label="Documentation status"
              value={
                LIABILITY_DOCUMENTATION_STATUS_LABELS[
                  liability.documentation_status as LiabilityDocumentationStatus
                ]
              }
            />
            <Field
              label="Payment account"
              value={liability.paymentAccountName}
            />
            {liability.receivingAccountName && (
              <Field
                label="Received into"
                value={`${liability.receivingAccountName}${
                  liability.received_date
                    ? ` on ${formatDisplayDate(liability.received_date)}`
                    : ""
                }`}
              />
            )}
            <Field
              label="Repayment schedule"
              value={
                LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS[
                  liability.repayment_schedule_type as LiabilityRepaymentScheduleType
                ]
              }
            />
            {liability.installment_amount_minor_units !== null && (
              <Field
                label="Installment"
                value={`${money(liability.installment_amount_minor_units)} ${
                  liability.installment_frequency
                    ? LIABILITY_INSTALLMENT_FREQUENCY_LABELS[
                        liability.installment_frequency as LiabilityInstallmentFrequency
                      ].toLowerCase()
                    : ""
                }`}
              />
            )}
            <Field
              label="Interest terms"
              value={
                liability.charges_interest
                  ? `${((liability.annual_interest_rate ?? 0) * 100).toFixed(2)}% (${
                      liability.interest_type
                        ? LIABILITY_INTEREST_TYPE_LABELS[
                            liability.interest_type as LiabilityInterestType
                          ]
                        : "—"
                    })`
                  : "Interest-free"
              }
            />
          </dl>
          {liability.notes && (
            <p className="text-muted-foreground mt-4 text-sm">
              {liability.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Payment history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liability.allPayments.length === 0 ? (
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
                    <th className="px-4 py-2.5 font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {liability.allPayments.map((payment) => {
                    const isReversal = Boolean(payment.reverses_payment_id);
                    const isReversed = liability.allPayments.some(
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
                          {payment.excess_amount_minor_units > 0 && (
                            <span className="text-muted-foreground block text-xs">
                              incl. {money(payment.excess_amount_minor_units)}{" "}
                              excess
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(payment.interest_component_minor_units)}
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

      <LiabilityDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        liability={liability}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <RecordPaymentDialog
        householdId={householdId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        liability={liability}
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
