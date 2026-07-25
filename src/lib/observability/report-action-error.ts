import { toUserMessage } from "@/lib/errors/app-error";
import { logError, type LogContext } from "./logger";

/**
 * Drop-in replacement for `toUserMessage(error)` in a Server Action's
 * catch block: logs the failure server-side (see docs/observability.md)
 * and returns the exact same safe, user-facing message `toUserMessage`
 * always produced, so `actionError(reportActionError(error, "..."))` is a
 * mechanical swap for `actionError(toUserMessage(error))` everywhere that
 * pattern appears.
 *
 * `action` should be a short, stable, dot-namespaced label (e.g.
 * "documents.upload", "imports.commit", "reminders.sync") — it's the
 * primary thing a deliberate test error is found by by (see the
 * acceptance criteria in docs/observability.md).
 */
export function reportActionError(
  error: unknown,
  action: string,
  context?: LogContext,
): string {
  // Fire-and-forget: logging must never make a failed mutation fail harder
  // or slower waiting on a log write.
  void logError(action, error, context);
  return toUserMessage(error);
}
