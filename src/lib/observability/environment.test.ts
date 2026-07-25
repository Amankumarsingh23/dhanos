import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEnvironment", () => {
  it("prefers VERCEL_ENV when it's production or preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { getEnvironment } = await import("./environment");
    expect(getEnvironment()).toBe("preview");
  });

  it("falls back to APP_ENV when VERCEL_ENV is absent", async () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("APP_ENV", "production");
    const { getEnvironment } = await import("./environment");
    expect(getEnvironment()).toBe("production");
  });

  it("falls back to NODE_ENV, then a development default", async () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("APP_ENV", undefined);
    vi.stubEnv("NODE_ENV", "test");
    const { getEnvironment } = await import("./environment");
    expect(getEnvironment()).toBe("test");
  });
});

describe("getRelease", () => {
  it("prefers VERCEL_GIT_COMMIT_SHA, then RELEASE_ID, then 'local'", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    vi.stubEnv("RELEASE_ID", undefined);
    const { getRelease } = await import("./environment");
    expect(getRelease()).toBe("local");

    vi.stubEnv("RELEASE_ID", "2026.07.28-1");
    expect(getRelease()).toBe("2026.07.28-1");

    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    expect(getRelease()).toBe("abc123");
  });
});
