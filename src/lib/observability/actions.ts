"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { logError } from "./logger";
import {
  clientErrorReportSchema,
  type ClientErrorReportInput,
} from "./client-error-report";

/**
 * Called from the client error boundaries (src/app/error.tsx,
 * src/app/global-error.tsx) so a render-time failure a user actually hit
 * is logged server-side, not just shown-and-forgotten. Never throws back
 * to the caller — a failure to report an error must never itself surface
 * as a second error.
 */
export async function reportClientErrorAction(
  input: ClientErrorReportInput,
): Promise<void> {
  const parsed = clientErrorReportSchema.safeParse(input);
  if (!parsed.success) return;

  try {
    const user = await getCurrentUser();
    await logError("client.render_error", new Error(parsed.data.message), {
      digest: parsed.data.digest,
      pathname: parsed.data.pathname,
      userId: user?.id,
    });
  } catch {
    // Reporting the error must never throw — swallow deliberately.
  }
}
