import type { PostgrestError } from "@supabase/supabase-js";
import { AppError, NotFoundError, PermissionDeniedError } from "./app-error";

/**
 * Translates a Supabase/Postgrest error into an AppError with a safe,
 * user-facing message. Row Level Security rejections and "no rows" are the
 * two cases every feature built on top of Supabase will hit routinely.
 */
export function mapSupabaseError(error: PostgrestError): AppError {
  // PostgREST: no rows found for .single()/.maybeSingle().
  if (error.code === "PGRST116") {
    return new NotFoundError(undefined, error);
  }

  // Postgres: insufficient_privilege, typically an RLS policy rejection.
  if (error.code === "42501") {
    return new PermissionDeniedError(undefined, error);
  }

  return new AppError("Something went wrong while accessing your data.", {
    code: "unknown_error",
    cause: error,
  });
}
