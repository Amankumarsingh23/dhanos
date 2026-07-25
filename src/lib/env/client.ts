import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not be empty"),
  NEXT_PUBLIC_APP_URL: z
    .string({ error: "NEXT_PUBLIC_APP_URL is required" })
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),
});

/**
 * `NEXT_PUBLIC_APP_URL` is only ever a *fallback* — the real per-request
 * origin is always derived from the incoming Host header instead (see
 * src/lib/auth/request-origin.ts), so its exact value barely matters at
 * runtime. Requiring it to be hand-set before every deploy is still a
 * real chicken-and-egg problem on Vercel, though: a project's domain
 * isn't reliably knowable until a build has already succeeded once.
 * Vercel injects its own system env vars at build time regardless —
 * `VERCEL_PROJECT_PRODUCTION_URL` (the stable assigned/custom domain) or
 * `VERCEL_URL` (this specific deployment's own URL, set on every
 * deployment including previews) — so fall back to those, in that order,
 * before falling back further to localhost for pure local dev. Both are
 * a bare hostname with no protocol, hence the `https://` prefix.
 */
function resolveDefaultAppUrl(): string | undefined {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

/**
 * Values must be referenced statically (`process.env.NEXT_PUBLIC_...`) so
 * Next.js can inline them at build time — a dynamic lookup like
 * `process.env[key]` would not be replaced and would be `undefined` in the
 * browser bundle.
 */
function parseClientEnv() {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ??
      resolveDefaultAppUrl() ??
      "http://localhost:3000",
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing public environment variables:\n${issues}\n\nCheck .env.local against .env.example.`,
    );
  }

  return result.data;
}

/** Public configuration — safe to import from Client or Server Components. */
export const clientEnv = parseClientEnv();
