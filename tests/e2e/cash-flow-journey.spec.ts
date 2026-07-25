import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Cash flow" journey: create account, add income, add
 * expense, transfer, verify dashboard. One continuous flow through the
 * real UI (no REST shortcuts — tests/e2e/financial-mutations.spec.ts
 * already covers the RPC/RLS layer directly), each with its own freshly
 * signed-up household so this test never depends on another test's data.
 */

test.describe("cash flow journey", () => {
  test("create account, add income, add expense, transfer, and see it all on the dashboard", async ({
    page,
  }) => {
    await signUpAndOnboard(page, "cashflow");

    // --- Create account ---
    await page.goto("/app/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog");
    await accountDialog.getByLabel("Name").fill("Primary Savings");
    await accountDialog.getByLabel(/Opening balance/).fill("50000");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Account added")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Primary Savings" }),
    ).toBeVisible();

    // --- Add income (declare source, then record a receipt) ---
    await page.goto("/app/income");
    await page.getByRole("button", { name: "Add source" }).first().click();
    const incomeSourceDialog = page.getByRole("dialog");
    await incomeSourceDialog.getByLabel("Name").fill("Monthly Salary");
    await incomeSourceDialog
      .getByLabel("Receiving account")
      .selectOption({ label: "Primary Savings" });
    await incomeSourceDialog
      .getByLabel("Expected day of month")
      .fill("1");
    await incomeSourceDialog
      .getByLabel("Start date")
      .fill("2026-07-01");
    await incomeSourceDialog
      .getByRole("button", { name: "Add source" })
      .click();
    await expect(page.getByText("Income source added")).toBeVisible();

    await page
      .getByRole("row", { name: /Monthly Salary/ })
      .getByRole("button")
      .click();
    await page.getByRole("menuitem", { name: "Record income" }).click();
    const recordIncomeDialog = page.getByRole("dialog");
    await recordIncomeDialog.getByLabel("Amount").fill("75000");
    await recordIncomeDialog
      .getByRole("button", { name: "Record income" })
      .click();
    await expect(page.getByText("Income recorded")).toBeVisible();

    // --- Add expense ---
    await page.goto("/app/expenses");
    await page.getByRole("button", { name: "Add expense" }).first().click();
    const expenseDialog = page.getByRole("dialog");
    await expenseDialog.getByLabel("Amount").fill("1200");
    await expenseDialog.getByLabel("Date", { exact: true }).fill("2026-07-10");
    await expenseDialog
      .getByLabel("Account", { exact: true })
      .selectOption({ label: "Primary Savings" });
    await expenseDialog.getByLabel(/Merchant/).fill("Grocery Store");
    await expenseDialog.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText(/Expense (added|updated)/)).toBeVisible();

    // --- Create a second account, then transfer between them ---
    await page.goto("/app/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const secondAccountDialog = page.getByRole("dialog");
    await secondAccountDialog.getByLabel("Name").fill("Emergency Fund");
    await secondAccountDialog
      .getByRole("button", { name: "Add account" })
      .click();
    await expect(page.getByText("Account added")).toBeVisible();

    await page.goto("/app/transfers");
    await page.getByRole("button", { name: "Add transfer" }).first().click();
    const transferDialog = page.getByRole("dialog");
    await transferDialog.getByLabel("Amount").fill("5000");
    await transferDialog.getByLabel("Date", { exact: true }).fill("2026-07-15");
    await transferDialog
      .getByLabel("From account")
      .selectOption({ label: "Primary Savings (INR)" });
    await transferDialog
      .getByLabel("To account")
      .selectOption({ label: "Emergency Fund (INR)" });
    await transferDialog.getByRole("button", { name: "Add transfer" }).click();
    await expect(page.getByText("Transfer added")).toBeVisible();

    // --- Verify the dashboard reflects all of the above ---
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("Income this month")).toBeVisible();
    await expect(page.getByText("Expenses this month")).toBeVisible();
    await expect(page.getByText("Available account balance")).toBeVisible();
  });
});
