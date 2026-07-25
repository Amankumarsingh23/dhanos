import { expect, test } from "@playwright/test";
import { fakePdfFile, signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Security" journey: a second signed-in user cannot
 * reach a first user's account or document through the real browser UI —
 * not a REST probe with a manually-obtained token (see
 * tests/e2e/security-review.spec.ts and household-isolation.spec.ts for
 * that layer). This is the UI-navigation re-verification
 * docs/manual-test-checklist.md flagged as outstanding once real
 * account/document surfaces existed to click through.
 */

test.describe("security journey", () => {
  test("a second household's signed-in user cannot see or reach the first household's account or document", async ({
    browser,
  }) => {
    const victimContext = await browser.newContext();
    const victimPage = await victimContext.newPage();
    await signUpAndOnboard(victimPage, "victim-journey");

    await victimPage.goto("/app/accounts");
    await victimPage.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = victimPage.getByRole("dialog");
    await accountDialog.getByLabel("Name").fill("Victim's Secret Account");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(victimPage.getByText("Account added")).toBeVisible();
    await victimPage
      .getByRole("link", { name: "Victim's Secret Account" })
      .click();
    await expect(victimPage).toHaveURL(/\/app\/accounts\/[0-9a-f-]+$/);
    const victimAccountId = victimPage.url().split("/").pop()!;

    await victimPage.goto("/app/documents");
    await victimPage
      .getByRole("button", { name: "Upload document" })
      .first()
      .click();
    const documentDialog = victimPage.getByRole("dialog");
    await documentDialog
      .locator('input[type="file"]')
      .setInputFiles(fakePdfFile("victim-secret-document.pdf"));
    await documentDialog.getByRole("button", { name: "Upload" }).click();
    await expect(victimPage.getByText("Document uploaded")).toBeVisible();

    // --- Attacker: an entirely separate signed-in session/household ---
    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    await signUpAndOnboard(attackerPage, "attacker-journey");

    // 1. Direct URL navigation to the victim's real account id never
    // reveals the victim's data, whatever the app does with the request
    // (error boundary, empty state, etc.) — the negative space is what's
    // being proven.
    await attackerPage.goto(`/app/accounts/${victimAccountId}`);
    await expect(
      attackerPage.getByText("Victim's Secret Account"),
    ).not.toBeVisible();

    // 2. The victim's account never appears in the attacker's own list.
    await attackerPage.goto("/app/accounts");
    await expect(
      attackerPage.getByText("Victim's Secret Account"),
    ).not.toBeVisible();

    // 3. Nor does the victim's document appear in the attacker's own vault.
    await attackerPage.goto("/app/documents");
    await expect(
      attackerPage.getByText("victim-secret-document.pdf"),
    ).not.toBeVisible();

    // 4. Global search — scoped to the attacker's own household — never
    // surfaces the victim's account or document by name either.
    await attackerPage.goto(
      "/app/search?q=" + encodeURIComponent("Victim's Secret"),
    );
    await expect(
      attackerPage.getByText("Victim's Secret Account"),
    ).not.toBeVisible();
    await expect(
      attackerPage.getByText("victim-secret-document.pdf"),
    ).not.toBeVisible();

    await victimContext.close();
    await attackerContext.close();
  });
});
