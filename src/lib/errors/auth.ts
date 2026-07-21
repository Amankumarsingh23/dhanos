import type { AuthError } from "@supabase/supabase-js";

/**
 * Translates a Supabase Auth error into a safe, user-facing message.
 * Deliberately generic for credential-related failures (see
 * docs/security-model.md §3, §6) — never confirms whether a given email is
 * registered, and never surfaces the raw provider error message to the
 * client.
 */
export function mapAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "email_not_confirmed":
      return "Please verify your email address before signing in.";
    case "user_already_exists":
    case "email_exists":
    case "identity_already_exists":
      return "An account with that email already exists.";
    case "weak_password":
      return "That password is too weak — use a longer, less predictable one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a minute and try again.";
    case "otp_expired":
    case "bad_code_verifier":
    case "flow_state_expired":
    case "flow_state_not_found":
      return "That link has expired or was already used. Please request a new one.";
    case "same_password":
      return "Your new password must be different from your current one.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Sign-up is currently disabled.";
    default:
      return "Something went wrong. Please try again.";
  }
}
