import { expect, test } from "@playwright/test";

/**
 * Foundation-level smoke tests for routes that don't depend on auth state.
 * See tests/e2e/auth.spec.ts for the full sign-up/sign-in/reset/sign-out
 * flows, which do need the live local Supabase stack (see
 * docs/local-supabase.md).
 */

test("home page renders and links to sign-in and sign-up", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "DhanOS" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Financial modules aren't built yet" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("login page renders the form and validates required fields", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Sign in to DhanOS" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Email is required")).toBeVisible();
  await expect(page.getByText("Password is required")).toBeVisible();
});

test("signup page renders and validates required fields", async ({ page }) => {
  await page.goto("/signup");

  await expect(
    page.getByRole("heading", { name: "Create your DhanOS account" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Full name is required")).toBeVisible();
  await expect(page.getByText("Email is required")).toBeVisible();
});
