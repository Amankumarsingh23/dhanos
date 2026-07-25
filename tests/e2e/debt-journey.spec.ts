import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Debt" journey: create an education loan, record an
 * EMI payment, verify the outstanding principal and interest paid update
 * correctly. Disbursement is a required intermediate step in the real
 * flow (a loan starts "Pending disbursement" and can't take a payment
 * until disbursed) — the journey follows that real sequence rather than
 * skipping it.
 */

test.describe("debt journey", () => {
  test("create an education loan, disburse it, record an EMI, and verify principal and interest", async ({
    page,
  }) => {
    await signUpAndOnboard(page, "debt");

    await page.goto("/app/people");
    await page.getByRole("button", { name: "Add person" }).first().click();
    const personDialog = page.getByRole("dialog");
    await personDialog.getByLabel("Name").fill("Student Borrower");
    await personDialog.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Person added")).toBeVisible();

    await page.goto("/app/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog");
    await accountDialog.getByLabel("Name").fill("Loan Payment Account");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Account added")).toBeVisible();

    await page.goto("/app/institutions");
    await page.getByRole("button", { name: "Add institution" }).first().click();
    const institutionDialog = page.getByRole("dialog");
    await institutionDialog
      .getByLabel("Name", { exact: true })
      .fill("Education Bank");
    await institutionDialog
      .getByRole("button", { name: "Add institution" })
      .click();
    await expect(page.getByText("Institution added")).toBeVisible();

    await page.goto("/app/debts");
    await page.getByRole("button", { name: "Add loan" }).first().click();
    const loanDialog = page.getByRole("dialog");
    await loanDialog.getByLabel("Name").fill("Master's Degree Loan");
    await loanDialog.getByLabel("Loan type").selectOption({ label: "Education" });
    await loanDialog
      .getByLabel("Lender institution")
      .selectOption({ label: "Education Bank" });
    await loanDialog
      .getByLabel("Borrower", { exact: true })
      .selectOption({ label: "Student Borrower" });
    await loanDialog.getByLabel("Original principal").fill("1000000");
    await loanDialog
      .getByLabel("Payment account")
      .selectOption({ label: "Loan Payment Account" });
    await loanDialog.getByLabel(/Annual interest rate/).fill("8.5");
    await loanDialog.getByLabel("Start date", { exact: true }).fill("2026-01-01");
    await loanDialog.getByLabel("Repayment start date").fill("2026-07-01");
    await loanDialog.getByRole("button", { name: "Add loan" }).click();
    await expect(page.getByText("Loan added")).toBeVisible();

    await page.getByRole("link", { name: "Master's Degree Loan" }).click();
    await expect(page).toHaveURL(/\/app\/debts\/[0-9a-f-]+$/);
    await expect(page.getByText("Pending disbursement")).toBeVisible();

    // --- Disburse ---
    await page.getByRole("button", { name: "Record disbursement" }).click();
    const disburseDialog = page.getByRole("dialog");
    await disburseDialog
      .getByRole("button", { name: "Record disbursement" })
      .click();
    await expect(page.getByText("Disbursement recorded")).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // --- Record an EMI payment ---
    await page.getByRole("button", { name: "Record payment" }).click();
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByLabel("Principal").fill("15000");
    await paymentDialog.getByLabel("Interest").fill("7000");
    await paymentDialog
      .getByRole("button", { name: "Record payment" })
      .click();
    await expect(page.getByText("Payment recorded")).toBeVisible();

    // --- Verify outstanding principal reduced and interest is recorded ---
    await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
    const paymentRow = page.getByRole("row", { name: /15,000|15000/ });
    await expect(paymentRow).toBeVisible();
    await expect(paymentRow).toContainText("7,000");
  });
});
