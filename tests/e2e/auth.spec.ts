import { expect, test } from "@playwright/test";
import { waitForEmailLink } from "./support/mailpit";

/**
 * Exercises every required auth flow (see docs/implementation-status.md and
 * docs/manual-test-checklist.md §1) against the real local Supabase stack —
 * signInWithPassword/signUp/resetPasswordForEmail/updateUser all run for
 * real, and the password-reset test drives the actual emailed link through
 * the local Mailpit inbox (see docs/local-supabase.md) rather than stubbing
 * it out. Each test uses a freshly generated email where it mutates
 * account state, so tests remain independent under `fullyParallel`.
 */

const DEMO_EMAIL = "demo@dhanos.local";
const DEMO_PASSWORD = "password123";

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dhanos.local`;
}

/** On /app, "Sign out" lives inside the header's user menu (see src/components/shell/user-menu.tsx). */
async function signOutFromAppShell(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

test.describe("protected routes", () => {
  test("redirects an unauthenticated visitor to /login, preserving the destination", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to DhanOS" }),
    ).toBeVisible();
  });

  test("protects every authenticated route by default, not just ones with a page-level check", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  });

  test("sends a signed-out visitor to /forgot-password instead of /login for /reset-password", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});

test.describe("sign in", () => {
  test("rejects invalid credentials with a generic, non-enumerating message", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs in, survives a refresh, redirects away from auth pages, and signs out", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // Authenticated refresh: a fresh server render must not lose the session.
    await page.reload();
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // An already-authenticated user hitting an auth-only page bounces back.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/app$/);

    // Sign out actually ends the session, re-blocking the protected route.
    await signOutFromAppShell(page);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  });

  test("ignores an unsafe next redirect and falls back to the default destination", async ({
    page,
  }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example");
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("sign up", () => {
  test("creates an account, completes onboarding, and reaches the dashboard", async ({
    page,
  }) => {
    const email = uniqueEmail("signup");

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Test User");
    await page.getByLabel("Email").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("a-strong-password-1");
    await page.getByLabel("Confirm password").fill("a-strong-password-1");
    await page.getByRole("button", { name: "Create account" }).click();

    // Local dev has [auth.email] enable_confirmations = false, so sign-up
    // returns a session immediately and lands straight on onboarding.
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "Set up your account" }),
    ).toBeVisible();

    await page.getByLabel("Full name").fill("Test User");
    await page.getByLabel("Household name").fill("Test Household");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });
});

test.describe("password reset", () => {
  test("resets a forgotten password end to end via the emailed link", async ({
    page,
  }) => {
    // A few extra seconds of headroom over the default 30s: this test does
    // more steps than most (signup, sign-out, forgot-password, a real
    // emailed round trip, sign-out, sign-in again).
    test.setTimeout(45_000);

    const email = uniqueEmail("reset");
    const originalPassword = "original-password-1";
    const newPassword = "brand-new-password-2";

    // Create a real account to reset, then sign out — forgot-password only
    // ever emails a link for an email that actually exists.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Reset Test");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(originalPassword);
    await page.getByLabel("Confirm password").fill(originalPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // The workspace shell's "Sign out" button is present on /onboarding
    // too — no need to finish onboarding just to sign out again.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();

    const link = await waitForEmailLink(email);
    await page.goto(link);

    // The recovery link exchanges its code via /auth/callback and lands here.
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();

    // This account never finished onboarding (not what this test is
    // checking), so it lands on /onboarding rather than /app — still
    // proves the reset worked: an authenticated, workspace-gated page,
    // not back at /login.
    await expect(page).toHaveURL(/\/onboarding$/);

    // Confirm the new password actually took effect, not just that the form submitted.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("shows a safe, generic message for an invalid or expired callback link", async ({
    page,
  }) => {
    await page.goto("/auth/callback?type=recovery&next=%2Freset-password");
    await expect(page).toHaveURL(/\/login\?error=link_expired$/);
    await expect(
      page.getByText(
        "That link has expired or was already used. Please try again.",
      ),
    ).toBeVisible();
  });
});
