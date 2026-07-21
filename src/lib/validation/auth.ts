import { z } from "zod";

/**
 * Shared zod schemas for auth forms and their matching Server Actions —
 * same schema, client-side validation (react-hook-form) and server-side
 * re-validation, per docs/architecture.md §5. Never trust client input
 * without re-checking it here on the server.
 */

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address");

// Mirrors supabase/config.toml [auth] minimum_password_length — keep in
// sync if that value changes.
export const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .min(8, "Password must be at least 8 characters");

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "Full name is required")
  .max(200, "Full name is too long");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

// Matches the currency exponent table in src/lib/money/currency.ts —
// deliberately not importing it here (see src/lib/validation/primitives.ts'
// dependency-free convention); the regex alone is enough to validate shape.
const currencyCodePattern = /^[A-Za-z]{3}$/;

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Household name is required")
  .max(200, "Household name is too long");

export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  householdName: householdNameSchema,
  timezone: z.string().min(1, "Timezone is required"),
  locale: z.string().min(1, "Locale is required"),
  // Shared between profiles.default_currency_code (personal display) and
  // households.base_currency_code (shared reporting base) — one field in
  // the onboarding form, two columns underneath. See
  // src/features/auth/actions.ts' completeOnboardingAction.
  baseCurrencyCode: z
    .string()
    .regex(currencyCodePattern, "Must be a 3-letter ISO 4217 currency code")
    .transform((value) => value.toUpperCase()),
  // Day of the month the household's "financial month" starts on; capped
  // at 28 so every calendar month has that day. 1 = calendar months,
  // mirroring households.financial_month_start_day's default. Plain
  // z.number() (not z.coerce) so the form's TS type matches react-hook-form's
  // `valueAsNumber` field option — see OnboardingForm's registration.
  financialMonthStartDay: z
    .number({ error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be between 1 and 28")
    .max(28, "Must be between 1 and 28"),
});
export type OnboardingValues = z.infer<typeof onboardingSchema>;
