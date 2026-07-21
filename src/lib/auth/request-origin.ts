import "server-only";
import { headers } from "next/headers";
import { clientEnv } from "@/lib/env/client";

/**
 * Derives an absolute origin from a header lookup function, honoring the
 * actual incoming Host header. Route Handlers must use this rather than
 * `request.nextUrl.origin`/`request.url` — under `next start`, those
 * reflect the server's own bound hostname (observed as "localhost" even
 * when the client's Host header said "127.0.0.1:<port>"), not what the
 * client actually sent. Redirecting to that mismatched origin sends the
 * browser to a different host than the one that just received a session
 * cookie, silently losing the session on the very next request.
 */
export function originFromHeaderGetter(
  get: (name: string) => string | null,
): string {
  const host = get("x-forwarded-host") ?? get("host");
  if (!host) {
    return clientEnv.NEXT_PUBLIC_APP_URL;
  }

  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Server Actions/Components variant, reading `next/headers()`. Used to
 * build `emailRedirectTo`/`redirectTo` URLs for Supabase Auth emails so
 * they point back at whichever host actually served the request (`pnpm
 * dev` on :3000, the Playwright e2e server on :3100, or a real
 * deployment) rather than a hardcoded value.
 *
 * Whatever this resolves to must be present in supabase/config.toml's
 * [auth] additional_redirect_urls (or the hosted project's equivalent
 * setting) — Supabase rejects a redirectTo/emailRedirectTo whose origin
 * isn't allow-listed, which is itself a redirect-injection guard on
 * Supabase's side (see docs/security-model.md §6).
 */
export async function getRequestOrigin(): Promise<string> {
  const headerList = await headers();
  return originFromHeaderGetter((name) => headerList.get(name));
}
