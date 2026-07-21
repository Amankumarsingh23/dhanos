import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { serverEnv } from "@/lib/env/server";

/**
 * Bypasses Row Level Security entirely. Restrict usage to narrowly-scoped,
 * audited server contexts (e.g. a scheduled job aggregating across
 * households) — never in a request path that echoes user-supplied filters,
 * and never import this from anything reachable by a Client Component.
 * See docs/security-model.md §3.
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
