import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "SIP" journey: create a daily SIP, record a
 * contribution, verify it reflects in the contribution account's balance
 * and the portfolio view. The asset/platform are created inline (the SIP
 * dialog supports "+ Create new asset"/"+ Create new platform" so no
 * separate holding-setup step exists in the real UI).
 */

test.describe("SIP journey", () => {
  test("create a daily SIP, record a contribution, and verify the account and portfolio", async ({
    page,
  }) => {
    await signUpAndOnboard(page, "sip");

    await page.goto("/app/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog");
    await accountDialog.getByLabel("Name").fill("SIP Funding Account");
    await accountDialog.getByLabel(/Opening balance/).fill("100000");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Account added")).toBeVisible();

    await page.goto("/app/investments");
    await page.getByRole("button", { name: "Add SIP" }).first().click();
    const sipDialog = page.getByRole("dialog");
    await sipDialog.getByLabel("Name").fill("Daily Gold SIP");

    await sipDialog
      .getByLabel("Investment asset")
      .selectOption({ label: "+ Create new asset" });
    await sipDialog.getByLabel("New asset name").fill("Digital Gold");
    await sipDialog
      .getByLabel("Asset class")
      .selectOption({ label: "Gold" });

    await sipDialog
      .getByLabel("Platform")
      .selectOption({ label: "+ Create new platform" });
    await sipDialog.getByLabel("New platform name").fill("Gold App");

    await sipDialog.getByLabel("Contribution amount").fill("100");
    await sipDialog.getByLabel("Frequency").selectOption({ label: "Daily" });
    await sipDialog.getByLabel("Start date").fill("2026-07-01");
    await sipDialog
      .getByLabel("Contribution account")
      .selectOption({ label: "SIP Funding Account" });
    await sipDialog
      .getByLabel("Starting status")
      .selectOption({ label: "Active" });

    await sipDialog.getByRole("button", { name: "Add SIP" }).click();
    await expect(page.getByText("SIP added")).toBeVisible();
    await expect(page.getByRole("row", { name: /Daily Gold SIP/ })).toBeVisible();

    // --- Record a contribution ---
    await page
      .getByRole("row", { name: /Daily Gold SIP/ })
      .getByRole("button")
      .click();
    await page.getByRole("menuitem", { name: "Record contribution" }).click();
    const contributionDialog = page.getByRole("dialog");
    await expect(
      contributionDialog.getByText("Record contribution for Daily Gold SIP"),
    ).toBeVisible();
    await contributionDialog
      .getByRole("button", { name: "Record contribution" })
      .click();
    await expect(page.getByText("Contribution recorded")).toBeVisible();

    // --- Verify the contribution account's balance decreased ---
    await page.goto("/app/accounts");
    await expect(
      page.getByRole("row", { name: /SIP Funding Account/ }),
    ).not.toContainText("₹1,00,000.00");

    // --- Verify the portfolio shows the contribution ---
    await page.goto("/app/investments/portfolio");
    await expect(
      page.getByRole("heading", { name: "Portfolio & performance" }),
    ).toBeVisible();
    // "Current value" legitimately reads "—" until a valuation is recorded
    // (a contribution alone doesn't create one — see PROMPT 48's recon of
    // this page) — assert against "Contributed" instead, which updates
    // immediately.
    const holdingRow = page.getByRole("row", { name: /Digital Gold/ });
    await expect(holdingRow).toBeVisible();
    await expect(holdingRow).toContainText("₹100.00");
  });
});
