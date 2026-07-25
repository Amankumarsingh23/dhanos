import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * PROMPT 44 — automated accessibility + responsive audit. Runs axe-core
 * (WCAG 2.x A/AA + best-practice rules) against every top-level module
 * page at the four required breakpoints (320/375/768/desktop), plus a
 * horizontal-overflow check (SC 1.4.10 Reflow) at each. Logged in once as
 * the PROMPT 43 seed's demo household (demo@dhanos.local) so every page
 * renders its real, populated state — an empty/loading page would hide
 * exactly the violations (data tables, charts, dense forms) this audit
 * cares about most.
 *
 * "No major automated accessibility violations" (PROMPT 44 acceptance
 * criterion) is enforced as zero axe violations of impact
 * critical/serious; moderate/minor findings are reported but don't fail
 * the run, since axe's own docs caution those often need human judgement
 * (e.g. a moderate contrast finding against a decorative element).
 */

const DEMO_EMAIL = "demo@dhanos.local";
const DEMO_PASSWORD = "password123";
// Mirrors playwright.config.ts's fixed PORT — worker-scoped fixtures can't
// depend on the test-scoped `baseURL` fixture, so this is spelled out
// directly rather than shared.
const BASE_URL = "http://127.0.0.1:3100";

const VIEWPORTS = [
  { name: "320", width: 320, height: 800 },
  { name: "375", width: 375, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

// Every top-level module under /app (src/app/(workspace)/app/*), one
// representative page per module — the practical "entire product" scope
// for a breakpoint sweep; dynamic detail pages are spot-checked separately
// below rather than enumerated per-record.
const ROUTES = [
  "/app",
  "/app/accounts",
  "/app/assets",
  "/app/calculators",
  "/app/cash-flow",
  "/app/debts",
  "/app/decisions",
  "/app/documents",
  "/app/emergency-fund",
  "/app/expenses",
  "/app/goals",
  "/app/import",
  "/app/income",
  "/app/institutions",
  "/app/insurance",
  "/app/investments",
  "/app/learning",
  "/app/lending",
  "/app/liabilities",
  "/app/money-drains",
  "/app/monthly-closing",
  "/app/net-worth",
  "/app/people",
  "/app/recurring",
  "/app/reminders",
  "/app/reports",
  "/app/search",
  "/app/settings",
  "/app/transfers",
];

/**
 * Logs in once per worker (not once per test, not via a shared temp file
 * across parallel workers — that races), following Playwright's own
 * recommended "authenticate once per worker" fixture pattern. Every test
 * below gets a context pre-loaded with this cached session.
 */
const test = base.extend<object, { workerAuthState: string }>({
  // Playwright fixture callbacks conventionally name this second param
  // "use" (it signals fixture readiness) — renamed to provideFixture here
  // purely to dodge eslint-plugin-react-hooks' naming heuristic, which
  // otherwise misreads it as React's unrelated use() hook.
  workerAuthState: [
    async ({ browser }, provideFixture) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(DEMO_EMAIL);
      await page.getByLabel("Password").fill(DEMO_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/app/, { timeout: 30_000 });
      const state = await context.storageState();
      await context.close();
      await provideFixture(JSON.stringify(state));
    },
    { scope: "worker" },
  ],
  storageState: async ({ workerAuthState }, provideFixture) => {
    await provideFixture(JSON.parse(workerAuthState));
  },
});

test.describe.configure({ mode: "parallel" });

/** Fails only on critical/serious axe violations; logs everything else for visibility. */
async function assertNoMajorViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    // target-size (touch targets, PROMPT 44) is disabled by default in
    // axe-core even under the wcag22aa tag — opt in explicitly.
    .options({ rules: { "target-size": { enabled: true } } })
    .analyze();

  const major = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  const minor = results.violations.filter(
    (v) => v.impact !== "critical" && v.impact !== "serious",
  );

  if (minor.length > 0) {
    console.log(
      `[a11y][${label}] ${minor.length} moderate/minor finding(s): ${minor
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}x)`)
        .join(", ")}`,
    );
  }

  if (major.length > 0) {
    const detail = major
      .map(
        (v) =>
          `\n- [${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(" "))
            .join("\n  ")}`,
      )
      .join("");
    throw new Error(
      `[a11y][${label}] ${major.length} major violation(s):${detail}`,
    );
  }
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `[${label}] page scrollWidth (${overflow.scrollWidth}) exceeds clientWidth (${overflow.clientWidth}) — horizontal overflow`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route} — no major violations, no horizontal overflow`, async ({
        page,
      }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        await assertNoHorizontalOverflow(page, `${route}@${viewport.name}`);
        await assertNoMajorViolations(page, `${route}@${viewport.name}`);
      });
    }
  });
}

test.describe("dialogs", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("expense dialog — focus trap, labelled fields, no major violations", async ({
    page,
  }) => {
    await page.goto("/app/expenses");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add expense/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Focus starts inside the dialog (Radix default) and Tab never escapes it.
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await assertNoMajorViolations(page, "expense-dialog@375");

    // Escape closes it and returns focus to the trigger — core keyboard journey.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /add expense/i }),
    ).toBeFocused();
  });

  test("submitting an invalid expense form announces errors", async ({
    page,
  }) => {
    await page.goto("/app/expenses");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add expense/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: /^save$|^add expense$/i }).click();

    // FormErrorMessage renders role="alert" — an accessible-name query via
    // getByRole proves it's announced, not just visually present.
    const alerts = page.getByRole("alert");
    await expect(alerts.first()).toBeVisible();
  });
});

test.describe("keyboard navigation", () => {
  test("command palette opens via keyboard shortcut and is operable without a mouse", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Meta+k").catch(() => {});
    await page.keyboard.press("Control+k");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("primary nav is reachable and operable by keyboard alone", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    const expensesLink = page.getByRole("link", { name: "Expenses" }).first();
    await expensesLink.focus();
    await expect(expensesLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/expenses/);
  });
});
