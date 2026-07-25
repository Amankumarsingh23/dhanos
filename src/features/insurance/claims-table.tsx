"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileTextIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  CLAIM_STATUS_LABELS,
  manualClaimStatusSchema,
  type ClaimStatus,
  type ManualClaimStatus,
} from "@/lib/validation/insurance";
import { deleteClaimAction, setClaimStatusAction } from "./claims-actions";
import { ClaimDialog } from "./claim-dialog";
import { RecordClaimSettlementDialog } from "./record-claim-settlement-dialog";
import type { InsuranceClaimRow } from "./claims-queries";
import type { SelectOption } from "./policy-dialog";

type AccountOption = { id: string; label: string };

type ClaimsTableProps = {
  householdId: string;
  policyId: string;
  claims: InsuranceClaimRow[];
  insuredPeople: SelectOption[];
  accounts: AccountOption[];
};

function statusBadgeVariant(
  status: ClaimStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "paid") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

export function ClaimsTable({
  householdId,
  policyId,
  claims,
  insuredPeople,
  accounts,
}: ClaimsTableProps) {
  const router = useRouter();
  const [isStatusPending, startStatusTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InsuranceClaimRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<InsuranceClaimRow | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<InsuranceClaimRow | null>(
    null,
  );

  function handleStatusChange(
    claim: InsuranceClaimRow,
    status: ManualClaimStatus,
  ) {
    startStatusTransition(async () => {
      const result = await setClaimStatusAction(householdId, {
        claimId: claim.id,
        policyId,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${CLAIM_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteClaimAction(householdId, {
      claimId: deleteTarget.id,
      policyId,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Claims</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          File a claim
        </Button>
      </div>

      {claims.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No claims filed yet"
          description="File a claim to track its status, approved/settled amounts, and supporting documents."
          action={
            <Button onClick={() => setCreateOpen(true)}>File a claim</Button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Incident</th>
                <th className="px-4 py-2.5 font-medium">Insured person</th>
                <th className="px-4 py-2.5 font-medium">Claimed</th>
                <th className="px-4 py-2.5 font-medium">Approved</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Docs</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="px-4 py-2.5">
                    {formatDisplayDate(claim.incident_date)}
                    {claim.hospital_provider && (
                      <span className="text-muted-foreground block text-xs">
                        {claim.hospital_provider}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{claim.insuredPersonName}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {formatMoney({
                      amountMinorUnits: claim.claimed_amount_minor_units,
                      currencyCode: claim.currency_code,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {claim.approved_amount_minor_units !== null
                      ? formatMoney({
                          amountMinorUnits: claim.approved_amount_minor_units,
                          currencyCode: claim.currency_code,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(claim.status as ClaimStatus)}
                    >
                      {CLAIM_STATUS_LABELS[claim.status as ClaimStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {claim.documentCount > 0 ? claim.documentCount : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={isStatusPending}
                        >
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for this claim
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(claim)}>
                          Edit
                        </DropdownMenuItem>
                        {claim.status !== "paid" && (
                          <DropdownMenuItem
                            onClick={() => setSettleTarget(claim)}
                          >
                            Record settlement
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {manualClaimStatusSchema.options.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            disabled={status === claim.status}
                            onClick={() => handleStatusChange(claim, status)}
                          >
                            Mark {CLAIM_STATUS_LABELS[status].toLowerCase()}
                          </DropdownMenuItem>
                        ))}
                        {claim.status !== "paid" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(claim)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClaimDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        policyId={policyId}
        insuredPeople={insuredPeople}
        onSaved={() => router.refresh()}
      />
      <ClaimDialog
        key={editTarget?.id ?? "edit-none"}
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        policyId={policyId}
        insuredPeople={insuredPeople}
        claim={editTarget}
        onSaved={() => router.refresh()}
      />
      {settleTarget && (
        <RecordClaimSettlementDialog
          householdId={householdId}
          open={Boolean(settleTarget)}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          claim={settleTarget}
          accounts={accounts}
          onSaved={() => router.refresh()}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this claim?"
        description="This claim record will be permanently removed, including its status history."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
