import { describe, expect, it } from "vitest";
import {
  addMoney,
  allocateMoney,
  calculateRatio,
  compareMoney,
  createMoney,
  formatMoney,
  formatPercentage,
  isZeroMoney,
  negateMoney,
  parseDecimalToMinorUnits,
  subtractMoney,
  sumMoney,
} from "./index";

describe("createMoney", () => {
  it("accepts an integer minor-unit amount with a valid currency code", () => {
    const money = createMoney(10025, "INR");
    expect(money).toEqual({ amountMinorUnits: 10025, currencyCode: "INR" });
  });

  it("uppercases the currency code", () => {
    expect(createMoney(100, "inr").currencyCode).toBe("INR");
  });

  it("rejects non-integer amounts", () => {
    expect(() => createMoney(100.5, "INR")).toThrow(/safe integers/);
  });

  it("rejects amounts that are not safe integers", () => {
    expect(() => createMoney(Number.MAX_SAFE_INTEGER + 10, "INR")).toThrow();
  });

  it("rejects invalid currency codes", () => {
    expect(() => createMoney(100, "RUPEES")).toThrow(/ISO 4217/);
  });
});

describe("arithmetic", () => {
  it("adds two amounts in the same currency", () => {
    const result = addMoney(createMoney(10025, "INR"), createMoney(75, "INR"));
    expect(result).toEqual({ amountMinorUnits: 10100, currencyCode: "INR" });
  });

  it("throws when adding mismatched currencies", () => {
    expect(() =>
      addMoney(createMoney(100, "INR"), createMoney(100, "USD")),
    ).toThrow(/different currencies/);
  });

  it("subtracts amounts in the same currency", () => {
    const result = subtractMoney(
      createMoney(500, "INR"),
      createMoney(200, "INR"),
    );
    expect(result.amountMinorUnits).toBe(300);
  });

  it("negates an amount", () => {
    expect(negateMoney(createMoney(500, "INR")).amountMinorUnits).toBe(-500);
  });

  it("reports zero correctly, including after cancelling amounts out", () => {
    const cancelled = addMoney(
      createMoney(500, "INR"),
      createMoney(-500, "INR"),
    );
    expect(isZeroMoney(cancelled)).toBe(true);
    expect(isZeroMoney(createMoney(1, "INR"))).toBe(false);
  });

  it("compares amounts in the same currency", () => {
    expect(
      compareMoney(createMoney(100, "INR"), createMoney(200, "INR")),
    ).toBeLessThan(0);
    expect(
      compareMoney(createMoney(200, "INR"), createMoney(100, "INR")),
    ).toBeGreaterThan(0);
    expect(compareMoney(createMoney(100, "INR"), createMoney(100, "INR"))).toBe(
      0,
    );
  });

  it("sums a list of amounts", () => {
    const total = sumMoney(
      [
        createMoney(100, "INR"),
        createMoney(250, "INR"),
        createMoney(-50, "INR"),
      ],
      "INR",
    );
    expect(total.amountMinorUnits).toBe(300);
  });

  it("never produces float drift for classic float-unsafe values (e.g. 0.1 + 0.2)", () => {
    // 10 paise + 20 paise, expressed as integers, must equal exactly 30 paise —
    // unlike 0.1 + 0.2 in native floating point.
    const result = addMoney(createMoney(10, "INR"), createMoney(20, "INR"));
    expect(result.amountMinorUnits).toBe(30);
  });
});

describe("formatMoney", () => {
  it("formats INR paise as rupees with 2 decimal places", () => {
    expect(formatMoney(createMoney(10025, "INR"))).toBe("₹100.25");
  });

  it("formats JPY with zero decimal places (no minor unit)", () => {
    expect(formatMoney(createMoney(1500, "JPY"), "en-US")).toBe("¥1,500");
  });

  it("does not mutate the original amount when formatting", () => {
    const money = createMoney(10025, "INR");
    formatMoney(money);
    expect(money.amountMinorUnits).toBe(10025);
  });
});

