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
  CATEGORY_KIND_LABELS,
  CLASSIFICATION_LABELS,
  categoryInputSchema,
  type CategoryInput,
} from "@/lib/validation/transaction-categories";
import { createCategoryAction, updateCategoryAction } from "./actions";
import type { CategoryRow } from "./queries";

type CategoryDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  category?: CategoryRow | null;
  /** Pre-selects the parent picker for a fresh "add subcategory" create — ignored when `category` (edit mode) is set. */
  defaultParentCategoryId?: string | null;
  /** Every other category, for the parent picker — filtered to exclude `category` itself when editing. */
  categories: CategoryRow[];
  onSaved?: () => void;
};

const CATEGORY_KIND_OPTIONS = Object.entries(CATEGORY_KIND_LABELS) as [
  keyof typeof CATEGORY_KIND_LABELS,
  string,
][];
const CLASSIFICATION_OPTIONS = Object.entries(CLASSIFICATION_LABELS) as [
  keyof typeof CLASSIFICATION_LABELS,
  string,
][];

function toDefaultValues(
  category?: CategoryRow | null,
  defaultParentCategoryId?: string | null,
): CategoryInput {
  return {
    name: category?.name ?? "",
    categoryKind:
      (category?.category_kind as CategoryInput["categoryKind"]) ?? "expense",
    parentCategoryId:
      category?.parent_category_id ?? defaultParentCategoryId ?? null,
    classification:
      (category?.classification as CategoryInput["classification"]) ?? null,
    icon: category?.icon ?? null,
    color: category?.color ?? null,
  };
}

/** Create/edit dialog for a transaction category — see PROMPT 10, "Category behavior." */
export function CategoryDialog({
  householdId,
  open,
  onOpenChange,
  category,
  defaultParentCategoryId,
  categories,
  onSaved,
}: CategoryDialogProps) {
  const isEditing = Boolean(category);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: toDefaultValues(category, defaultParentCategoryId),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(category, defaultParentCategoryId));
    }
  }, [open, category, defaultParentCategoryId, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: CategoryInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateCategoryAction(householdId, category!.id, values)
        : await createCategoryAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Category updated" : "Category added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  const parentOptions = categories.filter((c) => c.id !== category?.id);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit category" : "Add category"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this category's details."
              : "A label applied to transactions and splits — optionally nested under an existing group."}
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
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            <FormErrorMessage id="name-error" message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="categoryKind">Applies to</Label>
              <NativeSelect
                id="categoryKind"
                aria-invalid={!!errors.categoryKind}
                {...register("categoryKind")}
              >
                {CATEGORY_KIND_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.categoryKind?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="classification">Classification (optional)</Label>
              <NativeSelect id="classification" {...register("classification")}>
                <option value="">None</option>
                {CLASSIFICATION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.classification?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentCategoryId">Parent group (optional)</Label>
            <NativeSelect
              id="parentCategoryId"
              {...register("parentCategoryId")}
            >
              <option value="">None — top-level group</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage message={errors.parentCategoryId?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="icon">Icon (optional)</Label>
              <Input id="icon" {...register("icon")} />
              <FormErrorMessage message={errors.icon?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Color (optional)</Label>
              <Input id="color" placeholder="#4f46e5" {...register("color")} />
              <FormErrorMessage message={errors.color?.message} />
            </div>
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
                  : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
