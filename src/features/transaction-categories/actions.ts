"use server";

import { z } from "zod";
import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  categoryInputSchema,
  categoryUpdateSchema,
  reorderCategoriesSchema,
  type CategoryInput,
  type CategoryUpdateInput,
  type ReorderCategoriesInput,
} from "@/lib/validation/transaction-categories";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Transaction Categories feature — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation.
 */

export type CategoryRecord = Tables<"transaction_categories">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;

export async function createCategoryAction(
  householdId: string,
  input: CategoryInput,
): Promise<ActionResult<CategoryRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: categoryInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("transaction_categories")
        .insert({
          household_id: householdId,
          name: values.name,
          category_kind: values.categoryKind,
          parent_category_id: values.parentCategoryId ?? null,
          classification: values.classification ?? null,
          icon: values.icon ?? null,
          color: values.color ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "category.created",
      entityType: "transaction_category",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/cash-flow/categories", "/app/cash-flow"],
  });
}

const updateCategorySchema = categoryUpdateSchema.and(
  z.object({ categoryId: uuidSchema }),
);

export async function updateCategoryAction(
  householdId: string,
  categoryId: string,
  input: CategoryUpdateInput,
): Promise<ActionResult<CategoryRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateCategorySchema,
    input: { ...input, categoryId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("transaction_categories")
        .update({
          name: values.name,
          category_kind: values.categoryKind,
          parent_category_id: values.parentCategoryId ?? null,
          classification: values.classification ?? null,
          icon: values.icon ?? null,
          color: values.color ?? null,
        })
        .eq("id", values.categoryId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "category.updated",
      entityType: "transaction_category",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/cash-flow/categories", "/app/cash-flow"],
  });
}

const categoryIdSchema = z.object({ categoryId: uuidSchema });

async function setCategoryArchivedState(
  householdId: string,
  categoryId: string,
  isArchived: boolean,
): Promise<ActionResult<CategoryRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: categoryIdSchema,
    input: { categoryId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("transaction_categories")
        .update({ is_archived: isArchived })
        .eq("id", values.categoryId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: isArchived ? "category.archived" : "category.restored",
      entityType: "transaction_category",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/cash-flow/categories", "/app/cash-flow"],
  });
}

/** Archiving, not deleting — a system-default or long-used category likely has transaction/split history referencing it. */
export async function archiveCategoryAction(
  householdId: string,
  categoryId: string,
): Promise<ActionResult<CategoryRecord>> {
  return setCategoryArchivedState(householdId, categoryId, true);
}

export async function restoreCategoryAction(
  householdId: string,
  categoryId: string,
): Promise<ActionResult<CategoryRecord>> {
  return setCategoryArchivedState(householdId, categoryId, false);
}

/**
 * Persists a new manual display order: index within `orderedCategoryIds`
 * becomes each category's sort_order. Each row is its own update (not a
 * single atomic statement) — a partial failure mid-reorder leaves some
 * rows with a stale sort_order, which only affects display order, never
 * correctness, so this doesn't need the RPC-level atomicity that money
 * writes require.
 */
export async function reorderCategoriesAction(
  householdId: string,
  input: ReorderCategoriesInput,
): Promise<ActionResult<{ reordered: number }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reorderCategoriesSchema,
    input,
    run: async ({ supabase, input: values }) => {
      for (const [index, categoryId] of values.orderedCategoryIds.entries()) {
        const response = await supabase
          .from("transaction_categories")
          .update({ sort_order: index })
          .eq("id", categoryId)
          .eq("household_id", householdId);
        if (response.error) {
          throw mapSupabaseError(response.error);
        }
      }
      return { reordered: values.orderedCategoryIds.length };
    },
    revalidatePaths: ["/app/cash-flow/categories", "/app/cash-flow"],
  });
}