describe("parseDecimalToMinorUnits", () => {
  it("parses ₹0.01 as 1 paisa", () => {
    expect(parseDecimalToMinorUnits("0.01", "INR")).toBe(1);
  });

  it("parses ₹1 (no fraction) as 100 paise", () => {
    expect(parseDecimalToMinorUnits("1", "INR")).toBe(100);
  });

  it("parses ₹100.25 as 10025 paise", () => {
    expect(parseDecimalToMinorUnits("100.25", "INR")).toBe(10025);
  });

  it("parses a large value without float drift", () => {
    expect(parseDecimalToMinorUnits("999999999999.99", "INR")).toBe(
      99999999999999,
    );
  });

  it("accepts thousands-grouping commas", () => {
    expect(parseDecimalToMinorUnits("1,234.50", "INR")).toBe(123450);
  });

  it("parses a negative amount", () => {
    expect(parseDecimalToMinorUnits("-50.00", "INR")).toBe(-5000);
  });

  it("respects a currency's minor-unit exponent (JPY has none)", () => {
    expect(parseDecimalToMinorUnits("1500", "JPY")).toBe(1500);
  });

  it("respects a currency with 3 decimal places (BHD)", () => {
    expect(parseDecimalToMinorUnits("1.234", "BHD")).toBe(1234);
  });

  it("rejects an empty string", () => {
    expect(() => parseDecimalToMinorUnits("", "INR")).toThrow(
      /enter an amount/i,
    );
  });

  it("rejects non-numeric input", () => {
    expect(() => parseDecimalToMinorUnits("abc", "INR")).toThrow(
      /not a valid amount/i,
    );
  });

  it("rejects more decimal places than the currency supports", () => {
    expect(() => parseDecimalToMinorUnits("100.255", "INR")).toThrow(
      /more decimal places/i,
    );
  });

  it("rejects a bare decimal point with no leading digit", () => {
    expect(() => parseDecimalToMinorUnits(".5", "INR")).toThrow();
  });

  it("rejects a value too large to represent safely", () => {
    expect(() =>
      parseDecimalToMinorUnits("999999999999999999.99", "INR"),
    ).toThrow(/too large/i);
  });
});

describe("formatPercentage", () => {
  it("formats a fraction as a percentage", () => {
    expect(formatPercentage(0.1, { locale: "en-US" })).toBe("10%");
  });

  it("respects maximumFractionDigits", () => {
    expect(
      formatPercentage(0.12345, { locale: "en-US", maximumFractionDigits: 2 }),
    ).toBe("12.35%");
  });
});

describe("calculateRatio", () => {
  it("computes the ratio of two same-currency amounts", () => {
    expect(
      calculateRatio(createMoney(50, "INR"), createMoney(200, "INR")),
    ).toBe(0.25);
  });

  it("returns 0 rather than NaN/Infinity for a zero denominator", () => {
    expect(calculateRatio(createMoney(50, "INR"), createMoney(0, "INR"))).toBe(
      0,
    );
  });

  it("throws when comparing mismatched currencies", () => {
    expect(() =>
      calculateRatio(createMoney(50, "INR"), createMoney(50, "USD")),
    ).toThrow(/different currencies/);
  });
});

describe("allocateMoney", () => {
  it("splits an even amount exactly by weight", () => {
    const shares = allocateMoney(createMoney(10000, "INR"), [50, 30, 20]);
    expect(shares.map((s) => s.amountMinorUnits)).toEqual([5000, 3000, 2000]);
  });

  it("distributes remainder minor units so the total always reconciles exactly", () => {
    const total = createMoney(10001, "INR");
    const shares = allocateMoney(total, [1, 1, 1]);
    const sum = shares.reduce((acc, s) => acc + s.amountMinorUnits, 0);
    expect(sum).toBe(10001);
    // Every share is within 1 minor unit of an even three-way split.
    for (const share of shares) {
      expect(Math.abs(share.amountMinorUnits - 10001 / 3)).toBeLessThan(2);
    }
  });

  it("preserves currency on every allocated share", () => {
    const shares = allocateMoney(createMoney(300, "USD"), [1, 2]);
    expect(shares.every((s) => s.currencyCode === "USD")).toBe(true);
  });

  it("handles a negative total by allocating negative shares", () => {
    const shares = allocateMoney(createMoney(-10000, "INR"), [1, 1]);
    expect(shares.map((s) => s.amountMinorUnits)).toEqual([-5000, -5000]);
  });

  it("rejects an empty weights array", () => {
    expect(() => allocateMoney(createMoney(100, "INR"), [])).toThrow(
      /zero shares/,
    );
  });

  it("rejects a negative weight", () => {
    expect(() => allocateMoney(createMoney(100, "INR"), [1, -1])).toThrow(
      /must not be negative/,
    );
  });

  it("rejects weights that sum to zero", () => {
    expect(() => allocateMoney(createMoney(100, "INR"), [0, 0])).toThrow(
      /must sum to a positive number/,
    );
  });
});
