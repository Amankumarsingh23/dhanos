const DEFAULT_REDIRECT_PATH = "/app";

/**
 * Validates a user/query-supplied redirect target (e.g. `?next=`) and
 * returns a same-origin, path-only string safe to pass to `redirect()` or
 * `router.push()`. Never trust `next`/`redirect_to` params directly —
 * without this, `/login?next=https://evil.example` or
 * `/login?next=//evil.example` (protocol-relative) would send an
 * authenticated user off-site. See docs/security-model.md §6 (IDOR/mass
 * assignment risks) — this is the equivalent guard for redirects.
 *
 * Resolving against a fixed dummy origin lets the platform `URL` parser do
 * the normalization work (backslash-as-slash tricks, `..` segments, etc.)
 * instead of hand-rolling it; the only thing that actually matters is
 * whether the parsed result's origin changed.
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (!value) {
    return fallback;
  }

  // Reject control characters (e.g. tabs) up front — some historical
  // browser bugs treated them specially inside otherwise-relative URLs.
  if (/[\x00-\x1f]/.test(value)) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
