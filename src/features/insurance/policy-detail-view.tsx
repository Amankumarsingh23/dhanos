"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  POLICY_STATUS_LABELS,
  POLICY_TYPE_LABELS,
  PREMIUM_FREQUENCY_LABELS,
  manualPolicyStatusSchema,
  type ManualPolicyStatus,
  type PolicyStatus,
  type PolicyType,
  type PremiumFrequency,
} from "@/lib/validation/insurance";
import { setPolicyStatusAction } from "./actions";
import { PolicyDialog, type SelectOption } from "./policy-dialog";
import { RecordPremiumPaymentDialog } from "./record-premium-payment-dialog";
import { ClaimsTable } from "./claims-table";
import { WaitingPeriodsSection } from "./waiting-periods-section";
import type { InsurancePolicyDetail, WaitingPeriodRow } from "./queries";
import type { InsuranceClaimRow } from "./claims-queries";

type CategoryOption = {
  id: string;
  label: string;
  classification: string | null;
};

type PolicyDetailViewProps = {
  householdId: string;
  policy: InsurancePolicyDetail;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  categories: CategoryOption[];
  claims: InsuranceClaimRow[];
  waitingPeriods: WaitingPeriodRow[];
};

function statusBadgeVariant(
  status: PolicyStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "active") return "secondary";
  if (status === "lapsed" || status === "cancelled") return "destructive";
  return "outline";
}

