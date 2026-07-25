import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Asset and goal" journey: create an inherited-land
 * record, create a goal, and verify net worth and goal readiness. Net
 * worth is confirmed live-computed (docs/financial-correctness-review.md,
 * docs/performance-audit.md) — no snapshot needs to be recorded first for
 * the dashboard/net-worth page to reflect a newly added asset.
 */

test.describe("asset and goal journey", () => {
  test("create an inherited-land asset and a goal, then verify net worth and goal readiness", async ({
    page,
  }) => {
    await signUpAndOnboard(page, "assetgoal");

    await page.goto("/app/people");
    await page.getByRole("button", { name: "Add person" }).first().click();
    const personDialog = page.getByRole("dialog");
    await personDialog.getByLabel("Name").fill("Land Owner");
    await personDialog.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Person added")).toBeVisible();

    // --- Create an inherited-land asset ---
    await page.goto("/app/assets");
    await page.getByRole("button", { name: "Add asset" }).first().click();
    const assetDialog = page.getByRole("dialog");
    await assetDialog.getByLabel("Name").fill("Ancestral Farmland");
    await assetDialog.getByLabel("Group").selectOption({ label: "Immovable" });
    await assetDialog.getByLabel("Category").selectOption({ label: "Land" });
    await assetDialog
      .getByLabel("Owner", { exact: true })
      .selectOption({ label: "Land Owner" });
    await assetDialog
      .getByLabel("Acquisition type")
      .selectOption({ label: "Inherited" });
    await assetDialog.getByLabel("Acquisition date").fill("2015-01-01");
    await assetDialog.getByLabel("Estimated current value").fill("3000000");
    await assetDialog.getByLabel("Valuation date").fill("2026-07-01");
    await assetDialog.getByRole("button", { name: "Add asset" }).click();
    await expect(page.getByText("Asset added")).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Ancestral Farmland/ }),
    ).toBeVisible();

    // --- Create a goal ---
    await page.goto("/app/goals");
    await page.getByRole("button", { name: "Add goal" }).first().click();
    const goalDialog = page.getByRole("dialog");
    await goalDialog.getByLabel("Name").fill("Retirement Corpus");
    await goalDialog.getByLabel("Target amount").fill("5000000");
    await goalDialog.getByLabel("Target date").fill("2040-01-01");
    await goalDialog.getByRole("button", { name: "Add goal" }).click();
    await expect(page.getByText("Goal added")).toBeVisible();

    const goalRow = page.getByRole("row", { name: /Retirement Corpus/ });
    await expect(goalRow).toBeVisible();
    await expect(goalRow).toContainText(
      /Funded|On track|Needs contribution|Overdue/,
    );

    // --- Verify net worth reflects the asset, live, with no snapshot needed ---
    await page.goto("/app/net-worth");
    await expect(
      page.getByRole("heading", { name: "Net worth" }),
    ).toBeVisible();
    await expect(page.getByText("Property")).toBeVisible();
    await expect(page.getByText("₹30,00,000.00").first()).toBeVisible();
  });
});
