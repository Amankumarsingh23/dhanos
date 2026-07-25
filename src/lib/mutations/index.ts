import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  requireHouseholdRole,
  type HouseholdMembership,
  type HouseholdRole,
} from "@/lib/households/permissions";
import { recordActivityEvent, type ActivityEventInput } from "@/lib/activity";
import { reportActionError } from "@/lib/observability/report-action-error";

/**
 * The standard result every household-scoped Server Action returns — step
 * 8 of the mutation process (see docs/data-access-patterns.md). A Server
 * Action never lets an error cross the client/server boundary as a thrown
 * exception (Next.js redacts thrown errors to an opaque generic message in
 * production, discarding anything actually useful); returning a value
 * instead keeps a real message intact and makes "did this succeed" a plain
 * `if (result.ok)` check at every call site, rather than try/catch
 * scattered through every form component.
 */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MutationContext<TInput> = {
  user: Awaited<ReturnType<typeof requireUser>>;
  membership: HouseholdMembership;
  supabase: SupabaseServerClient;
  householdId: string;
  input: TInput;
};

/**
 * Runs a household-scoped write through the standard 8-step mutation
 * process (see docs/data-access-patterns.md for the full contract):
 *
 *   1. resolve authenticated user       — via requireHouseholdRole
 *   2. resolve household authorization  — via requireHouseholdRole,
 *      re-checked against `householdId` on every call, never trusted
 *      because it was submitted (see docs/security-model.md §6)
 *   3. validate input                   — `schema.safeParse(input)`
 *   4. normalize money                  — the caller's `run` (see
 *      src/lib/money — parse/allocate before writing, never a bare number)
 *   5. atomic writes where required     — the caller's `run`; a single
 *      table write is already atomic under PostgREST, but a write
 *      spanning more than one table (e.g. a transaction plus its splits)
 *      must go through a `SECURITY INVOKER` Postgres RPC to get real
 *      atomicity — PostgREST does not span a client-visible transaction
 *      across two separate REST calls
 *   6. create activity event            — `activityEvent`, run against the
 *      same request-scoped `supabase` client the write itself used
 *   7. revalidate affected pages        — `revalidatePaths`
 *   8. return a typed safe result       — this function's return value
 *
 * Every failure path — a validation error, a permission/not-found error
 * from requireHouseholdRole, or anything `run`/`activityEvent` throws — is
 * converted through `toUserMessage()`, so a raw PostgrestError or driver
 * message can never reach the client: only an AppError's own safe message,
 * or the generic fallback, ever ends up in the returned ActionResult. A
 * feature module's `run` should still map its own Supabase errors via
 * mapSupabaseError for a *specific* safe message (e.g. "not found") —
 * toUserMessage's fallback is the backstop, not a substitute for that.
 */
export async function runHouseholdMutation<
  TSchema extends z.ZodTypeAny,
  TOutput,
>(options: {
  householdId: string;
  allowedRoles: HouseholdRole[];
  schema: TSchema;
  input: unknown;
  run: (ctx: MutationContext<z.infer<TSchema>>) => Promise<TOutput>;
  activityEvent?: (ctx: {
    input: z.infer<TSchema>;
    output: TOutput;
  }) => ActivityEventInput | null;
  revalidatePaths?: string[];
  /** Short, stable, dot-namespaced label for observability (e.g. "expenses.refund") — see docs/observability.md. */
  actionName?: string;
}): Promise<ActionResult<TOutput>> {
  const parsed = options.schema.safeParse(options.input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const { user, membership } = await requireHouseholdRole(
      options.householdId,
      options.allowedRoles,
    );
    const supabase = await createClient();

    const output = await options.run({
      user,
      membership,
      supabase,
      householdId: options.householdId,
      input: parsed.data as z.infer<TSchema>,
    });

    if (options.activityEvent) {
      const event = options.activityEvent({
        input: parsed.data as z.infer<TSchema>,
        output,
      });
      if (event) {
        await recordActivityEvent(supabase, event);
      }
    }

    for (const path of options.revalidatePaths ?? []) {
      revalidatePath(path);
    }

    return actionOk(output);
  } catch (error) {
    return actionError(
      reportActionError(error, options.actionName ?? "household_mutation", {
        householdId: options.householdId,
      }),
    );
  }
}
