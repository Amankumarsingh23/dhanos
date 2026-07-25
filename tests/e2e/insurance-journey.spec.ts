import { expect, test } from "@playwright/test";
import { fakePdfFile, signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 49 — the "Insurance" journey: create a policy, upload a policy
 * document (a real file upload against local Supabase Storage, linked
 * back to the policy via the documents vault's entity-link fields), and
 * verify the renewal flow. There is no dedicated upload control on the
 * policy detail page itself — uploading through the general documents
 * vault and linking it back by pasting the policy's id is the real flow.
 */

test.describe("insurance journey", () => {
  test("create a policy, upload its document, and renew it", async ({
    page,
  }) => {
    await signUpAndOnboard(page, "insurance");

    await page.goto("/app/people");
    await page.getByRole("button", { name: "Add person" }).first().click();
    const personDialog = page.getByRole("dialog");
    await personDialog.getByLabel("Name").fill("Policy Holder");
    await personDialog.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Person added")).toBeVisible();

    await page.goto("/app/institutions");
    await page.getByRole("button", { name: "Add institution" }).first().click();
    const institutionDialog = page.getByRole("dialog");
    await institutionDialog
      .getByLabel("Name", { exact: true })
      .fill("Reliable Insurer");
    await institutionDialog
      .getByLabel("Type", { exact: true })
      .selectOption({ label: "Insurer" });
    await institutionDialog
      .getByRole("button", { name: "Add institution" })
      .click();
    await expect(page.getByText("Institution added")).toBeVisible();

    await page.goto("/app/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog");
    await accountDialog.getByLabel("Name").fill("Premium Payment Account");
    await accountDialog.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Account added")).toBeVisible();

    // --- Create policy ---
    await page.goto("/app/insurance");
    await page.getByRole("button", { name: "Add policy" }).first().click();
    const policyDialog = page.getByRole("dialog");
    await policyDialog.getByLabel("Policy name").fill("Family Health Cover");
    await policyDialog
      .getByLabel("Insurer")
      .selectOption({ label: "Reliable Insurer" });
    await policyDialog
      .getByLabel("Policyholder")
      .selectOption({ label: "Policy Holder" });
    await policyDialog.getByLabel("Policy Holder").check();
    await policyDialog.getByLabel("Coverage amount").fill("2000000");
    await policyDialog
      .getByLabel("Payment account")
      .selectOption({ label: "Premium Payment Account" });
    await policyDialog.getByLabel("Premium amount").fill("18000");
    await policyDialog.getByLabel("Start date").fill("2026-01-01");
    await policyDialog.getByRole("button", { name: "Add policy" }).click();
    await expect(page.getByText("Policy added")).toBeVisible();

    await page.getByRole("link", { name: "Family Health Cover" }).click();
    await expect(page).toHaveURL(/\/app\/insurance\/([0-9a-f-]+)$/);
    const policyId = page.url().split("/").pop()!;

    // --- Upload the policy document, linked back via entity id ---
    await page.goto("/app/documents");
    await page.getByRole("button", { name: "Upload document" }).first().click();
    const documentDialog = page.getByRole("dialog");
    await documentDialog
      .locator('input[type="file"]')
      .setInputFiles(fakePdfFile("family-health-policy.pdf"));
    await documentDialog
      .getByLabel("Category", { exact: true })
      .selectOption({ label: "Insurance policy" });
    await documentDialog
      .getByLabel(/Linked record|entity type/i)
      .first()
      .selectOption({ label: "Insurance policy" });
    await documentDialog.getByLabel(/Record ID/i).fill(policyId);
    await documentDialog.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Document uploaded")).toBeVisible();
    await expect(
      page.getByRole("row", { name: /family-health-policy\.pdf/ }),
    ).toBeVisible();

    // --- Renew ---
    await page.goto(`/app/insurance/${policyId}`);
    await page.getByRole("button", { name: "Renew" }).click();
    const renewDialog = page.getByRole("dialog");
    await expect(
      renewDialog.getByRole("heading", { name: "Renew policy" }),
    ).toBeVisible();
    await renewDialog.getByRole("button", { name: "Renew policy" }).click();
    await expect(page.getByText("Policy renewed")).toBeVisible();

    // Renewing never mutates the old period in place — it creates a new
    // policy row (see renewInsurancePolicyAction) and the old page just
    // gains a link to it, so following that link is how a UI journey
    // reaches the new period's own "Renewed from ..." disclosure.
    await expect(page.getByText("A newer period exists")).toBeVisible();
    await page.getByRole("link", { name: "view it" }).click();
    await expect(page.getByText(/Renewed from/)).toBeVisible();
  });
});
