import { expect, test } from "@playwright/test";
import { signOutFromAppShell, signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Authentication" journey, as one continuous chain:
 * signup, onboarding, dashboard, logout, login. tests/e2e/auth.spec.ts
 * already covers each of these pieces individually and in more depth
 * (invalid credentials, unsafe redirects, session survival across a
 * refresh, etc.) — this test proves the whole sequence works end to end
 * in a single real session, back to back, the way an actual new user
 * would experience it.
 */

test.describe("authentication journey", () => {
  test("signs up, completes onboarding, reaches the dashboard, logs out, and logs back in", async ({
    page,
  }) => {
    const { email } = await signUpAndOnboard(page, "auth-journey");

    await signOutFromAppShell(page);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a-strong-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });
});
