export type AppEnvironment = "production" | "preview" | "development" | "test";

/**
 * Resolves which environment this server is running in — the "monitoring
 * distinguishes preview and production" requirement (see
 * docs/observability.md). Prefers Vercel's own env vars (set automatically
 * on every deploy, no config needed there); falls back to an explicit
 * `APP_ENV` for any other host, then to NODE_ENV, so local dev and test
 * runs still get a sensible label without extra setup.
 */
export function getEnvironment(): AppEnvironment {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") {
    return vercelEnv;
  }

  const appEnv = process.env.APP_ENV;
  if (
    appEnv === "production" ||
    appEnv === "preview" ||
    appEnv === "development"
  ) {
    return appEnv;
  }

  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

/**
 * Resolves a release identifier for grouping log lines / errors by deploy.
 * Prefers Vercel's own commit SHA (automatic on every deploy); falls back
 * to an explicit `RELEASE_ID` for any other host, then to a fixed "local"
 * value so nothing throws when neither is set.
 */
export function getRelease(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RELEASE_ID ?? "local";
}
