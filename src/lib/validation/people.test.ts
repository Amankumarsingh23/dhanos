import { describe, expect, it } from "vitest";
import { personInputSchema } from "./people";

describe("personInputSchema", () => {
  it("accepts a minimal valid person", () => {
    const result = personInputSchema.safeParse({
      displayName: "Priya Sharma",
      relationshipType: "spouse",
    });
    expect(result.success).toBe(true);
  });

  it("accepts 'self' as a relationship type", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "Me",
        relationshipType: "self",
      }).success,
    ).toBe(true);
  });

  it("rejects a blank display name", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "   ",
        relationshipType: "parent",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown relationship type", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "Someone",
        relationshipType: "cousin",
      }).success,
    ).toBe(false);
  });

  it("accepts an optional birth date", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "Arjun",
        relationshipType: "dependant",
        birthDate: "2015-04-02",
      }).success,
    ).toBe(true);
  });

  it("accepts a null birth date", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "Arjun",
        relationshipType: "dependant",
        birthDate: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed birth date", () => {
    expect(
      personInputSchema.safeParse({
        displayName: "Arjun",
        relationshipType: "dependant",
        birthDate: "04/02/2015",
      }).success,
    ).toBe(false);
  });
});
