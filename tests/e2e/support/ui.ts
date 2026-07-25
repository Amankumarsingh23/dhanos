import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dhanos.local`;
}

/**
 * Signs up a brand-new browser-authenticated user and completes onboarding,
 * landing on the dashboard — the shared first step of every journey test
 * below (mirrors tests/e2e/auth.spec.ts's "sign up" test, factored out so
 * every journey gets its own fresh, isolated household rather than sharing
 * fixture state across tests).
 */
export async function signUpAndOnboard(
  page: Page,
  label: string,
  householdName = `${label} Household`,
): Promise<{ email: string }> {
  const email = uniqueEmail(label);

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a-strong-password-1");
  await page.getByLabel("Confirm password").fill("a-strong-password-1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Full name").fill("Test User");
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  return { email };
}

/** On /app, "Sign out" lives inside the header's user menu (see src/components/shell/user-menu.tsx). */
export async function signOutFromAppShell(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

/** A tiny, valid in-memory PDF-shaped buffer — real bytes, no fixture file on disk needed. */
export function fakePdfFile(name = "test-document.pdf") {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%fake test content for e2e upload\n"),
  };
}
