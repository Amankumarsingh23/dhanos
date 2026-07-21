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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import {
  personInputSchema,
  RELATIONSHIP_TYPE_LABELS,
  type PersonInput,
} from "@/lib/validation/people";
import { createPersonAction, updatePersonAction } from "./actions";
import type { PersonRow } from "./queries";

type PersonDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  person?: PersonRow | null;
  onSaved?: () => void;
};

const RELATIONSHIP_TYPE_OPTIONS = Object.entries(RELATIONSHIP_TYPE_LABELS) as [
  keyof typeof RELATIONSHIP_TYPE_LABELS,
  string,
][];

function toDefaultValues(person?: PersonRow | null): PersonInput {
  return {
    displayName: person?.display_name ?? "",
    relationshipType:
      (person?.relationship_type as PersonInput["relationshipType"]) ?? "self",
    birthDate: person?.birth_date ?? null,
    notes: person?.notes ?? null,
  };
}

/** Create/edit dialog for a person — see docs/data-access-patterns.md for the action pipeline this submits to. */
export function PersonDialog({
  householdId,
  open,
  onOpenChange,
  person,
  onSaved,
}: PersonDialogProps) {
  const isEditing = Boolean(person);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PersonInput>({
    resolver: zodResolver(personInputSchema),
    defaultValues: toDefaultValues(person),
  });

  // Re-seed the form whenever a different person is opened for editing, or
  // the dialog reopens for a fresh "create" — react-hook-form doesn't do
  // this automatically when `defaultValues` changes after mount.
  useEffect(() => {
    if (open) {
      reset(toDefaultValues(person));
    }
  }, [open, person, reset]);

  // Clears any stale error message the moment the dialog closes (Cancel,
  // Escape, the X button, or a successful submit) — driven directly by the
  // same user action that closes it, not a separate effect.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: PersonInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updatePersonAction(householdId, person!.id, values)
        : await createPersonAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Person updated" : "Person added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this person's details."
              : "Add someone relevant to this household's finances — yourself, a family member, or someone you lend to or borrow from."}
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
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              autoComplete="name"
              aria-invalid={!!errors.displayName}
              aria-describedby={
                errors.displayName ? "displayName-error" : undefined
              }
              {...register("displayName")}
            />
            <FormErrorMessage
              id="displayName-error"
              message={errors.displayName?.message}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="relationshipType">Relationship</Label>
            <NativeSelect
              id="relationshipType"
              aria-invalid={!!errors.relationshipType}
              aria-describedby={
                errors.relationshipType ? "relationshipType-error" : undefined
              }
              {...register("relationshipType")}
            >
              {RELATIONSHIP_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage
              id="relationshipType-error"
              message={errors.relationshipType?.message}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birthDate">Birth date (optional)</Label>
            <Input
              id="birthDate"
              type="date"
              aria-invalid={!!errors.birthDate}
              aria-describedby={
                errors.birthDate ? "birthDate-error" : undefined
              }
              {...register("birthDate")}
            />
            <FormErrorMessage
              id="birthDate-error"
              message={errors.birthDate?.message}
            />
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
          {isEditing ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-foreground text-sm font-medium">Connections</p>
              <p className="text-muted-foreground text-sm">
                Accounts owned by this person — available once the Accounts
                module is built.
              </p>
              <p className="text-muted-foreground text-sm">
                Nominee designations — available once the Insurance module is
                built.
              </p>
            </div>
          ) : null}
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
                  : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
