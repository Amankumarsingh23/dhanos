import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env/client";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { originFromHeaderGetter } from "@/lib/auth/request-origin";

/**
 * Landing point for every Supabase Auth email link (signup confirmation,
 * password recovery, and any future OAuth/magic-link addition) — exchanges
 * the PKCE `code` for a session cookie via the cookie-aware server client.
 * This is "Supabase's current server-side cookie pattern": the auth forms
 * (signup, forgot-password) set a code-verifier cookie in the browser when
 * they call signUp()/resetPasswordForEmail(); this route reads that same
 * cookie (same browser, same request lifecycle) to complete the exchange.
 *
 * Builds its own Supabase client (rather than reusing
 * src/lib/supabase/server.ts) so the session cookies land directly on the
 * `NextResponse` this handler returns. `next/headers`' `cookies().set()` is
 * the right tool in Server Components/Actions, but a Route Handler that
 * constructs and returns its own redirect response must attach cookies to
 * that response object directly, or they silently never reach the browser.
 *
 * Also uses `originFromHeaderGetter` (the actual Host header) rather than
 * `request.nextUrl.origin`/`request.url` — under `next start`, those were
 * observed reporting the server's own bound hostname ("localhost") instead
 * of the Host header the client actually sent ("127.0.0.1:<port>" in
 * local/e2e runs). Redirecting to that mismatched origin would send the
 * browser to a different host than the one that just received the session
 * cookie, silently losing the session on the very next request.
 *
 * `type`/`next` are our own query params, set when building the
 * emailRedirectTo/redirectTo URL in src/features/auth/actions.ts, and
 * echoed back verbatim by Supabase alongside its own `code`/`error` params.
 */
export async function GET(request: NextRequest) {
  const origin = originFromHeaderGetter((name) => request.headers.get(name));
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const errorDescription =
    searchParams.get("error_description") ?? searchParams.get("error");

  const fallbackNext = type === "recovery" ? "/reset-password" : "/onboarding";
  const next = getSafeRedirectPath(searchParams.get("next"), fallbackNext);

  if (!errorDescription && code) {
    const response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient<Database>(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  // Covers both an explicit GoTrue error (expired/reused link) and a
  // missing/invalid code — same generic, safe message either way, never the
  // raw provider error text.
  const url = new URL("/login", origin);
  url.searchParams.set("error", "link_expired");
  return NextResponse.redirect(url);
}
