import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  createDocumentSchema,
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_SIZE_BYTES,
} from "./documents";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function validInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    documentId: VALID_UUID,
    displayName: "Salary slip — July 2026",
    category: "salary_slip",
    storagePath: `${VALID_UUID}/salary_slip/${VALID_UUID}.pdf`,
    originalFilename: "salary-slip-july.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    ...overrides,
  };
}

describe("isAllowedDocumentMimeType", () => {
  it("accepts every MIME type in the allowlist", () => {
    for (const mime of ALLOWED_DOCUMENT_MIME_TYPES) {
      expect(isAllowedDocumentMimeType(mime)).toBe(true);
    }
  });

  it("rejects an executable/script MIME type", () => {
    expect(isAllowedDocumentMimeType("application/x-msdownload")).toBe(false);
    expect(isAllowedDocumentMimeType("application/javascript")).toBe(false);
    expect(isAllowedDocumentMimeType("text/html")).toBe(false);
  });

  it("rejects an empty or malformed value", () => {
    expect(isAllowedDocumentMimeType("")).toBe(false);
    expect(isAllowedDocumentMimeType("not-a-mime-type")).toBe(false);
  });
});

describe("createDocumentSchema", () => {
  it("accepts a minimal valid document", () => {
    const result = createDocumentSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects a disallowed MIME type (e.g. an executable) even with a valid size", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ mimeType: "application/x-msdownload" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a file at exactly one byte over the 25 MB cap", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a file at exactly the 25 MB cap", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ sizeBytes: MAX_DOCUMENT_SIZE_BYTES }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a zero-byte file", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ sizeBytes: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a negative size (a malformed/tampered upload report)", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ sizeBytes: -1 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer size", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ sizeBytes: 1024.5 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown document category", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ category: "x-ray" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a blank display name", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ displayName: "   " }),
    );
    expect(result.success).toBe(false);
  });

  it("requires entityId whenever entityType is set, and vice versa", () => {
    expect(
      createDocumentSchema.safeParse(validInput({ entityType: "asset" }))
        .success,
    ).toBe(false);
    expect(
      createDocumentSchema.safeParse(validInput({ entityId: VALID_UUID }))
        .success,
    ).toBe(false);
    expect(
      createDocumentSchema.safeParse(
        validInput({ entityType: "asset", entityId: VALID_UUID }),
      ).success,
    ).toBe(true);
  });

  it("rejects a non-uuid documentId", () => {
    const result = createDocumentSchema.safeParse(
      validInput({ documentId: "not-a-uuid" }),
    );
    expect(result.success).toBe(false);
  });
});
