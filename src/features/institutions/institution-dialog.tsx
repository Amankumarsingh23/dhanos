"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import {
  INSTITUTION_TYPE_LABELS,
  institutionInputSchema,
  type InstitutionInput,
} from "@/lib/validation/institutions";
import type { DuplicateMatch } from "./duplicate-detection";
import { createInstitutionAction, updateInstitutionAction } from "./actions";
import type { InstitutionRow } from "./queries";

type InstitutionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  institution?: InstitutionRow | null;
  onSaved?: () => void;
};

const INSTITUTION_TYPE_OPTIONS = Object.entries(INSTITUTION_TYPE_LABELS) as [
  keyof typeof INSTITUTION_TYPE_LABELS,
  string,
][];

const DUPLICATE_REASON_LABELS: Record<string, string> = {
  name: "a similar name",
  domain: "the same website",
  phone: "the same support number",
};

function toDefaultValues(
  institution?: InstitutionRow | null,
): InstitutionInput {
  return {
    name: institution?.name ?? "",
    institutionType:
      (institution?.institution_type as InstitutionInput["institutionType"]) ??
      "bank",
    website: institution?.website ?? null,
    platformName: institution?.platform_name ?? null,
    supportPhone: institution?.support_phone ?? null,
    supportEmail: institution?.support_email ?? null,
    notes: institution?.notes ?? null,
    confirmDuplicate: false,
  };
}

/**
 * Create/edit dialog for an institution — includes the duplicate-warning
 * step from PROMPT 8 ("Warn based on normalized name/website domain/support
 * number. Do not automatically merge."): a first submit that turns up a
 * match shows the warning and stops; the user must explicitly resubmit to
 * proceed, which sends the exact same values plus confirmDuplicate: true.
 */
export function InstitutionDialog({
  householdId,
  open,
  onOpenChange,
  institution,
  onSaved,
}: InstitutionDialogProps) {
  const isEditing = Boolean(institution);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<
    DuplicateMatch[] | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<InstitutionInput>({
    resolver: zodResolver(institutionInputSchema),
    defaultValues: toDefaultValues(institution),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(institution));
    }
  }, [open, institution, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setDuplicateMatches(null);
    }
    onOpenChange(next);
  }

  async function submitValues(values: InstitutionInput) {
    const result = isEditing
      ? await updateInstitutionAction(householdId, institution!.id, values)
      : await createInstitutionAction(householdId, values);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    if (result.data.kind === "duplicate_warning") {
      setDuplicateMatches(result.data.matches);
      return;
    }

    toast.success(isEditing ? "Institution updated" : "Institution added");
    handleOpenChange(false);
    onSaved?.();
  }

  function onSubmit(values: InstitutionInput) {
    setFormError(null);
    setDuplicateMatches(null);
    startTransition(() => submitValues(values));
  }

  function onConfirmDuplicate() {
    setFormError(null);
    startTransition(() =>
      submitValues({ ...getValues(), confirmDuplicate: true }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit institution" : "Add institution"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this institution's details."
              : "A bank, wallet, investment platform, insurer, lender, employer, business, government body, or staking platform."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {duplicateMatches && duplicateMatches.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>This might already exist</AlertTitle>
              <AlertDescription>
                <p>
                  {duplicateMatches
                    .map(
                      (match) =>
                        `"${match.institutionName}" (matches on ${match.reasons
                          .map((reason) => DUPLICATE_REASON_LABELS[reason])
                          .join(", ")})`,
                    )
                    .join("; ")}
                </p>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            <FormErrorMessage id="name-error" message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institutionType">Type</Label>
            <NativeSelect
              id="institutionType"
              aria-invalid={!!errors.institutionType}
              aria-describedby={
                errors.institutionType ? "institutionType-error" : undefined
              }
              {...register("institutionType")}
            >
              {INSTITUTION_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage
              id="institutionType-error"
              message={errors.institutionType?.message}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website">Website (optional)</Label>
            <Input
              id="website"
              placeholder="hdfcbank.com"
              aria-invalid={!!errors.website}
              aria-describedby={errors.website ? "website-error" : undefined}
              {...register("website")}
            />
            <FormErrorMessage
              id="website-error"
              message={errors.website?.message}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platformName">App/platform name (optional)</Label>
            <Input
              id="platformName"
              placeholder="e.g. HDFC MobileBanking"
              aria-invalid={!!errors.platformName}
              aria-describedby={
                errors.platformName ? "platformName-error" : undefined
              }
              {...register("platformName")}
            />
            <FormErrorMessage
              id="platformName-error"
              message={errors.platformName?.message}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supportPhone">Support phone (optional)</Label>
              <Input
                id="supportPhone"
                aria-invalid={!!errors.supportPhone}
                aria-describedby={
                  errors.supportPhone ? "supportPhone-error" : undefined
                }
                {...register("supportPhone")}
              />
              <FormErrorMessage
                id="supportPhone-error"
                message={errors.supportPhone?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supportEmail">Support email (optional)</Label>
              <Input
                id="supportEmail"
                type="email"
                aria-invalid={!!errors.supportEmail}
                aria-describedby={
                  errors.supportEmail ? "supportEmail-error" : undefined
                }
                {...register("supportEmail")}
              />
              <FormErrorMessage
                id="supportEmail-error"
                message={errors.supportEmail?.message}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? "notes-error" : undefined}
              {...register("notes")}
            />
            <FormErrorMessage
              id="notes-error"
              message={errors.notes?.message}
            />
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
            {duplicateMatches && duplicateMatches.length > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={onConfirmDuplicate}
              >
                {isPending
                  ? "Saving…"
                  : isEditing
                    ? "Save anyway"
                    : "Add anyway"}
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Saving…"
                  : isEditing
                    ? "Save changes"
                    : "Add institution"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
