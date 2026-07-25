import { isAppError, type AppErrorCode } from "@/lib/errors/app-error";
import { getEnvironment, getRelease } from "./environment";
import { getRequestId } from "./request-id";

/**
 * Structured logging (see docs/observability.md). Every log line is a
 * single JSON object written to stdout/stderr — the format every log
 * aggregator (Vercel's own log drain included) expects, and one that keeps
 * a deliberate test error greppable by requestId/message rather than
 * scattered across a multi-line stack trace.
 *
 * `context` is deliberately flat and primitive-valued (never a nested
 * object or array) — that shape makes it structurally impossible to pass
 * a raw financial record, uploaded file, or transaction description
 * through it "by accident"; every field is something a caller had to name
 * explicitly, and it should only ever be IDs/codes/counts, never free text
 * a user typed. See the "never log" list in docs/observability.md.
 */
export type LogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

type LogLevel = "info" | "warn" | "error";

/** AppError codes that are expected, routine rejections — not bugs to page anyone over. */
const EXPECTED_ERROR_CODES: readonly AppErrorCode[] = [
  "validation_error",
  "not_found",
  "conflict",
  "rate_limited",
];

/**
 * Strips substrings that look like a bearer token/JWT, a long digit run
 * (account/card-number shaped), or a Supabase signed-URL token param, as a
 * defense-in-depth backstop — call sites should never be passing these in
 * to begin with, but an underlying driver error's message occasionally
 * echoes back a value it shouldn't.
 */
export function redact(input: string): string {
  return input
    .replace(/Bearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted-jwt]")
    .replace(/([?&]token=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/\b\d{8,}\b/g, "[redacted-number]");
}

function baseFields(requestId: string) {
  return {
    timestamp: new Date().toISOString(),
    environment: getEnvironment(),
    release: getRelease(),
    requestId,
  };
}

function write(level: LogLevel, line: Record<string, unknown>) {
  const payload = JSON.stringify({ level, ...line });
  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

/** Logs a discrete event (not a failure) — e.g. a health check result, a scheduled job's outcome. */
export async function logEvent(
  event: string,
  context?: LogContext,
): Promise<void> {
  const requestId = await getRequestId();
  write("info", { event, ...baseFields(requestId), ...context });
}

/**
 * Logs a caught error with a consistent shape. Severity is derived from
 * the error itself: an expected AppError (validation/not-found/conflict/
 * rate-limited) logs at "info" — it's normal user-facing rejection, not a
 * bug; `permission_denied` logs at "warn" — see docs/observability.md's
 * "authorization failure monitoring"; anything else (an unmapped AppError,
 * or a raw thrown error/bug) logs at "error".
 *
 * Only `error.name`/`error.message` and, when present, `cause`'s
 * name/message are logged — never the full arbitrary object a `throw`
 * site might have used, and both strings are run through `redact()` first.
 * AppError's own `.message` is already the same safe, user-facing string
 * shown in the UI (see src/lib/errors/app-error.ts); the `cause` (e.g. the
 * underlying PostgrestError) is server-only and never rendered.
 */
export async function logError(
  event: string,
  error: unknown,
  context?: LogContext,
): Promise<void> {
  const requestId = await getRequestId();
  const level = severityFor(error);

  const errorFields =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: redact(error.message),
          ...(isAppError(error) ? { errorCode: error.code } : {}),
          ...causeFields(error.cause),
        }
      : { errorName: "NonError", errorMessage: redact(describeNonError(error)) };

  write(level, { event, ...baseFields(requestId), ...context, ...errorFields });
}

/**
 * A `throw`n value that isn't a real `Error` (e.g. a plain
 * `{ message, code }` object some driver rejected a promise with) — a
 * bare `String(error)` on a plain object is just "[object Object]", so
 * this pulls out a `.message` field if there is one, falling back to a
 * bounded JSON dump so the log line is still useful.
 */
function describeNonError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

function causeFields(cause: unknown): Record<string, string> {
  if (!(cause instanceof Error)) return {};
  return {
    causeName: cause.name,
    causeMessage: redact(cause.message),
  };
}

function severityFor(error: unknown): LogLevel {
  if (isAppError(error)) {
    if (error.code === "permission_denied") return "warn";
    if (EXPECTED_ERROR_CODES.includes(error.code)) return "info";
  }
  return "error";
}
