import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./safe-redirect";

describe("getSafeRedirectPath", () => {
  it("allows a plain same-origin path", () => {
    expect(getSafeRedirectPath("/onboarding")).toBe("/onboarding");
  });

  it("preserves query string and hash on an allowed path", () => {
    expect(getSafeRedirectPath("/app?tab=accounts#section")).toBe(
      "/app?tab=accounts#section",
    );
  });

  it("falls back when the value is missing", () => {
    expect(getSafeRedirectPath(null)).toBe("/app");
    expect(getSafeRedirectPath(undefined)).toBe("/app");
    expect(getSafeRedirectPath("")).toBe("/app");
  });

  it("honors a custom fallback", () => {
    expect(getSafeRedirectPath(null, "/reset-password")).toBe(
      "/reset-password",
    );
  });

  it("rejects an absolute external URL", () => {
    expect(getSafeRedirectPath("https://evil.example/phish")).toBe("/app");
    expect(getSafeRedirectPath("http://evil.example")).toBe("/app");
  });

  it("rejects a protocol-relative external URL", () => {
    expect(getSafeRedirectPath("//evil.example")).toBe("/app");
    expect(getSafeRedirectPath("///evil.example")).toBe("/app");
  });

  it("rejects a backslash trick that browsers treat as protocol-relative", () => {
    expect(getSafeRedirectPath("/\\evil.example")).toBe("/app");
    expect(getSafeRedirectPath("/\\/evil.example")).toBe("/app");
  });

  it("rejects a non-http(s) scheme masquerading as a path", () => {
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects a value with embedded control characters", () => {
    expect(getSafeRedirectPath("/\t/evil.example")).toBe("/app");
  });

  it("rejects a value not starting with a slash", () => {
    expect(getSafeRedirectPath("app")).toBe("/app");
    expect(getSafeRedirectPath(" /app")).toBe("/app");
  });

  it("allows a same-origin path containing an encoded slash", () => {
    expect(getSafeRedirectPath("/reports/%2Fweird")).toBe("/reports/%2Fweird");
  });
});
