import { describe, expect, it } from "vitest";
import { institutionInputSchema } from "./institutions";

describe("institutionInputSchema", () => {
  it("accepts a minimal valid institution", () => {
    const result = institutionInputSchema.safeParse({
      name: "HDFC Bank",
      institutionType: "bank",
    });
    expect(result.success).toBe(true);
  });

  it("defaults confirmDuplicate to false", () => {
    const result = institutionInputSchema.parse({
      name: "HDFC Bank",
      institutionType: "bank",
    });
    expect(result.confirmDuplicate).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "  ",
        institutionType: "bank",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown institution type", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "crypto_exchange",
      }).success,
    ).toBe(false);
  });

  it("accepts a bare domain or a full URL as a website", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        website: "hdfcbank.com",
      }).success,
    ).toBe(true);
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        website: "https://www.hdfcbank.com/personal/support",
      }).success,
    ).toBe(true);
  });

  it("rejects a website with no dot", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        website: "not a url",
      }).success,
    ).toBe(false);
  });

  it("accepts a support email and rejects a malformed one", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        supportEmail: "support@hdfcbank.com",
      }).success,
    ).toBe(true);
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        supportEmail: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("accepts a support phone and rejects one with letters", () => {
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        supportPhone: "+91 1800-266-4332",
      }).success,
    ).toBe(true);
    expect(
      institutionInputSchema.safeParse({
        name: "HDFC Bank",
        institutionType: "bank",
        supportPhone: "call us maybe",
      }).success,
    ).toBe(false);
  });
});
