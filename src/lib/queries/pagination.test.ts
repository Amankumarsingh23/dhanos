import { describe, expect, it } from "vitest";
import {
  applyArchivedFilter,
  applyDeterministicOrder,
  fetchAllRows,
  FETCH_ALL_ROWS_PAGE_CAP,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
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

describe("fetchAllRows", () => {
  /** Simulates a household with `total` rows, paginated exactly like a real listX query. */
  function fakePaginatedSource(total: number) {
    const allRows = Array.from({ length: total }, (_, i) => i);
    let calls = 0;
    return {
      getCallCount: () => calls,
      fetchPage: async (pagination: {
        page: number;
        pageSize: number;
      }): Promise<Page<number>> => {
        calls += 1;
        const from = (pagination.page - 1) * pagination.pageSize;
        const to = from + pagination.pageSize + 1; // overfetch, mirroring toOverfetchRange
        const rows = allRows.slice(from, to);
        return toPage(rows, pagination);
      },
    };
  }

  it("returns every row in a single page when the household has fewer rows than one page", async () => {
    const source = fakePaginatedSource(40);
    const result = await fetchAllRows((p) => source.fetchPage(p));
    expect(result.rows).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(result.truncated).toBe(false);
    expect(source.getCallCount()).toBe(1);
  });

  it("pages through every row when a household has more than MAX_PAGE_SIZE (100) rows — the PROMPT 47 net-worth truncation case, confirmed live with 150 seeded accounts", async () => {
    const source = fakePaginatedSource(150);
    const result = await fetchAllRows((p) => source.fetchPage(p));
    expect(result.rows).toHaveLength(150);
    expect(result.rows).toEqual(Array.from({ length: 150 }, (_, i) => i));
    expect(result.truncated).toBe(false);
    expect(source.getCallCount()).toBe(2);
  });

  it("stops at the safety cap and reports truncated for a runaway/corrupt dataset", async () => {
    const total = (FETCH_ALL_ROWS_PAGE_CAP + 5) * 100;
    const source = fakePaginatedSource(total);
    const result = await fetchAllRows((p) => source.fetchPage(p));
    expect(result.truncated).toBe(true);
    expect(source.getCallCount()).toBe(FETCH_ALL_ROWS_PAGE_CAP);
    expect(result.rows).toHaveLength(FETCH_ALL_ROWS_PAGE_CAP * 100);
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
