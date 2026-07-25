import type { createClient } from "@/lib/supabase/server";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { RateLimitError } from "@/lib/errors/app-error";
import {
  EXPORT_ACTIVITY_EVENT_TYPE,
  EXPORT_RATE_LIMIT_MAX_REQUESTS,
  EXPORT_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/validation/export";

/**
 * Household data export rate limiting (PROMPT 42, docs/security-model.md
 * §5/§6: "a full financial export is a high-value target if an account
 * session is hijacked" — the export endpoint is one of the two places
 * that document explicitly calls out for early rate limiting).
 *
 * Deliberately reuses the existing append-only activity_events table
 * (the same audit log every other mutation in this app already writes
 * to) rather than introducing a new table, cache, or in-memory store: an
 * export Server Action's own recordActivityEvent call (see ../actions.ts)
 * *is* the rate limiter's state, so there is nothing new to keep
 * consistent across serverless instances — a plain, indexed COUNT query
 * (activity_events_household_id_idx already covers household_id,
 * created_at desc) against a table already scoped and RLS-protected the
 * exact same way every other household query is.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Pure threshold check, split out from the Supabase call below so the rate-limit *rule* itself is unit-testable without a fake client. */
export function isExportRateLimited(recentExportCount: number): boolean {
  return recentExportCount >= EXPORT_RATE_LIMIT_MAX_REQUESTS;
}

/** Throws RateLimitError if this household has already recorded EXPORT_RATE_LIMIT_MAX_REQUESTS exports (JSON or CSV combined — both actions log the same event_type) within the last EXPORT_RATE_LIMIT_WINDOW_MINUTES. Call this *before* generating the export, never after — the point is to avoid doing the expensive work at all once the limit is hit. */
export async function checkExportRateLimit(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<void> {
  const windowStart = new Date(
    Date.now() - EXPORT_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const { count, error } = await supabase
    .from("activity_events")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("event_type", EXPORT_ACTIVITY_EVENT_TYPE)
    .gte("created_at", windowStart);

  if (error) {
    throw mapSupabaseError(error);
  }

  if (isExportRateLimited(count ?? 0)) {
    throw new RateLimitError(
      `You've reached the limit of ${EXPORT_RATE_LIMIT_MAX_REQUESTS} exports per ${EXPORT_RATE_LIMIT_WINDOW_MINUTES} minutes for this household. Please try again later.`,
    );
  }
}
