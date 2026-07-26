import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * Real bug found live: every optional text field on the "Add institution"
 * dialog (website, support phone, support email) showed a format-invalid
 * error even when left completely blank. Root cause, at two layers:
 *   - App layer (src/lib/validation/institutions.ts): `.optional()` only
 *     lets a zod schema accept `undefined` — it does not make a `.refine()`
 *     or `.email()` check accept an empty string, and a blank <input>
 *     always submits `""`, never `undefined`.
 *   - DB layer (originally
 *     supabase/migrations/20260721070000_institutions_contact_fields.sql,
 *     fixed by a corrective migration since the original was already
 *     applied to production — see
 *     20260802100000_fix_institutions_support_email_empty_string.sql):
 *     the same "is null or <regex>" shape has the identical gap, since ""
 *     is neither null nor a match.
 * Both were fixed the same way: explicitly treat an empty string as valid
 * (equivalent to "not provided"), not just an omitted/null value.
 */
test("optional website/phone/email fields on Add Institution accept being left blank", async ({
  page,
}) => {
  await signUpAndOnboard(page, "optional-fields");
  await page.goto("/app/institutions");
  await page.getByRole("button", { name: /add institution/i }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Union Bank of India");

  // Focus and blur each optional field without typing anything — the
  // exact interaction that triggered the original bug.
  await page.getByLabel(/website/i).click();
  await page.getByLabel(/support phone/i).click();
  await page.getByLabel(/support email/i).click();

  await expect(page.getByText("Enter a valid website URL")).toBeHidden();
  await expect(page.getByText("Enter a valid phone number")).toBeHidden();
  await expect(page.getByText("Enter a valid email address")).toBeHidden();

  // The real end-to-end case: submit with them blank, all the way
  // through the Server Action and the database's own check constraint.
  await page.getByRole("dialog").locator('button[type="submit"]').click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "Union Bank of India", exact: true }),
  ).toBeVisible();
});
