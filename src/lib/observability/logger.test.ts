import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, PermissionDeniedError } from "@/lib/errors/app-error";
import { logError, redact } from "./logger";

describe("redact", () => {
  it("redacts a bearer token", () => {
    expect(redact("Authorization: Bearer abc.def.ghi")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("redacts a JWT-shaped string on its own", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(jwt)).toBe("[redacted-jwt]");
  });

  it("redacts a signed-URL token query param", () => {
    expect(
      redact(
        "https://x.supabase.co/storage/v1/object/sign/documents/a.pdf?token=abcdef123456",
      ),
    ).toBe(
      "https://x.supabase.co/storage/v1/object/sign/documents/a.pdf?token=[redacted]",
    );
  });

  it("redacts a long digit run (account/card-number shaped)", () => {
    expect(redact("account 123456789012 overdrawn")).toBe(
      "account [redacted-number] overdrawn",
    );
  });

  it("leaves an ordinary safe message untouched", () => {
    expect(redact("Something went wrong while accessing your data.")).toBe(
      "Something went wrong while accessing your data.",
    );
  });
});

describe("logError", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs an unexpected error at 'error' level with a structured JSON line", async () => {
    await logError("test.deliberate_error", new Error("boom"), {
      householdId: "hh-1",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(line).toMatchObject({
      level: "error",
      event: "test.deliberate_error",
      errorName: "Error",
      errorMessage: "boom",
      householdId: "hh-1",
    });
    expect(line.requestId).toBeTruthy();
    expect(line.environment).toBeTruthy();
    expect(line.release).toBeTruthy();
    expect(line.timestamp).toBeTruthy();
  });

  it("extracts .message from a non-Error thrown value instead of '[object Object]'", async () => {
    await logError("test.non_error", { message: "fetch failed", code: 500 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(line.errorName).toBe("NonError");
    expect(line.errorMessage).toBe("fetch failed");
  });

  it("logs a permission_denied AppError at 'warn' level", async () => {
    await logError("test.authz", new PermissionDeniedError());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
    expect(line.level).toBe("warn");
    expect(line.errorCode).toBe("permission_denied");
  });

  it("logs an expected AppError (e.g. not_found) at 'info' level", async () => {
    await logError("test.not_found", new NotFoundError());

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(line.level).toBe("info");
    expect(line.errorCode).toBe("not_found");
  });

  it("never logs the raw context object shape beyond its own flat fields — no nested objects can be passed", async () => {
    await logError("test.shape", new Error("boom"), {
      transactionId: "tx-1",
      // @ts-expect-error — LogContext is intentionally primitive-only.
      nested: { secret: "should not typecheck" },
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
