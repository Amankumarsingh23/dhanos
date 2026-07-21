import { expect, test } from "@playwright/test";

/**
 * Exercises the authenticated app shell (PROMPT 5): nested-route
 * refresh/direct-load, unauthorized access to nested routes, privacy mode
 * across multiple cards (and that it survives a refresh via its cookie —
 * no hydration mismatch), mobile navigation, and that no amount ever ends
 * up in the document title. Signs in as the seeded demo user
 * (demo@dhanos.local — see supabase/seed.sql), which already has a
 * completed profile and household from onboarding.
 */

const DEMO_EMAIL = "demo@dhanos.local";
const DEMO_PASSWORD = "password123";

async function signInAsDemo(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test.describe("unauthorized access", () => {
  for (const path of ["/app", "/app/accounts", "/app/settings", "/app/goals"]) {
    test(`redirects a signed-out visitor away from ${path} — the shell never renders`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toHaveCount(0);
    });
  }
});

test.describe("nested navigation", () => {
  test("direct-loading and refreshing a nested route both work", async ({
    page,
  }) => {
    await signInAsDemo(page);
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    await page.goto("/app/investments");
    await expect(
      page.getByRole("heading", { name: "Investments", level: 1 }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole("link", { name: "Investments" }),
    ).toHaveAttribute("aria-current", "page");

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Investments", level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/app\/investments$/);
  });

  test("marks the active section via aria-current as navigation changes", async ({
    page,
  }) => {
    await signInAsDemo(page);
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    await primaryNav.getByRole("link", { name: "Debts" }).click();
    await expect(page).toHaveURL(/\/app\/debts$/);
    await expect(
      primaryNav.getByRole("link", { name: "Debts" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      primaryNav.getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("privacy mode", () => {
  test("conceals amounts across every dashboard card and survives a refresh", async ({
    page,
  }) => {
    await signInAsDemo(page);

    // Real money value from the seeded net-worth snapshot (supabase/seed.sql).
    await expect(page.getByText("₹").first()).toBeVisible();
    const amountCount = await page
      .locator('[data-sensitive="revealed"]')
      .count();
    expect(amountCount).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Hide balances" }).click();

    await expect(page.locator('[data-sensitive="revealed"]')).toHaveCount(0);
    const concealedCount = await page
      .locator('[data-sensitive="concealed"]')
      .count();
    expect(concealedCount).toBe(amountCount);
    await expect(page.getByText("Amount hidden").first()).toBeVisible();

    // Cookie-backed, read on the server — must survive a real refresh with
    // no flash of revealed amounts (no hydration mismatch either).
    await page.reload();
    await expect(page.locator('[data-sensitive="revealed"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Show balances" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show balances" }).click();
    await expect(page.locator('[data-sensitive="concealed"]')).toHaveCount(0);
  });

  test("never puts a concealed or revealed amount in the document title", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await expect(page).toHaveTitle("Dashboard — DhanOS");
    expect(await page.title()).not.toMatch(/\d/);

    await page.getByRole("button", { name: "Hide balances" }).click();
    await expect(page).toHaveTitle("Dashboard — DhanOS");
    expect(await page.title()).not.toMatch(/\d/);
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens, lists every section, navigates, and closes itself", async ({
    page,
  }) => {
    await signInAsDemo(page);

    // The desktop sidebar is not in the accessibility tree on mobile.
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    for (const label of ["Dashboard", "Cash Flow", "Accounts", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }

    await nav.getByRole("link", { name: "Accounts" }).click();
    await expect(page).toHaveURL(/\/app\/accounts$/);
    await expect(nav).not.toBeVisible();
  });
});

test.describe("console health", () => {
  test("produces no console errors across dashboard, a nested route, and a refresh", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await signInAsDemo(page);
    await page.goto("/app/reports");
    await page.reload();

    expect(errors).toEqual([]);
  });
});
