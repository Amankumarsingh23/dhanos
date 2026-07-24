"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SummaryCard } from "@/components/shared/summary-card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  INCOME_FREQUENCY_LABELS,
  INCOME_SOURCE_TYPE_LABELS,
  type IncomeFrequency,
  type IncomeSourceType,
} from "@/lib/validation/income-sources";
import {
  archiveIncomeSourceAction,
  restoreIncomeSourceAction,
} from "./actions";
import { IncomeSourceDialog, type SelectOption } from "./income-source-dialog";
import { RecordIncomeDialog } from "./record-income-dialog";
import type { IncomeSourceDetail } from "./queries";

type IncomeDetailViewProps = {
  householdId: string;
  source: IncomeSourceDetail;
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  categories: SelectOption[];
};

export function IncomeDetailView({
  householdId,
  source,
  institutions,
  people,
  accounts,
  categories,
}: IncomeDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  async function handleArchiveConfirm() {
    const action = source.is_active
      ? archiveIncomeSourceAction
      : restoreIncomeSourceAction;
    const result = await action(householdId, source.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(source.is_active ? "Source archived" : "Source restored");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {
                INCOME_SOURCE_TYPE_LABELS[
                  source.source_type as IncomeSourceType
                ]
              }
            </Badge>
            <Badge variant="outline">
              {INCOME_FREQUENCY_LABELS[source.frequency as IncomeFrequency]}
            </Badge>
            <Badge variant={source.is_active ? "secondary" : "outline"}>
              {source.is_active ? "Active" : "Inactive"}
            </Badge>
            {source.isMissed && (
              <Badge variant="destructive">
                <AlertTriangleIcon />
                Missed
              </Badge>
            )}
            {source.tax_withholding_expected && (
              <Badge variant="outline">Tax withholding expected</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {[source.institutionName, source.personName, source.accountName]
              .filter(Boolean)
              .join(" · ") || "No institution, person, or account set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setRecordOpen(true)}>Record income</Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button
            variant={source.is_active ? "destructive" : "default"}
            onClick={() => setArchiveConfirmOpen(true)}
          >
            {source.is_active ? "Archive" : "Restore"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Expected amount"
          amount={
            source.expected_amount_minor_units !== null
              ? formatMoney({
                  amountMinorUnits: source.expected_amount_minor_units,
                  currencyCode: source.currency_code,
                })
              : "—"
          }
          caption={
            source.expected_payment_date_rule ??
            (source.expected_day_of_month
              ? `Around day ${source.expected_day_of_month} of the month`
              : undefined)
          }
        />
        <SummaryCard
          title="Last received"
          amount={
            source.lastReceivedDate
              ? formatDisplayDate(source.lastReceivedDate)
              : "Never"
          }
          caption={
            source.mostRecentDueDate
              ? `Most recently due ${formatDisplayDate(source.mostRecentDueDate)}`
              : undefined
          }
        />
        <SummaryCard
          title="Next expected"
          amount={
            source.nextExpectedDate
              ? formatDisplayDate(source.nextExpectedDate)
              : "—"
          }
          caption={
            source.frequency === "irregular"
              ? "Irregular — no fixed schedule"
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent receipts</CardTitle>
        </CardHeader>
        <CardContent>
          {source.recentReceipts.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              title="No income recorded yet"
              description="Use “Record income” to log an actual receipt against this source."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {source.recentReceipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td className="py-2 pr-4">
                        {formatDisplayDate(receipt.transaction_date)}
                      </td>
                      <td className="py-2 pr-4">
                        <SensitiveAmount
                          value={formatMoney({
                            amountMinorUnits: receipt.amount_minor_units,
                            currencyCode: receipt.currency_code,
                          })}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            receipt.status === "cancelled"
                              ? "outline"
                              : "secondary"
                          }
                        >
                          {receipt.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {receipt.description ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {source.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {source.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <IncomeSourceDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        source={source}
        institutions={institutions}
        people={people}
        accounts={accounts}
        categories={categories}
        onSaved={() => router.refresh()}
      />
      <RecordIncomeDialog
        householdId={householdId}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        source={source}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        onOpenChange={setArchiveConfirmOpen}
        title={
          source.is_active ? "Archive this source?" : "Restore this source?"
        }
        description={
          source.is_active
            ? `${source.name} will be hidden from active lists, but its receipt history is preserved.`
            : `${source.name} will show up in active lists again.`
        }
        confirmLabel={source.is_active ? "Archive" : "Restore"}
        destructive={source.is_active}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
