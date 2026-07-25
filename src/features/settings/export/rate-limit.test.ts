import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { RateLimitError } from "@/lib/errors/app-error";
import {
  EXPORT_ACTIVITY_EVENT_TYPE,
  EXPORT_RATE_LIMIT_MAX_REQUESTS,
} from "@/lib/validation/export";
import { checkExportRateLimit, isExportRateLimited } from "./rate-limit";

describe("isExportRateLimited", () => {
  it("is false below the max", () => {
    expect(isExportRateLimited(EXPORT_RATE_LIMIT_MAX_REQUESTS - 1)).toBe(
      false,
    );
  });

  it("is true at and above the max", () => {
    expect(isExportRateLimited(EXPORT_RATE_LIMIT_MAX_REQUESTS)).toBe(true);
    expect(isExportRateLimited(EXPORT_RATE_LIMIT_MAX_REQUESTS + 1)).toBe(true);
  });

  it("is false for zero", () => {
    expect(isExportRateLimited(0)).toBe(false);
  });
});

/** Mirrors build.test.ts's fake chain, for the count-only query checkExportRateLimit issues. */
function fakeSupabase(response: {
  count?: number | null;
  error?: PostgrestError | null;
}) {
  // A plain mutable object, not getters — see the identical note in
  // build.test.ts's own fakeSupabase for why.
  const calls: { eq: [string, unknown][]; gte?: [string, string] } = {
    eq: [],
  };

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq.push([column, value]);
      return chain;
    }),
    gte: vi.fn((column: string, value: string) => {
      calls.gte = [column, value];
      return chain;
    }),
    then(resolve: (value: { count: unknown; error: unknown }) => void) {
      resolve({ count: response.count ?? null, error: response.error ?? null });
    },
  };

  const from = vi.fn(() => chain);

  return {
    client: { from } as unknown as Parameters<typeof checkExportRateLimit>[0],
    from,
    calls,
  };
}

describe("checkExportRateLimit", () => {
  it("resolves without throwing when under the limit", async () => {
    const { client } = fakeSupabase({ count: EXPORT_RATE_LIMIT_MAX_REQUESTS - 1 });
    await expect(checkExportRateLimit(client, "hh-1")).resolves.toBeUndefined();
  });

  it("throws RateLimitError once the household has hit the limit", async () => {
    const { client } = fakeSupabase({ count: EXPORT_RATE_LIMIT_MAX_REQUESTS });
    await expect(checkExportRateLimit(client, "hh-1")).rejects.toThrow(
      RateLimitError,
    );
  });

  it("scopes the count to this household and the export event type", async () => {
    const { client, from, calls } = fakeSupabase({ count: 0 });
    await checkExportRateLimit(client, "hh-1");
    expect(from).toHaveBeenCalledWith("activity_events");
    expect(calls.eq).toEqual([
      ["household_id", "hh-1"],
      ["event_type", EXPORT_ACTIVITY_EVENT_TYPE],
    ]);
  });

  it("throws a mapped AppError, not the raw PostgrestError, on a query failure", async () => {
    const { client } = fakeSupabase({
      error: {
        name: "PostgrestError",
        message: "insufficient_privilege",
        details: "",
        hint: "",
        code: "42501",
      } as PostgrestError,
    });
    await expect(checkExportRateLimit(client, "hh-1")).rejects.toThrow(
      /permission/i,
    );
  });
});
