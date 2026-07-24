"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DownloadIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { toIsoDateString } from "@/lib/dates";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  insuranceClaimFieldsSchema,
  type InsuranceClaimFieldsInput,
} from "@/lib/validation/insurance";
import type { SelectOption } from "./policy-dialog";
import {
  attachClaimDocumentAction,
  createClaimAction,
  getClaimDocumentsAction,
  getClaimDocumentUrlAction,
  removeClaimDocumentAction,
  updateClaimAction,
} from "./claims-actions";
import type { ClaimDocumentRecord, InsuranceClaimRow } from "./claims-queries";

type ClaimDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  insuredPeople: SelectOption[];
  claim?: InsuranceClaimRow | null;
  onSaved?: () => void;
};

function toDefaultValues(
  policyId: string,
  source?: InsuranceClaimRow | null,
): InsuranceClaimFieldsInput {
  return {
    policyId,
    insuredPersonId: source?.insured_person_id ?? "",
    incidentDate: source?.incident_date ?? toIsoDateString(new Date()),
    claimDate: source?.claim_date ?? toIsoDateString(new Date()),
    claimedAmount: source
      ? String(source.claimed_amount_minor_units / 100)
      : "",
    approvedAmount:
      source && source.approved_amount_minor_units !== null
        ? String(source.approved_amount_minor_units / 100)
        : "",
    hospitalProvider: source?.hospital_provider ?? null,
    referenceNumber: source?.reference_number ?? null,
    notes: source?.notes ?? null,
  };
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create/edit dialog for an insurance claim (PROMPT 26). Documents can only
 * be attached once the claim exists (same "save first, then attach" split
 * as ExpenseDialog's receipts — the browser uploads bytes directly to
 * Storage, this only records the resulting path).
 */
export function ClaimDialog({
  householdId,
  open,
  onOpenChange,
  policyId,
  insuredPeople,
  claim,
  onSaved,
}: ClaimDialogProps) {
  const isEditing = Boolean(claim);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<ClaimDocumentRecord[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InsuranceClaimFieldsInput>({
    resolver: zodResolver(insuranceClaimFieldsSchema),
    defaultValues: toDefaultValues(policyId, claim),
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    reset(toDefaultValues(policyId, claim));
    if (!claim) {
      return;
    }
    let cancelled = false;
    void getClaimDocumentsAction(householdId, claim.id).then((result) => {
      if (!cancelled && result.ok) {
        setDocuments(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, claim, policyId, householdId, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: InsuranceClaimFieldsInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && claim
          ? await updateClaimAction(householdId, claim.id, values)
          : await createClaimAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Claim updated" : "Claim filed");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  async function handleDocumentUpload(file: File) {
    if (!claim) {
      return;
    }
    setIsUploading(true);
    try {
      const browserSupabase = createBrowserClient();
      const path = `${householdId}/insurance-claims/${claim.id}/${crypto.randomUUID()}-${file.name}`;
      const uploadResult = await browserSupabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadResult.error) {
        toast.error("Could not upload the document. Please try again.");
        return;
      }

      const result = await attachClaimDocumentAction(householdId, {
        claimId: claim.id,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDocuments((prev) => [result.data, ...prev]);
      toast.success("Document attached");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDocumentView(attachmentId: string) {
    const result = await getClaimDocumentUrlAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  async function handleDocumentRemove(attachmentId: string) {
    const result = await removeClaimDocumentAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== attachmentId));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit claim" : "File a claim"}</DialogTitle>
          <DialogDescription>
            A tracking record for your own reference — the insurer&rsquo;s own
            portal/paperwork remains the authoritative record of your claim.
          </DialogDescription>
        </DialogHeader>
        <form
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="insuredPersonId">Insured person</Label>
            <NativeSelect
              id="insuredPersonId"
              aria-invalid={!!errors.insuredPersonId}
              {...register("insuredPersonId")}
            >
              <option value="">Select a person</option>
              {insuredPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage message={errors.insuredPersonId?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="incidentDate">Incident date</Label>
              <Input
                id="incidentDate"
                type="date"
                aria-invalid={!!errors.incidentDate}
                {...register("incidentDate")}
              />
              <FormErrorMessage message={errors.incidentDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claimDate">Claim date</Label>
              <Input
                id="claimDate"
                type="date"
                aria-invalid={!!errors.claimDate}
                {...register("claimDate")}
              />
              <FormErrorMessage message={errors.claimDate?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="claimedAmount">Claimed amount</Label>
              <Input
                id="claimedAmount"
                inputMode="decimal"
                aria-invalid={!!errors.claimedAmount}
                {...register("claimedAmount")}
              />
              <FormErrorMessage message={errors.claimedAmount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approvedAmount">Approved amount (optional)</Label>
              <Input
                id="approvedAmount"
                inputMode="decimal"
                placeholder="Not yet decided"
                {...register("approvedAmount")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hospitalProvider">
                Hospital / provider (optional)
              </Label>
              <Input id="hospitalProvider" {...register("hospitalProvider")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referenceNumber">
                Reference number (optional)
              </Label>
              <Input id="referenceNumber" {...register("referenceNumber")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          <div className="space-y-2">
            <Label>Documents</Label>
            {!claim ? (
              <p className="text-muted-foreground text-xs">
                Save the claim first, then come back here to attach supporting
                documents (bills, discharge summary, reports).
              </p>
            ) : (
              <div className="space-y-2">
                {documents.length > 0 && (
                  <ul className="space-y-1.5">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate">
                          {document.file_name}
                          {document.size_bytes ? (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {formatFileSize(document.size_bytes)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDocumentView(document.id)}
                            aria-label={`View ${document.file_name}`}
                          >
                            <DownloadIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDocumentRemove(document.id)}
                            aria-label={`Remove ${document.file_name}`}
                          >
                            <XIcon />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="border-input hover:bg-accent/50 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                  <UploadIcon className="size-4" />
                  {isUploading ? "Uploading…" : "Upload a document"}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={isUploading}
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void handleDocumentUpload(file);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "File claim"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
