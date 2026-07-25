import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 56 (version-one completion audit) — a real, severe bug found
 * during this pass: `updateParams` (the shared URL-searchParam-filter
 * helper duplicated across every "*-manager.tsx" list page) unconditionally
 * ran `params.delete("page")` after applying its patch — including when
 * the patch *was* an explicit page change (`goToPage(n)` calls
 * `updateParams({ page: String(n) })`). The page number was set, then
 * immediately deleted again on the very next line, so clicking "Next" (or
 * "Previous") silently did nothing on every paginated list in the app —
 * confirmed live: seeded 26 accounts (DEFAULT_PAGE_SIZE=25), clicked
 * "Next", and the URL/content never changed. `decisions-manager.tsx` had
 * already independently discovered and fixed this exact bug for itself;
 * the fix (only delete "page" when the patch doesn't itself set it) is
 * now applied consistently across all 18 manager components. This spec —
 * the only one in the suite that seeds enough rows to force a second
 * page — is the permanent regression guard for Accounts specifically;
 * the identical `updateParams` shape is shared code copied into every
 * other manager, so this one test covers the shared root cause.
 */
test("clicking Next on a paginated list actually advances to the next page", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUpAndOnboard(page, "pagination");
  await page.goto("/app/accounts");

  for (let i = 1; i <= 26; i++) {
    await page.getByRole("button", { name: /add account/i }).first().click({ timeout: 15000 });
    await page
      .getByLabel("Name", { exact: true })
      .fill(`Pagination Account ${String(i).padStart(2, "0")}`);
    await page.getByLabel("Opening balance").fill("100");
    await page.getByRole("dialog").locator('button[type="submit"]').click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });
  }

  await page.goto("/app/accounts");
  await expect(
    page.getByRole("link", { name: "Pagination Account 01" }),
  ).toBeVisible();

  const nextButton = page.getByRole("button", { name: /^next$/i });
  await expect(nextButton).toBeEnabled();
  await nextButton.click();

  await expect(page).toHaveURL(/[?&]page=2\b/);
  await expect(
    page.getByRole("link", { name: "Pagination Account 01" }),
  ).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Pagination Account 26" }),
  ).toBeVisible();

  // Previous must symmetrically work and land back on page 1.
  const prevButton = page.getByRole("button", { name: /^previous$/i });
  await prevButton.click();
  await expect(page).not.toHaveURL(/[?&]page=2\b/);
  await expect(
    page.getByRole("link", { name: "Pagination Account 01" }),
  ).toBeVisible();
});
