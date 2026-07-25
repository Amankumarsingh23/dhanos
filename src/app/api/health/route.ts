import { NextResponse } from "next/server";
import { clientEnv } from "@/lib/env/client";
import { getEnvironment, getRelease } from "@/lib/observability/environment";
import { logError } from "@/lib/observability/logger";

/**
 * Unauthenticated liveness/readiness probe for uptime monitors (see
 * docs/observability.md). Deliberately "safe": no session/household
 * context, no financial data, no internal error detail, no dependency
 * version strings — just enough to tell a monitor "up" from "down" and
 * which environment/release answered. src/lib/supabase/middleware.ts lets
 * every `/api/*` path skip the login-redirect check so this stays
 * reachable without a session.
 *
 * The connectivity check hits PostgREST's own root endpoint (its OpenAPI
 * schema, publicly served by design) rather than querying any table — an
 * anonymous/no-session client has *no* grant on any tenant table in this
 * schema at all (defense in depth beyond RLS, see the `anon`/`authenticated`
 * privilege split in every table's migration — verified live via `\dp` on
 * `households`: `anon` carries no `r` (SELECT) bit), which is the correct,
 * intentional posture and not something a health check should need to work
 * around by depending on any particular table being anon-readable.
 */
export async function GET() {
  const startedAt = Date.now();
  let databaseOk = true;

  try {
    const response = await fetch(
      `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
      {
        headers: { apikey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Supabase REST root responded ${response.status}`);
    }
  } catch (error) {
    databaseOk = false;
    void logError("health_check.database", error);
  }

  const body = {
    status: databaseOk ? "ok" : "degraded",
    environment: getEnvironment(),
    release: getRelease(),
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };

  return NextResponse.json(body, {
    status: databaseOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
