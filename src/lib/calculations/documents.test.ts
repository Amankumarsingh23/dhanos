import { describe, expect, it } from "vitest";
import {
  buildDocumentStoragePath,
  isDocumentExpired,
  isDocumentExpiringSoon,
  sanitizeFileName,
} from "./documents";

const REFERENCE_DATE = new Date("2026-07-23T12:00:00Z");

describe("isDocumentExpired", () => {
  it("is false when there is no expiry date", () => {
    expect(isDocumentExpired(null, REFERENCE_DATE)).toBe(false);
  });

  it("is false for today and future dates", () => {
    expect(isDocumentExpired("2026-07-23", REFERENCE_DATE)).toBe(false);
    expect(isDocumentExpired("2026-08-01", REFERENCE_DATE)).toBe(false);
  });

  it("is true for a past date", () => {
    expect(isDocumentExpired("2026-07-22", REFERENCE_DATE)).toBe(true);
    expect(isDocumentExpired("2020-01-01", REFERENCE_DATE)).toBe(true);
  });
});

describe("isDocumentExpiringSoon", () => {
  it("is false when there is no expiry date", () => {
    expect(isDocumentExpiringSoon(null, REFERENCE_DATE)).toBe(false);
  });

  it("is true within the default 30-day window, inclusive", () => {
    expect(isDocumentExpiringSoon("2026-07-23", REFERENCE_DATE)).toBe(true);
    expect(isDocumentExpiringSoon("2026-08-22", REFERENCE_DATE)).toBe(true);
  });

  it("is false just past the window", () => {
    expect(isDocumentExpiringSoon("2026-08-23", REFERENCE_DATE)).toBe(false);
  });

  it("is false for an already-expired document — mutually exclusive with isDocumentExpired", () => {
    expect(isDocumentExpiringSoon("2026-07-22", REFERENCE_DATE)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(
      isDocumentExpiringSoon("2026-08-01", REFERENCE_DATE, 5),
    ).toBe(false);
    expect(
      isDocumentExpiringSoon("2026-07-25", REFERENCE_DATE, 5),
    ).toBe(true);
  });
});

describe("sanitizeFileName", () => {
  it("keeps an ordinary filename unchanged", () => {
    expect(sanitizeFileName("bank-statement_2026.pdf")).toBe(
      "bank-statement_2026.pdf",
    );
  });

  it("strips directory components", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\file.pdf")).toBe("file.pdf");
  });

  it("strips unsafe characters but keeps spaces", () => {
    expect(sanitizeFileName("salary slip (June)#2026.pdf")).toBe(
      "salary slip June2026.pdf",
    );
  });

  it("falls back to a default name when nothing safe remains", () => {
    expect(sanitizeFileName("???///")).toBe("document");
  });
});

describe("buildDocumentStoragePath", () => {
  const householdId = "11111111-1111-1111-1111-111111111111";
  const documentId = "22222222-2222-2222-2222-222222222222";

  it("uses the entity segments when linked to an entity", () => {
    const path = buildDocumentStoragePath({
      householdId,
      documentId,
      fileName: "policy.pdf",
      entityType: "asset",
      entityId: "33333333-3333-3333-3333-333333333333",
    });
    expect(path).toBe(
      `${householdId}/asset/33333333-3333-3333-3333-333333333333/${documentId}/policy.pdf`,
    );
  });

  it("falls back to a general/household segment when standalone", () => {
    const path = buildDocumentStoragePath({
      householdId,
      documentId,
      fileName: "pan-card.pdf",
    });
    expect(path).toBe(
      `${householdId}/general/${householdId}/${documentId}/pan-card.pdf`,
    );
  });

  it("always keeps the household id as the first path segment (storage RLS relies on this)", () => {
    const path = buildDocumentStoragePath({
      householdId,
      documentId,
      fileName: "x.pdf",
      entityType: "loan",
      entityId: "44444444-4444-4444-4444-444444444444",
    });
    expect(path.split("/")[0]).toBe(householdId);
  });
});
