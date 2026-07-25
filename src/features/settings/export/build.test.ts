import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { EXPORT_ROW_LIMIT_PER_TABLE } from "@/lib/validation/export";
import { fetchExportTable, toCsvRow } from "./build";

/**
 * A minimal thenable chain mimicking Supabase's PostgrestFilterBuilder —
 * `.select()`/`.eq()`/`.limit()` each return the same chain object, and
 * the chain itself resolves to `{ data, error }` when awaited, matching
 * `await supabase.from(table).select("*").eq(...).limit(...)` in
 * ./build.ts. Records every call's arguments so a test can assert exactly
 * which table/household/cap the code under test actually used.
 */
function fakeSupabase(response: {
  data?: unknown[] | null;
  error?: PostgrestError | null;
}) {
  // A plain mutable object, not getters — destructuring a getter at call
  // time would capture its value before fetchExportTable ever runs, since
  // the fake chain's methods only populate this after the code under test
  // awaits the chain. Object-reference mutation (like Array.push below)
  // sidesteps that entirely.
  const calls: { eq: [string, unknown][]; limit?: number } = { eq: [] };

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq.push([column, value]);
      return chain;
    }),
    limit: vi.fn((count: number) => {
      calls.limit = count;
      return chain;
    }),
    then(resolve: (value: { data: unknown; error: unknown }) => void) {
      resolve({ data: response.data ?? null, error: response.error ?? null });
    },
  };

  const from = vi.fn(() => chain);

  return {
    client: { from } as unknown as Parameters<typeof fetchExportTable>[0],
    from,
    calls,
  };
}

describe("fetchExportTable", () => {
  it("scopes the query to the given household and requests one row past the cap", async () => {
    const rows = [{ id: "1" }, { id: "2" }];
    const { client, from, calls } = fakeSupabase({ data: rows });

    const outcome = await fetchExportTable(client, "people", "hh-1");

    expect(from).toHaveBeenCalledWith("people");
    expect(calls.eq).toEqual([["household_id", "hh-1"]]);
    expect(calls.limit).toBe(EXPORT_ROW_LIMIT_PER_TABLE + 1);
    expect(outcome).toEqual({
      key: "people",
      rowCount: 2,
      truncated: false,
      failed: false,
      rows,
    });
  });

  it("flags truncation and slices back down to the cap when the result exceeds it", async () => {
    const rows = Array.from({ length: EXPORT_ROW_LIMIT_PER_TABLE + 1 }, (_, i) => ({
      id: String(i),
    }));
    const { client } = fakeSupabase({ data: rows });

    const outcome = await fetchExportTable(client, "transactions", "hh-1");

    expect(outcome.truncated).toBe(true);
    expect(outcome.rowCount).toBe(EXPORT_ROW_LIMIT_PER_TABLE);
    expect(outcome.rows).toHaveLength(EXPORT_ROW_LIMIT_PER_TABLE);
    expect(outcome.failed).toBe(false);
  });

  it("flags failed rather than silently returning an empty table on a query error", async () => {
    const { client } = fakeSupabase({
      error: {
        name: "PostgrestError",
        message: "insufficient_privilege",
        details: "",
        hint: "",
        code: "42501",
      } as PostgrestError,
    });

    const outcome = await fetchExportTable(client, "loans", "hh-1");

    expect(outcome).toEqual({
      key: "loans",
      rowCount: 0,
      truncated: false,
      failed: true,
      rows: [],
    });
  });
});

describe("toCsvRow", () => {
  it("stringifies booleans and leaves other scalar types untouched", () => {
    expect(
      toCsvRow({
        name: "Salary",
        is_active: true,
        is_archived: false,
        amount_minor_units: 150000,
        notes: null,
      }),
    ).toEqual({
      name: "Salary",
      is_active: "true",
      is_archived: "false",
      amount_minor_units: 150000,
      notes: null,
    });
  });
});
