"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  DRAIN_COST_FREQUENCY_LABELS,
  DRAIN_STATUS_LABELS,
  DRAIN_TYPE_LABELS,
  DRAIN_USAGE_FREQUENCY_LABELS,
  type DrainCostFrequency,
  type DrainStatus,
  type DrainType,
  type DrainUsageFrequency,
} from "@/lib/validation/money-drains";
import { setMoneyDrainStatusAction } from "./actions";
import {
  MoneyDrainDialog,
  type AccountOption,
  type AssetOption,
  type RecurringRuleOption,
} from "./money-drain-dialog";
import type { MoneyDrainDetail } from "./queries";

type MoneyDrainDetailViewProps = {
  householdId: string;
  drain: MoneyDrainDetail;
  accounts: AccountOption[];
  assets: AssetOption[];
  recurringRules: RecurringRuleOption[];
};

function statusBadgeVariant(
  status: DrainStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "active") return "secondary";
  if (status === "cancelled") return "destructive";
  return "outline";
}

export function MoneyDrainDetailView({
  householdId,
  drain,
  accounts,
  assets,
  recurringRules,
}: MoneyDrainDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isStatusPending, startStatusTransition] = useTransition();

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: drain.currency_code });

  function handleStatusChange(status: DrainStatus) {
    startStatusTransition(async () => {
      const result = await setMoneyDrainStatusAction(householdId, {
        moneyDrainId: drain.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${DRAIN_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {drain.item}
              <Badge variant={statusBadgeVariant(drain.status as DrainStatus)}>
                {DRAIN_STATUS_LABELS[drain.status as DrainStatus]}
              </Badge>
              {drain.is_essential && <Badge variant="outline">Essential</Badge>}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {DRAIN_TYPE_LABELS[drain.drain_type as DrainType]}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              {drain.status !== "active" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("active")}
                >
                  Mark active
                </DropdownMenuItem>
              )}
              {drain.status !== "paused" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("paused")}
                >
                  Mark paused
                </DropdownMenuItem>
              )}
              {drain.status !== "cancelled" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("cancelled")}
                >
                  Mark cancelled
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Cost"
              value={`${money(drain.cost_amount_minor_units)} / ${
                DRAIN_COST_FREQUENCY_LABELS[
                  drain.cost_frequency as DrainCostFrequency
                ]
              }`}
            />
            <Field
              label="Monthly equivalent"
              value={
                drain.monthlyEquivalentMinorUnits !== null
                  ? money(drain.monthlyEquivalentMinorUnits)
                  : "Not annualizable (irregular)"
              }
            />
            <Field
              label="Annual equivalent"
              value={
                drain.annualizedCostMinorUnits !== null
                  ? money(drain.annualizedCostMinorUnits)
                  : "Not annualizable (irregular)"
              }
            />
            <Field
              label="Current value"
              value={
                drain.current_value_minor_units !== null
                  ? money(drain.current_value_minor_units)
                  : "—"
              }
            />
            <Field
              label="Usage frequency (your estimate)"
              value={
                DRAIN_USAGE_FREQUENCY_LABELS[
                  drain.usage_frequency as DrainUsageFrequency
                ]
              }
            />
            <Field
              label="Next renewal"
              value={
                drain.next_renewal_date
                  ? formatDisplayDate(drain.next_renewal_date)
                  : "—"
              }
            />
            <Field
              label="Cancellation terms"
              value={drain.cancellation_terms ?? "—"}
            />
            <Field label="Paid from" value={drain.linkedAccountName ?? "—"} />
          </dl>
          {drain.notes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p className="text-sm">{drain.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {drain.linked_recurring_rule_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Linked recurring rule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              This item stays connected to real transactions through{" "}
              <Link
                href={`/app/recurring/${drain.linked_recurring_rule_id}`}
                className="hover:underline"
              >
                {drain.linkedRecurringRuleName}
              </Link>
              . Its real current amount, resolved from the rule&rsquo;s own
              schedule:
            </p>
            <p className="mt-1 text-lg font-medium">
              {drain.linkedRecurringRuleCurrentAmountMinorUnits !== null ? (
                <SensitiveAmount
                  value={money(
                    drain.linkedRecurringRuleCurrentAmountMinorUnits,
                  )}
                />
              ) : (
                "—"
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {drain.linked_asset_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Linked asset</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              This item&rsquo;s depreciation is tracked on its own asset record
              —{" "}
              <Link
                href={`/app/assets/${drain.linked_asset_id}`}
                className="hover:underline"
              >
                {drain.linkedAssetName}
              </Link>
              .
            </p>
            <dl className="mt-2 grid gap-4 sm:grid-cols-2">
              <Field
                label="Latest tracked asset value"
                value={
                  drain.linkedAssetLatestValueMinorUnits !== null
                    ? money(drain.linkedAssetLatestValueMinorUnits)
                    : "No valuation recorded"
                }
              />
              <Field
                label="As of"
                value={
                  drain.linkedAssetLatestValuationDate
                    ? formatDisplayDate(drain.linkedAssetLatestValuationDate)
                    : "—"
                }
              />
            </dl>
          </CardContent>
        </Card>
      )}

      <MoneyDrainDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        drain={drain}
        accounts={accounts}
        assets={assets}
        recurringRules={recurringRules}
        onSaved={() => router.refresh()}
      />
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
