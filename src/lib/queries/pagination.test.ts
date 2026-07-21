import { describe, expect, it } from "vitest";
import {
  applyArchivedFilter,
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
} from "./pagination";

/** A minimal fake query builder recording calls, mirroring supabase-js's chainable `.eq()`/`.order()` shape closely enough to exercise the generics against something other than `any`. */
function fakeQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    calls,
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", args: [column, value] });
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      calls.push({ method: "order", args: [column, options] });
      return builder;
    },
  };
  return builder;
}

describe("parsePagination", () => {
  it("defaults page/pageSize when omitted", () => {
    expect(parsePagination(undefined)).toEqual({ page: 1, pageSize: 25 });
  });

  it("passes through valid explicit values", () => {
    expect(parsePagination({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it("throws a ValidationError for an out-of-range pageSize", () => {
    expect(() => parsePagination({ pageSize: 1000 })).toThrow(/100/);
  });
});

describe("toOverfetchRange", () => {
  it("computes the first page as [0, pageSize]", () => {
    expect(toOverfetchRange({ page: 1, pageSize: 25 })).toEqual([0, 25]);
  });

  it("computes a later page relative to its offset", () => {
    expect(toOverfetchRange({ page: 3, pageSize: 10 })).toEqual([20, 30]);
  });

  it("overfetches by exactly one row past the requested page", () => {
    const [from, to] = toOverfetchRange({ page: 1, pageSize: 25 });
    // range() is inclusive on both ends, so to - from + 1 rows are
    // requested — one more than pageSize.
    expect(to - from + 1).toBe(26);
  });
});

describe("toPage", () => {
  it("reports hasMore and trims the overfetched row when more rows than pageSize come back", () => {
    const rows = Array.from({ length: 4 }, (_, i) => i);
    const page = toPage(rows, { page: 1, pageSize: 3 });
    expect(page.rows).toEqual([0, 1, 2]);
    expect(page.hasMore).toBe(true);
  });

  it("reports hasMore = false when fewer rows than pageSize come back", () => {
    const rows = [0, 1];
    const page = toPage(rows, { page: 1, pageSize: 3 });
    expect(page.rows).toEqual([0, 1]);
    expect(page.hasMore).toBe(false);
  });

  it("reports hasMore = false when exactly pageSize rows come back (no overfetched extra)", () => {
    const rows = [0, 1, 2];
    const page = toPage(rows, { page: 1, pageSize: 3 });
    expect(page.rows).toEqual([0, 1, 2]);
    expect(page.hasMore).toBe(false);
  });
});

describe("applyDeterministicOrder", () => {
  it("orders by the primary column, then a stable tiebreaker", () => {
    const query = fakeQuery();
    applyDeterministicOrder(query, "transaction_date", "desc");
    expect(query.calls).toEqual([
      { method: "order", args: ["transaction_date", { ascending: false }] },
      { method: "order", args: ["id", { ascending: true }] },
    ]);
  });

  it("supports ascending order and a custom tiebreaker column", () => {
    const query = fakeQuery();
    applyDeterministicOrder(query, "name", "asc", "created_at");
    expect(query.calls).toEqual([
      { method: "order", args: ["name", { ascending: true }] },
      { method: "order", args: ["created_at", { ascending: true }] },
    ]);
  });
});

describe("scopeToHousehold", () => {
  it("filters by household_id", () => {
    const query = fakeQuery();
    scopeToHousehold(query, "hh-1");
    expect(query.calls).toEqual([
      { method: "eq", args: ["household_id", "hh-1"] },
    ]);
  });
});

describe("applyArchivedFilter", () => {
  it("applies the active-value filter when archived rows are excluded", () => {
    const query = fakeQuery();
    applyArchivedFilter(query, "is_archived", false, false);
    expect(query.calls).toEqual([
      { method: "eq", args: ["is_archived", false] },
    ]);
  });

  it("skips the filter entirely when archived rows are explicitly included", () => {
    const query = fakeQuery();
    applyArchivedFilter(query, "is_archived", false, true);
    expect(query.calls).toEqual([]);
  });
});
