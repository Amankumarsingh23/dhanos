/**
 * Deliberately import-free (no "server-only", no `next/headers`) — used
 * from src/lib/supabase/middleware.ts, which runs in the Edge runtime and
 * can't pull in the Node/Server-Component-only `next/headers` module that
 * src/lib/observability/request-id.ts otherwise needs.
 */
export const REQUEST_ID_HEADER = "x-request-id";
