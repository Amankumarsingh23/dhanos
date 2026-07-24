"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { toIsoDateString } from "@/lib/dates";
import {
  DECISION_ENTITY_TYPE_LABELS,
  INITIAL_DECISION_STATUSES,
  DECISION_STATUS_LABELS,
  createDecisionSchema,
  type CreateDecisionInput,
  type DecisionEntityType,
} from "@/lib/validation/decisions";
import { createDecisionAction, supersedeDecisionAction } from "./actions";
import type { DecisionRecord } from "./queries";

export type SelectOption = { id: string; label: string };

type DecisionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, submitting creates a NEW entry that supersedes this one — its fields seed the form as a starting point, but nothing about the old row is ever edited. */
  supersedes?: DecisionRecord | null;
  entityOptions: Record<DecisionEntityType, SelectOption[]>;
  onSaved?: (decisionId: string) => void;
};

const ENTITY_TYPE_OPTIONS = Object.entries(DECISION_ENTITY_TYPE_LABELS) as [
  DecisionEntityType,
  string,
][];
const STATUS_OPTIONS = INITIAL_DECISION_STATUSES.map((status) => [
  status,
  DECISION_STATUS_LABELS[status],
]) as [string, string][];

function toDefaultValues(source?: DecisionRecord | null): CreateDecisionInput {
  return {
    title: source ? `${source.title} (revised)` : "",
    decisionDate: source?.decision_date ?? toIsoDateString(new Date()),
    amount:
      source && source.amount_minor_units !== null
        ? String(source.amount_minor_units / 100)
        : "",
    entityType: (source?.entity_type as DecisionEntityType) ?? null,
    entityId: source?.entity_id ?? null,
    context: source?.context ?? null,
    choice: source?.choice ?? "",
    alternatives: source?.alternatives ?? null,
    rationale: source?.rationale ?? "",
    expectedResult: source?.expected_result ?? null,
    risks: source?.risks ?? null,
    reviewDate: source?.review_date ?? null,
    status: "decided",
  };
}

/**
 * Create dialog for the financial decision journal (PROMPT 37) — there is
 * no edit mode: once created, a decision's title/context/choice/
 * alternatives/rationale/expected_result/risks/entity link are write-once
 * (enforced by the database's own immutability trigger, not just this
 * UI). Reopening this dialog with `supersedes` set produces a brand-new
 * row instead, seeded from the old one's fields as a convenient starting
 * point — "superseding does not erase history."
 */
export function DecisionDialog({
  householdId,
  open,
  onOpenChange,
  supersedes,
  entityOptions,
  onSaved,
}: DecisionDialogProps) {
  const isSuperseding = Boolean(supersedes);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateDecisionInput>({
    resolver: zodResolver(createDecisionSchema) as Resolver<CreateDecisionInput>,
    defaultValues: toDefaultValues(supersedes),
  });

  useEffect(() => {
    if (!open) return;
    reset(toDefaultValues(supersedes));
    setFormError(null);
  }, [open, supersedes, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) setFormError(null);
    onOpenChange(next);
  }

  const entityType = watch("entityType");
  const options = entityType ? entityOptions[entityType] ?? [] : [];

  function onSubmit(values: CreateDecisionInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isSuperseding && supersedes
          ? await supersedeDecisionAction(householdId, {
              ...values,
              supersedesEntryId: supersedes.id,
            })
          : await createDecisionAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isSuperseding ? "New decision recorded" : "Decision recorded");
      handleOpenChange(false);
      onSaved?.(result.data.id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isSuperseding ? "Record a new decision" : "Record a decision"}
          </DialogTitle>
          <DialogDescription>
            {isSuperseding
              ? `Replaces "${supersedes?.title}" going forward — its original entry stays exactly as recorded.`
              : "Once saved, the context/choice/rationale below can never be edited — only its status, review date, and eventual outcome can change. Record a new entry later if your thinking changes."}
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
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Start a SIP in a large-cap fund"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            <FormErrorMessage message={errors.title?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="decisionDate">Decision date</Label>
              <Input
                id="decisionDate"
                type="date"
                aria-invalid={!!errors.decisionDate}
                {...register("decisionDate")}
              />
              <FormErrorMessage message={errors.decisionDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount involved (optional)</Label>
              <Input id="amount" inputMode="decimal" {...register("amount")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" {...register("status")}>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entityType">Related record (optional)</Label>
              <NativeSelect
                id="entityType"
                value={entityType ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  setValue("entityType", next ? (next as DecisionEntityType) : null);
                  setValue("entityId", null);
                }}
              >
                <option value="">Not linked</option>
                {ENTITY_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entityId">Record</Label>
              <NativeSelect
                id="entityId"
                disabled={!entityType}
                aria-invalid={!!errors.entityId}
                {...register("entityId")}
              >
                <option value="">Select…</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.entityId?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="context">Context (optional)</Label>
            <Textarea
              id="context"
              placeholder="What situation led to this decision?"
              {...register("context")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="choice">Choice</Label>
            <Textarea
              id="choice"
              placeholder="What was decided?"
              aria-invalid={!!errors.choice}
              {...register("choice")}
            />
            <FormErrorMessage message={errors.choice?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alternatives">Alternatives considered (optional)</Label>
            <Textarea id="alternatives" {...register("alternatives")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rationale">Rationale</Label>
            <Textarea
              id="rationale"
              placeholder="Why this choice, over the alternatives?"
              aria-invalid={!!errors.rationale}
              {...register("rationale")}
            />
            <FormErrorMessage message={errors.rationale?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expectedResult">Expected result (optional)</Label>
              <Textarea id="expectedResult" {...register("expectedResult")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="risks">Risks (optional)</Label>
              <Textarea id="risks" {...register("risks")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reviewDate">
              Review date (optional) — creates a reminder
            </Label>
            <Input id="reviewDate" type="date" {...register("reviewDate")} />
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
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
