import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env/client";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { REQUEST_ID_HEADER } from "@/lib/observability/constants";

/**
 * Routes usable without a session. Everything else is treated as
 * protected — fail-closed by default rather than maintaining a growing
 * list of protected routes as new (workspace) modules are added later (see
 * docs/implementation-status.md §3).
 */
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/forgot-password"]);

/** Redirect an already-authenticated user away from these — there's nothing for them to do there. */
const AUTH_ONLY_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * Refreshes the Supabase session cookie on every matched request and
 * enforces route-level auth as a UX convenience — the redundant,
 * non-authoritative layer. Row Level Security remains the actual security
 * boundary (see docs/security-model.md §3); this only exists so a signed-out
 * visitor sees a sign-in page instead of a broken/empty authenticated
 * screen, and vice versa.
 */
export async function updateSession(request: NextRequest) {
  // Correlation ID (see docs/observability.md) — generated fresh per
  // request rather than trusting a client-supplied one, set on both the
  // outgoing request (so `headers()` in a Server Component/Action/Route
  // Handler downstream can read it via getRequestId()) and the response
  // (so it's visible to the caller for support/debugging). Never derived
  // from anything client-controlled.
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const nextInit = { request: { headers: requestHeaders } };
  function attachRequestId<T extends NextResponse>(response: T): T {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  let supabaseResponse = NextResponse.next(nextInit);

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next(nextInit);
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getUser().
  // A simple mistake here can make it very hard to debug users being
  // randomly logged out — this call is also what revalidates the session
  // with Supabase Auth on every request; do not remove it or rely solely on
  // the (unverified) session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // The callback route exchanges its own code/token — it must run
  // regardless of session state, and isn't a page to redirect to/from.
  if (pathname === "/auth/callback") {
    return attachRequestId(supabaseResponse);
  }

  // API routes handle their own auth (or are deliberately public, like
  // /api/health — see docs/observability.md) rather than redirecting to a
  // login page, which would break a non-browser caller (an uptime
  // monitor, a fetch from a Server Component).
  if (pathname.startsWith("/api/")) {
    return attachRequestId(supabaseResponse);
  }

  // Only reachable meaningfully via a recovery link's session — no session
  // means an expired/reused link, not a normal signed-out visit.
  if (pathname === "/reset-password") {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/forgot-password";
      url.search = "";
      return attachRequestId(NextResponse.redirect(url));
    }
    return attachRequestId(supabaseResponse);
  }

  if (user && AUTH_ONLY_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = getSafeRedirectPath(
      request.nextUrl.searchParams.get("next"),
    );
    url.search = "";
    return attachRequestId(NextResponse.redirect(url));
  }

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return attachRequestId(NextResponse.redirect(url));
  }

  // IMPORTANT: you *must* return the supabaseResponse object as it is, not
  // a new response — if you need to build one, copy over
  // request/response cookies as this function does above, or sessions will
  // randomly appear to expire.
  return attachRequestId(supabaseResponse);
}