export function PolicyDetailView({
  householdId,
  policy,
  people,
  institutions,
  accounts,
  categories,
  claims,
  waitingPeriods,
}: PolicyDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [isStatusPending, startStatusTransition] = useTransition();

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: policy.currency_code });

  const canRenew = policy.status === "active" || policy.status === "expired";

  function handleStatusChange(status: ManualPolicyStatus) {
    startStatusTransition(async () => {
      const result = await setPolicyStatusAction(householdId, {
        policyId: policy.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${POLICY_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          This is a tracking summary for your own records — not a legal
          interpretation of the actual policy document. Refer to the official
          policy and your insurer for exact terms, exclusions, and claim
          conditions.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {policy.name}
              <Badge
                variant={statusBadgeVariant(policy.status as PolicyStatus)}
              >
                {POLICY_STATUS_LABELS[policy.status as PolicyStatus]}
              </Badge>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {POLICY_TYPE_LABELS[policy.policy_type as PolicyType]} ·{" "}
              {policy.insurerName} · Policyholder {policy.policyholderName}
            </p>
            {(policy.previousPolicyName || policy.renewedIntoPolicyId) && (
              <p className="text-muted-foreground mt-1 text-xs">
                {policy.previousPolicyName && (
                  <>Renewed from &ldquo;{policy.previousPolicyName}&rdquo;. </>
                )}
                {policy.renewedIntoPolicyId && (
                  <>
                    A newer period exists —{" "}
                    <Link
                      href={`/app/insurance/${policy.renewedIntoPolicyId}`}
                      className="underline"
                    >
                      view it
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {canRenew && (
              <Button variant="outline" onClick={() => setRenewOpen(true)}>
                Renew
              </Button>
            )}
            <Button onClick={() => setPremiumOpen(true)}>Record premium</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isStatusPending}>
                  Change status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {manualPolicyStatusSchema.options.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={status === policy.status}
                    onClick={() => handleStatusChange(status)}
                  >
                    Mark {POLICY_STATUS_LABELS[status].toLowerCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Coverage amount"
              value={money(policy.coverage_amount_minor_units)}
            />
            <Field
              label="Premium"
              value={`${money(policy.premium_amount_minor_units)} (${
                PREMIUM_FREQUENCY_LABELS[
                  policy.premium_frequency as PremiumFrequency
                ]
              })`}
            />
            <Field
              label="Insured people"
              value={
                policy.insuredPeople.map((p) => p.displayName).join(", ") || "—"
              }
            />
            <Field label="Nominee" value={policy.nomineeName ?? "—"} />
            <Field
              label="Policy number"
              value={policy.masked_policy_number ?? "—"}
            />
            <Field
              label="Start date"
              value={formatDisplayDate(policy.start_date)}
            />
            <Field
              label="Renewal date"
              value={
                policy.renewal_date
                  ? formatDisplayDate(policy.renewal_date)
                  : "—"
              }
            />
            <Field
              label="Expiry date"
              value={
                policy.expiry_date ? formatDisplayDate(policy.expiry_date) : "—"
              }
            />
            <Field label="Payment account" value={policy.paymentAccountName} />
            <Field label="Agent" value={policy.agent_name ?? "—"} />
            <Field
              label="Support contact"
              value={policy.support_contact ?? "—"}
            />
            <Field label="Claim contact" value={policy.claim_contact ?? "—"} />
          </dl>
          {policy.notes && (
            <p className="text-muted-foreground mt-4 text-sm">{policy.notes}</p>
          )}
        </CardContent>
      </Card>

      {policy.policy_type === "health" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Health policy details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Field
                label="Deductible"
                value={
                  policy.deductible_minor_units !== null
                    ? money(policy.deductible_minor_units)
                    : "—"
                }
              />
              <Field
                label="Co-pay"
                value={
                  policy.co_pay_percentage !== null
                    ? `${(policy.co_pay_percentage * 100).toFixed(1)}%`
                    : "—"
                }
              />
              <Field
                label="Room rent restriction"
                value={policy.room_rent_restriction ?? "—"}
              />
              <Field
                label="Pre-existing conditions declared"
                value={policy.pre_existing_conditions_declared ?? "—"}
              />
              <Field
                label="Waiting periods"
                value={policy.waiting_periods ?? "—"}
              />
              <Field
                label="Network-hospital notes"
                value={policy.network_hospital_notes ?? "—"}
              />
              <Field
                label="Cashless availability"
                value={boolLabel(policy.cashless_availability)}
              />
              <Field
                label="Restoration benefit"
                value={boolLabel(policy.restoration_benefit)}
              />
              <Field
                label="No-claim bonus"
                value={policy.no_claim_bonus ?? "—"}
              />
              <Field label="OPD cover" value={boolLabel(policy.opd_cover)} />
              <Field
                label="Consumables cover"
                value={boolLabel(policy.consumables_cover)}
              />
              <Field
                label="Day-care treatment"
                value={boolLabel(policy.day_care_treatment)}
              />
              <Field
                label="Pre-hospitalization"
                value={
                  policy.pre_hospitalization_days !== null
                    ? `${policy.pre_hospitalization_days} days`
                    : "—"
                }
              />
              <Field
                label="Post-hospitalization"
                value={
                  policy.post_hospitalization_days !== null
                    ? `${policy.post_hospitalization_days} days`
                    : "—"
                }
              />
            </dl>
            {policy.exclusions_summary && (
              <div className="mt-4">
                <p className="text-muted-foreground text-xs">
                  Exclusions summary
                </p>
                <p className="text-sm">{policy.exclusions_summary}</p>
              </div>
            )}
            <div className="mt-4">
              <WaitingPeriodsSection
                householdId={householdId}
                policyId={policy.id}
                policyStartDate={policy.start_date}
                waitingPeriods={waitingPeriods}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Claims</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimsTable
            householdId={householdId}
            policyId={policy.id}
            claims={claims}
            insuredPeople={policy.insuredPeople.map((p) => ({
              id: p.id,
              label: p.displayName,
            }))}
            accounts={accounts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Premium payment history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {policy.premiumPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No premium payments recorded yet.
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {policy.premiumPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-4 py-2.5">
                        {formatDisplayDate(payment.transaction_date)}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {formatMoney({
                          amountMinorUnits: payment.amount_minor_units,
                          currencyCode: payment.currency_code,
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{payment.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {payment.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PolicyDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        policy={policy}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      {renewOpen && (
        <PolicyDialog
          householdId={householdId}
          open={renewOpen}
          onOpenChange={setRenewOpen}
          renewFrom={policy}
          people={people}
          institutions={institutions}
          accounts={accounts}
          onSaved={() => router.refresh()}
        />
      )}
      <RecordPremiumPaymentDialog
        householdId={householdId}
        open={premiumOpen}
        onOpenChange={setPremiumOpen}
        policy={policy}
        categories={categories}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function boolLabel(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Yes" : "No";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
