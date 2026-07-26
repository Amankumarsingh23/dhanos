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

  // A real bug, found live: the dialog's website/phone/email fields are
  // all optional, but react-hook-form submits an untouched text input as
  // "" — never as `undefined` — so these three fields must each accept
  // an explicit empty string, not just an omitted key. `.optional()`
  // alone does NOT cover this (it only allows `undefined` through, on
  // top of whatever the base string schema already accepts).
  it("accepts an explicit empty string for every optional field (not just an omitted key)", () => {
    const result = institutionInputSchema.safeParse({
      name: "HDFC Bank",
      institutionType: "bank",
      website: "",
      supportPhone: "",
      supportEmail: "",
      platformName: "",
      notes: "",
    });
    expect(result.success).toBe(true);
  });
});
