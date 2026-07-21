import { describe, expect, it } from "vitest";
import {
  amountMinorUnitsSchema,
  currencyCodeSchema,
  dueDateSchema,
  householdRoleSchema,
  isoDateStringSchema,
  monthKeySchema,
  nonZeroAmountMinorUnitsSchema,
  paginationInputSchema,
  transactionDateSchema,
  uuidSchema,
  valuationDateSchema,
} from "./primitives";

describe("currencyCodeSchema", () => {
  it("accepts and uppercases a 3-letter code", () => {
    expect(currencyCodeSchema.parse("inr")).toBe("INR");
  });

  it("rejects a code that isn't 3 letters", () => {
    expect(currencyCodeSchema.safeParse("RUPEE").success).toBe(false);
  });
});

describe("amountMinorUnitsSchema", () => {
  it("accepts integer minor-unit amounts", () => {
    expect(amountMinorUnitsSchema.parse(10025)).toBe(10025);
  });

  it("rejects decimal amounts", () => {
    expect(amountMinorUnitsSchema.safeParse(100.25).success).toBe(false);
  });

  it("rejects unsafe integers", () => {
    expect(
      amountMinorUnitsSchema.safeParse(Number.MAX_SAFE_INTEGER + 10).success,
    ).toBe(false);
  });
});

describe("nonZeroAmountMinorUnitsSchema", () => {
  it("rejects a zero amount", () => {
    expect(nonZeroAmountMinorUnitsSchema.safeParse(0).success).toBe(false);
  });

  it("accepts a non-zero amount", () => {
    expect(nonZeroAmountMinorUnitsSchema.safeParse(-500).success).toBe(true);
  });
});

describe("isoDateStringSchema", () => {
  it("accepts a YYYY-MM-DD date", () => {
    expect(isoDateStringSchema.safeParse("2026-07-21").success).toBe(true);
  });

  it("rejects a non-ISO date format", () => {
    expect(isoDateStringSchema.safeParse("21/07/2026").success).toBe(false);
  });
});

describe("uuidSchema / householdRoleSchema", () => {
  it("accepts a valid UUID", () => {
    expect(
      uuidSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success,
    ).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("only accepts known household roles", () => {
    expect(householdRoleSchema.safeParse("owner").success).toBe(true);
    expect(householdRoleSchema.safeParse("admin").success).toBe(true);
    expect(householdRoleSchema.safeParse("editor").success).toBe(true);
    expect(householdRoleSchema.safeParse("viewer").success).toBe(true);
    expect(householdRoleSchema.safeParse("member").success).toBe(false);
  });
});

describe("semantic date schemas", () => {
  it("accept a well-formed YYYY-MM-DD date, same shape as isoDateStringSchema", () => {
    expect(transactionDateSchema.safeParse("2026-07-21").success).toBe(true);
    expect(dueDateSchema.safeParse("2026-07-21").success).toBe(true);
    expect(valuationDateSchema.safeParse("2026-07-21").success).toBe(true);
  });

  it("reject a malformed date the same way isoDateStringSchema does", () => {
    expect(transactionDateSchema.safeParse("21/07/2026").success).toBe(false);
    expect(dueDateSchema.safeParse("not-a-date").success).toBe(false);
    expect(valuationDateSchema.safeParse("2026-13-01").success).toBe(true); // shape-only, not calendar-validated — see toIsoDateString for real validation
  });
});

describe("monthKeySchema", () => {
  it("accepts a YYYY-MM month key", () => {
    expect(monthKeySchema.safeParse("2026-07").success).toBe(true);
    expect(monthKeySchema.safeParse("2026-12").success).toBe(true);
  });

  it("rejects an out-of-range or malformed month", () => {
    expect(monthKeySchema.safeParse("2026-13").success).toBe(false);
    expect(monthKeySchema.safeParse("2026-00").success).toBe(false);
    expect(monthKeySchema.safeParse("2026-7").success).toBe(false);
  });
});

describe("paginationInputSchema", () => {
  it("defaults page and pageSize when omitted", () => {
    expect(paginationInputSchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects a pageSize above the maximum", () => {
    expect(paginationInputSchema.safeParse({ pageSize: 101 }).success).toBe(
      false,
    );
  });

  it("rejects a non-positive page", () => {
    expect(paginationInputSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
