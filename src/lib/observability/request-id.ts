import { headers } from "next/headers";
import { REQUEST_ID_HEADER } from "./constants";

export { REQUEST_ID_HEADER };

/**
 * Reads the correlation ID `updateSession` (src/lib/supabase/middleware.ts)
 * generated for this request. Falls back to a fresh ID rather than
 * "unknown" when middleware didn't run for some reason (e.g. a unit test
 * calling a Server Action directly) — every log line still gets *a* stable
 * ID, even if it can't be correlated to a specific inbound HTTP request.
 */
export async function getRequestId(): Promise<string> {
  try {
    const requestHeaders = await headers();
    return requestHeaders.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}
