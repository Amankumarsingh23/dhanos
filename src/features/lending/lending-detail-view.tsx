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
  LENDING_INSTALLMENT_FREQUENCY_LABELS,
  LENDING_INTEREST_TYPE_LABELS,
  LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS,
  LENDING_RISK_LEVEL_LABELS,
  LENDING_STATUS_LABELS,
  manualLendingStatusSchema,
  type LendingInstallmentFrequency,
  type LendingInterestType,
  type LendingRepaymentScheduleType,
  type LendingRiskLevel,
  type LendingStatus,
  type ManualLendingStatus,
} from "@/lib/validation/lending";
import { setLendingStatusAction } from "./actions";
import { LendingDialog, type SelectOption } from "./lending-dialog";
import { RecordRepaymentDialog } from "./record-repayment-dialog";
import { ReverseRepaymentDialog } from "./reverse-repayment-dialog";
import { RecoveryHistoryChart } from "./charts/recovery-history-chart";
import type { LendingDetail, LendingRepaymentRecord } from "./queries";

type LendingDetailViewProps = {
  householdId: string;
  lending: LendingDetail;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const CURRENTLY_OWED_STATUSES: LendingStatus[] = [
  "active",
  "partially_repaid",
  "delayed",
  "disputed",
];

function statusBadgeVariant(
  status: LendingStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "repaid") return "secondary";
  if (status === "disputed" || status === "written_off") return "destructive";
  return "outline";
}

export function LendingDetailView({
  householdId,
  lending,
  people,
  institutions,
  accounts,
}: LendingDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [reverseTarget, setReverseTarget] =
    useState<LendingRepaymentRecord | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: lending.currency_code });

  const canRecordRepayment = CURRENTLY_OWED_STATUSES.includes(
    lending.status as LendingStatus,
  );

  function handleStatusChange(status: ManualLendingStatus) {
    startStatusTransition(async () => {
      const result = await setLendingStatusAction(householdId, {
        lendingId: lending.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${LENDING_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {lending.name}
              <Badge
                variant={statusBadgeVariant(lending.status as LendingStatus)}
              >
                {LENDING_STATUS_LABELS[lending.status as LendingStatus]}
              </Badge>
              <Badge variant="outline">
                {
                  LENDING_RISK_LEVEL_LABELS[
                    lending.risk_level as LendingRiskLevel
                  ]
                }{" "}
                risk
              </Badge>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Lent to {lending.borrowerName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {canRecordRepayment && (
              <Button onClick={() => setRepaymentOpen(true)}>
                Record repayment
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isStatusPending}>
                  Change status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {manualLendingStatusSchema.options.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={status === lending.status}
                    onClick={() => handleStatusChange(status)}
                  >
                    Mark {LENDING_STATUS_LABELS[status].toLowerCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Amount lent"
              value={money(lending.amount_lent_minor_units)}
            />
            <Field
              label="Outstanding"
              value={money(lending.outstandingMinorUnits)}
            />
            <Field
              label="Principal recovered"
              value={money(lending.totalPrincipalRecoveredMinorUnits)}
            />
            <Field
              label="Interest received"
              value={
                lending.totalInterestReceivedMinorUnits > 0
                  ? money(lending.totalInterestReceivedMinorUnits)
                  : "—"
              }
            />
            <Field
              label="Excess repaid"
              value={
                lending.totalExcessMinorUnits > 0
                  ? money(lending.totalExcessMinorUnits)
                  : "—"
              }
            />
            <Field label="Source account" value={lending.sourceAccountName} />
            <Field
              label="Disbursed date"
              value={formatDisplayDate(lending.disbursed_date)}
            />
            <Field
              label="Expected repayment date"
              value={
                lending.expected_repayment_date
                  ? formatDisplayDate(lending.expected_repayment_date)
                  : "—"
              }
            />
            <Field
              label="Repayment schedule"
              value={
                LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS[
                  lending.repayment_schedule_type as LendingRepaymentScheduleType
                ]
              }
            />
            {lending.installment_amount_minor_units !== null && (
              <Field
                label="Installment"
                value={`${money(lending.installment_amount_minor_units)} ${
                  lending.installment_frequency
                    ? LENDING_INSTALLMENT_FREQUENCY_LABELS[
                        lending.installment_frequency as LendingInstallmentFrequency
                      ].toLowerCase()
                    : ""
                }`}
              />
            )}
            <Field
              label="Interest terms"
              value={
                lending.charges_interest
                  ? `${((lending.annual_interest_rate ?? 0) * 100).toFixed(2)}% (${
                      lending.interest_type
                        ? LENDING_INTEREST_TYPE_LABELS[
                            lending.interest_type as LendingInterestType
                          ]
                        : "—"
                    })`
                  : "Interest-free"
              }
            />
            <Field label="Purpose" value={lending.purpose ?? "—"} />
          </dl>
          {lending.notes && (
            <p className="text-muted-foreground mt-4 text-sm">
              {lending.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <RecoveryHistoryChart
        data={lending.recoveryHistory}
        currencyCode={lending.currency_code}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Repayment history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lending.allRepayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No repayments recorded yet.
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border">
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
                  {lending.allRepayments.map((repayment) => {
                    const isReversal = Boolean(repayment.reverses_repayment_id);
                    const isReversed = lending.allRepayments.some(
                      (r) => r.reverses_repayment_id === repayment.id,
                    );
                    return (
                      <tr
                        key={repayment.id}
                        className={isReversal ? "opacity-70" : undefined}
                      >
                        <td className="px-4 py-2.5">
                          {formatDisplayDate(repayment.repayment_date)}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(repayment.principal_component_minor_units)}
                          {repayment.excess_amount_minor_units > 0 && (
                            <span className="text-muted-foreground block text-xs">
                              incl. {money(repayment.excess_amount_minor_units)}{" "}
                              excess
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {money(repayment.interest_component_minor_units)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {money(repayment.total_repayment_minor_units)}
                        </td>
                        <td className="px-4 py-2.5">
                          {isReversal ? (
                            <Badge variant="outline">
                              Reversal — {repayment.reversal_reason}
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
                              onClick={() => setReverseTarget(repayment)}
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

      <LendingDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        lending={lending}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <RecordRepaymentDialog
        householdId={householdId}
        open={repaymentOpen}
        onOpenChange={setRepaymentOpen}
        lending={lending}
        onSaved={() => router.refresh()}
      />
      {reverseTarget && (
        <ReverseRepaymentDialog
          householdId={householdId}
          open={Boolean(reverseTarget)}
          onOpenChange={(open) => !open && setReverseTarget(null)}
          repayment={reverseTarget}
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
