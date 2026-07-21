import type {
  PostgrestError,
  PostgrestMaybeSingleResponse,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/errors/app-error";
import { unwrapList, unwrapSingle } from "./query";

function fakeError(code: string): PostgrestError {
  const base = {
    name: "PostgrestError",
    message: "boom",
    details: "",
    hint: "",
    code,
  };
  return { ...base, toJSON: () => base } as PostgrestError;
}

describe("unwrapSingle", () => {
  it("returns the row when present", () => {
    const response = {
      success: true,
      data: { id: "1" },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies PostgrestSingleResponse<{ id: string }>;

    expect(unwrapSingle(response)).toEqual({ id: "1" });
  });

  it("throws NotFoundError when a maybeSingle() query finds no row", () => {
    const response = {
      success: true,
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } satisfies PostgrestMaybeSingleResponse<{ id: string }>;

    expect(() => unwrapSingle(response)).toThrow(NotFoundError);
  });

  it("maps a Postgrest error to an AppError", () => {
    const response = {
      success: false,
      data: null,
      error: fakeError("42501"),
      count: null,
      status: 403,
      statusText: "Forbidden",
    } satisfies PostgrestSingleResponse<{ id: string }>;

    expect(() => unwrapSingle(response)).toThrow(/permission/i);
  });
});

describe("unwrapList", () => {
  it("returns the rows when present", () => {
    const response = {
      success: true,
      data: [{ id: "1" }, { id: "2" }],
      error: null,
      count: 2,
      status: 200,
      statusText: "OK",
    } satisfies PostgrestResponse<{ id: string }>;

    expect(unwrapList(response)).toHaveLength(2);
  });

  it("returns an empty array rather than throwing when there are no rows", () => {
    const response = {
      success: true,
      data: [],
      error: null,
      count: 0,
      status: 200,
      statusText: "OK",
    } satisfies PostgrestResponse<{ id: string }>;

    expect(unwrapList(response)).toEqual([]);
  });
});
