"use server";

import { z } from "zod";
import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  personInputSchema,
  personUpdateSchema,
  type PersonInput,
  type PersonUpdateInput,
} from "@/lib/validation/people";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the People feature — see docs/data-access-patterns.md
 * for the 8-step mutation process every one of these implements via
 * runHouseholdMutation. `householdId` is always re-validated (via
 * requireHouseholdRole, inside runHouseholdMutation) rather than trusted
 * because it was passed in — see docs/security-model.md §6.
 */

export type PersonRow = Tables<"people">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const ARCHIVE_ROLES = ["owner", "admin"] as const;

export async function createPersonAction(
  householdId: string,
  input: PersonInput,
): Promise<ActionResult<PersonRow>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: personInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("people")
        .insert({
          household_id: householdId,
          display_name: values.displayName,
          relationship_type: values.relationshipType,
          birth_date: values.birthDate ?? null,
          notes: values.notes ?? null,
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
      eventType: "person.created",
      entityType: "person",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/people"],
  });
}

const updatePersonSchema = personUpdateSchema.extend({
  personId: uuidSchema,
});

export async function updatePersonAction(
  householdId: string,
  personId: string,
  input: PersonUpdateInput,
): Promise<ActionResult<PersonRow>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updatePersonSchema,
    input: { ...input, personId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("people")
        .update({
          display_name: values.displayName,
          relationship_type: values.relationshipType,
          birth_date: values.birthDate ?? null,
          notes: values.notes ?? null,
        })
        .eq("id", values.personId)
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
      eventType: "person.updated",
      entityType: "person",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/people"],
  });
}

const personIdSchema = z.object({ personId: uuidSchema });

async function setPersonActiveState(
  householdId: string,
  personId: string,
  isActive: boolean,
): Promise<ActionResult<PersonRow>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...ARCHIVE_ROLES],
    schema: personIdSchema,
    input: { personId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("people")
        .update({ is_active: isActive })
        .eq("id", values.personId)
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
      eventType: isActive ? "person.restored" : "person.archived",
      entityType: "person",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/people"],
  });
}

/** Archiving, not deleting — a person may already be referenced elsewhere (e.g. as an account owner) once later modules link to them. */
export async function archivePersonAction(
  householdId: string,
  personId: string,
): Promise<ActionResult<PersonRow>> {
  return setPersonActiveState(householdId, personId, false);
}

export async function restorePersonAction(
  householdId: string,
  personId: string,
): Promise<ActionResult<PersonRow>> {
  return setPersonActiveState(householdId, personId, true);
}
