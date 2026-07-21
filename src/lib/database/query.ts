import type {
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";
import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";

/**
 * Unwraps a single-row Supabase response (`.single()`/`.maybeSingle()`),
 * throwing a mapped AppError on failure and a NotFoundError when no row
 * exists. Every feature's data-access layer should go through this rather
 * than checking `error`/`data` ad hoc at each call site.
 */
export function unwrapSingle<T>(response: PostgrestSingleResponse<T>): T {
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  if (response.data === null) {
    throw new NotFoundError();
  }
  return response.data;
}

/**
 * Unwraps a multi-row Supabase response. An empty result set is not an
 * error — it returns `[]` rather than throwing.
 */
export function unwrapList<T>(response: PostgrestResponse<T>): T[] {
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  return response.data ?? [];
}
