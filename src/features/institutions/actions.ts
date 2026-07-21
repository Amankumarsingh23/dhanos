"use server";

import { z } from "zod";
import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  institutionInputSchema,
  institutionUpdateSchema,
  type InstitutionInput,
  type InstitutionUpdateInput,
} from "@/lib/validation/institutions";
import {
  findPotentialDuplicates,
  type DuplicateMatch,
} from "./duplicate-detection";
import { listInstitutionsForDuplicateCheck } from "./queries";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Institutions feature — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation.
 */

export type InstitutionRow = Tables<"institutions">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const ARCHIVE_ROLES = ["owner", "admin"] as const;

/**
 * create/updateInstitutionAction return one of these instead of the bare
 * row: a `duplicate_warning` means nothing was written — the caller must
 * resubmit with `confirmDuplicate: true` (create) to proceed anyway. This
 * is a *warning*, never an automatic merge (see PROMPT 8).
 */
export type InstitutionWriteOutcome =
  | { kind: "created"; institution: InstitutionRow }
  | { kind: "updated"; institution: InstitutionRow }
  | { kind: "duplicate_warning"; matches: DuplicateMatch[] };

export async function createInstitutionAction(
  householdId: string,
  input: InstitutionInput,
): Promise<ActionResult<InstitutionWriteOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: institutionInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      if (!values.confirmDuplicate) {
        const existing = await listInstitutionsForDuplicateCheck(
          supabase,
          householdId,
        );
        const matches = findPotentialDuplicates(
          {
            name: values.name,
            website: values.website,
            supportPhone: values.supportPhone,
          },
          existing,
        );
        if (matches.length > 0) {
          return { kind: "duplicate_warning", matches };
        }
      }

      const response = await supabase
        .from("institutions")
        .insert({
          household_id: householdId,
          name: values.name,
          institution_type: values.institutionType,
          website: values.website ?? null,
          platform_name: values.platformName ?? null,
          support_phone: values.supportPhone ?? null,
          support_email: values.supportEmail ?? null,
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return { kind: "created", institution: response.data };
    },
    activityEvent: ({ output }) =>
      output.kind === "created"
        ? {
            householdId,
            eventType: "institution.created",
            entityType: "institution",
            entityId: output.institution.id,
          }
        : null,
    revalidatePaths: ["/app/institutions"],
  });
}

const updateInstitutionSchema = institutionUpdateSchema.extend({
  institutionId: uuidSchema,
  confirmDuplicate: z.boolean().optional().default(false),
});

export async function updateInstitutionAction(
  householdId: string,
  institutionId: string,
  input: InstitutionUpdateInput,
): Promise<ActionResult<InstitutionWriteOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateInstitutionSchema,
    input: { ...input, institutionId },
    run: async ({ supabase, input: values }) => {
      if (!values.confirmDuplicate) {
        const existing = await listInstitutionsForDuplicateCheck(
          supabase,
          householdId,
          values.institutionId,
        );
        const matches = findPotentialDuplicates(
          {
            name: values.name,
            website: values.website,
            supportPhone: values.supportPhone,
          },
          existing,
        );
        if (matches.length > 0) {
          return { kind: "duplicate_warning", matches };
        }
      }

      const response = await supabase
        .from("institutions")
        .update({
          name: values.name,
          institution_type: values.institutionType,
          website: values.website ?? null,
          platform_name: values.platformName ?? null,
          support_phone: values.supportPhone ?? null,
          support_email: values.supportEmail ?? null,
          notes: values.notes ?? null,
        })
        .eq("id", values.institutionId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return { kind: "updated", institution: response.data };
    },
    activityEvent: ({ output }) =>
      output.kind === "updated"
        ? {
            householdId,
            eventType: "institution.updated",
            entityType: "institution",
            entityId: output.institution.id,
          }
        : null,
    revalidatePaths: ["/app/institutions"],
  });
}

const institutionIdSchema = z.object({ institutionId: uuidSchema });

async function setInstitutionArchivedState(
  householdId: string,
  institutionId: string,
  isArchived: boolean,
): Promise<ActionResult<InstitutionRow>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...ARCHIVE_ROLES],
    schema: institutionIdSchema,
    input: { institutionId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("institutions")
        .update({ is_archived: isArchived })
        .eq("id", values.institutionId)
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
      eventType: isArchived ? "institution.archived" : "institution.restored",
      entityType: "institution",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/institutions"],
  });
}

/** Archiving, not deleting — an institution likely has linked accounts/loans/policies/investments once those modules exist. */
export async function archiveInstitutionAction(
  householdId: string,
  institutionId: string,
): Promise<ActionResult<InstitutionRow>> {
  return setInstitutionArchivedState(householdId, institutionId, true);
}

export async function restoreInstitutionAction(
  householdId: string,
  institutionId: string,
): Promise<ActionResult<InstitutionRow>> {
  return setInstitutionArchivedState(householdId, institutionId, false);
}
