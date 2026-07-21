import type { createClient } from "@/lib/supabase/server";
import { mapSupabaseError } from "@/lib/errors/supabase";
import type { Json } from "@/types/database";

/**
 * Step 6 of the standard mutation process (see docs/data-access-patterns.md
 * and supabase/migrations/20260721060009_activity_events.sql): every
 * financial mutation records what happened, in the same household-scoped,
 * append-only activity_events table the audit trail is built on
 * (docs/security-model.md §5). Feature actions call this from inside their
 * mutation, using the same request-scoped Supabase client the write itself
 * used — never a separate client, so the event is written under the same
 * RLS session as the mutation it's describing.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActivityEventInput = {
  householdId: string;
  /** Free-text dotted event name, e.g. "transaction.created" — see the column comment in the activity_events migration for why this isn't an enum. */
  eventType: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Json;
};

/** Inserts one activity_events row. Throws a mapped AppError (never a raw PostgrestError) on failure — see src/lib/errors/supabase.ts. */
export async function recordActivityEvent(
  supabase: SupabaseServerClient,
  event: ActivityEventInput,
): Promise<void> {
  const { error } = await supabase.from("activity_events").insert({
    household_id: event.householdId,
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    throw mapSupabaseError(error);
  }
}
