import { expect, test } from "@playwright/test";
import {
  createHousehold,
  restFetch,
  signUpTestUser,
} from "./support/supabase-rest";

/**
 * Exercises the core relational schema built for PROMPT 6 (people,
 * institutions, financial_accounts, account_balance_snapshots,
 * transaction_categories, transactions, transaction_splits,
 * recurring_rules, attachments, activity_events) directly against the
 * local Supabase REST API with real access tokens — the same methodology
 * tests/e2e/household-isolation.spec.ts uses for the tenancy layer.
 *
 * Covers this prompt's acceptance criteria:
 *   - Invalid currencies and transaction kinds are rejected.
 *   - User A cannot access User B's data.
 *   - Transfers cannot be misclassified as income by reporting logic.
 *   - transaction_splits totals must equal the parent transaction's total.
 */

async function setupHouseholdWithAccount(label: string) {
  const user = await signUpTestUser(label);
  const householdId = await createHousehold(user.accessToken, `${label} HH`);

  const institutionRes = await restFetch("/institutions", user.accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      household_id: householdId,
      name: `${label} Bank`,
      institution_type: "bank",
    }),
  });
  const [institution] = (await institutionRes.json()) as Array<{
    id: string;
  }>;

  const accountRes = await restFetch("/financial_accounts", user.accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      household_id: householdId,
      name: `${label} Savings`,
      account_type: "savings",
      institution_id: institution?.id,
      currency_code: "INR",
    }),
  });
  const [account] = (await accountRes.json()) as Array<{ id: string }>;

  return { user, householdId, accountId: account!.id };
}

test.describe("core ledger schema", () => {
  test("rejects an invalid currency code", async () => {
    const { user, householdId } = await setupHouseholdWithAccount("ccy");

    const response = await restFetch("/financial_accounts", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "Bad currency account",
        account_type: "savings",
        currency_code: "inr", // lowercase — must be rejected
      }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects an invalid transaction kind", async () => {
    const { user, householdId, accountId } =
      await setupHouseholdWithAccount("kind");

    const response = await restFetch("/transactions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "not_a_real_kind",
        amount_minor_units: 1000,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: accountId,
      }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects a zero-amount transaction", async () => {
    const { user, householdId, accountId } =
      await setupHouseholdWithAccount("zero");

    const response = await restFetch("/transactions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 0,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: accountId,
      }),
    });

    expect(response.status).toBe(400);
  });

  test("two independent households' core ledger data is mutually unreadable and unwritable", async () => {
    const a = await setupHouseholdWithAccount("ledgerA");
    const b = await setupHouseholdWithAccount("ledgerB");

    const txnRes = await restFetch("/transactions", b.user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: b.householdId,
        kind: "expense",
        amount_minor_units: 5000,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: b.accountId,
      }),
    });
    const [bTransaction] = (await txnRes.json()) as Array<{ id: string }>;

    // A cannot read B's account or transaction.
    const aReadsBAccount = await restFetch(
      `/financial_accounts?id=eq.${b.accountId}`,
      a.user.accessToken,
    );
    expect(await aReadsBAccount.json()).toEqual([]);

    const aReadsBTransaction = await restFetch(
      `/transactions?id=eq.${bTransaction!.id}`,
      a.user.accessToken,
    );
    expect(await aReadsBTransaction.json()).toEqual([]);

    // A cannot write a transaction into B's household or against B's account.
    const crossWrite = await restFetch("/transactions", a.user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: b.householdId,
        kind: "expense",
        amount_minor_units: 100,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: b.accountId,
      }),
    });
    // RLS's own INSERT check (household_role(household_id)) never even gets
    // evaluated here: the household-consistency trigger's own lookup of
    // account_id runs under A's session, and A's RLS SELECT policy on
    // financial_accounts hides B's account row entirely — so the trigger
    // sees "no such account" and raises 400, rather than RLS's usual 403.
    // Either way, the cross-household write is rejected.
    expect([400, 403]).toContain(crossWrite.status);

    // A cannot attach A's own transaction to B's household id either — the
    // household-consistency trigger should reject the household/account
    // mismatch even if RLS somehow let the household_id through.
    const mismatchedHousehold = await restFetch(
      "/transactions",
      a.user.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: a.householdId,
          kind: "expense",
          amount_minor_units: 100,
          currency_code: "INR",
          transaction_date: "2026-07-21",
          account_id: b.accountId, // someone else's account
        }),
      },
    );
    expect([400, 403]).toContain(mismatchedHousehold.status);
  });

  test("transfers are excluded from cash_flow_transactions by construction", async () => {
    const { user, householdId, accountId } =
      await setupHouseholdWithAccount("cashflow");

    const secondAccountRes = await restFetch(
      "/financial_accounts",
      user.accessToken,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          household_id: householdId,
          name: "Second account",
          account_type: "wallet",
          currency_code: "INR",
        }),
      },
    );
    const [secondAccount] = (await secondAccountRes.json()) as Array<{
      id: string;
    }>;

    // One income, one transfer.
    await restFetch("/transactions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "income",
        amount_minor_units: 100000,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: accountId,
      }),
    });

    await restFetch("/transactions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "transfer",
        amount_minor_units: 20000,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: accountId,
        transfer_account_id: secondAccount!.id,
      }),
    });

    const cashFlowRes = await restFetch(
      `/cash_flow_transactions?household_id=eq.${householdId}`,
      user.accessToken,
    );
    const cashFlowRows = (await cashFlowRes.json()) as Array<{
      kind: string;
    }>;

    expect(cashFlowRows).toHaveLength(1);
    expect(cashFlowRows[0]?.kind).toBe("income");

    // The raw table still has both, proving the exclusion is the view's
    // doing, not that the transfer failed to insert.
    const rawRes = await restFetch(
      `/transactions?household_id=eq.${householdId}`,
      user.accessToken,
    );
    const rawRows = (await rawRes.json()) as Array<{ kind: string }>;
    expect(rawRows.map((r) => r.kind).sort()).toEqual(["income", "transfer"]);
  });

  test("transaction_splits must sum to the parent transaction's amount", async () => {
    const { user, householdId, accountId } =
      await setupHouseholdWithAccount("splits");

    const txnRes = await restFetch("/transactions", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 10000,
        currency_code: "INR",
        transaction_date: "2026-07-21",
        account_id: accountId,
      }),
    });
    const [transaction] = (await txnRes.json()) as Array<{ id: string }>;

    const categoryRes = await restFetch(
      "/transaction_categories",
      user.accessToken,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([
          {
            household_id: householdId,
            name: "Groceries",
            category_kind: "expense",
          },
          {
            household_id: householdId,
            name: "Dining",
            category_kind: "expense",
          },
        ]),
      },
    );
    const categories = (await categoryRes.json()) as Array<{ id: string }>;

    // Mismatched split total (4000 != 10000) in a single insert — rejected.
    const badSplit = await restFetch("/transaction_splits", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        transaction_id: transaction!.id,
        category_id: categories[0]!.id,
        amount_minor_units: 4000,
      }),
    });
    // The deferred constraint trigger raises a plain Postgres exception
    // (P0001), which PostgREST maps to 400, not 500.
    expect(badSplit.status).toBe(400);

    // A matching split set (4000 + 6000 = 10000), inserted as one bulk
    // request — PostgREST runs a multi-row insert as a single statement,
    // so the deferred constraint trigger sees the complete set before
    // deciding. Succeeds.
    const goodSplit = await restFetch("/transaction_splits", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          household_id: householdId,
          transaction_id: transaction!.id,
          category_id: categories[0]!.id,
          amount_minor_units: 4000,
        },
        {
          household_id: householdId,
          transaction_id: transaction!.id,
          category_id: categories[1]!.id,
          amount_minor_units: 6000,
        },
      ]),
    });
    expect(goodSplit.status).toBe(201);
    expect(await goodSplit.json()).toHaveLength(2);
  });

  test("append-only tables reject update/delete outright", async () => {
    const { user, householdId, accountId } =
      await setupHouseholdWithAccount("appendonly");

    const snapshotRes = await restFetch(
      "/account_balance_snapshots",
      user.accessToken,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          household_id: householdId,
          account_id: accountId,
          as_of_date: "2026-07-21",
          balance_minor_units: 50000,
          currency_code: "INR",
        }),
      },
    );
    expect(snapshotRes.status).toBe(201);
    const [snapshot] = (await snapshotRes.json()) as Array<{ id: string }>;

    const updateAttempt = await restFetch(
      `/account_balance_snapshots?id=eq.${snapshot!.id}`,
      user.accessToken,
      { method: "PATCH", body: JSON.stringify({ balance_minor_units: 1 }) },
    );
    expect([401, 403, 404]).toContain(updateAttempt.status);

    const deleteAttempt = await restFetch(
      `/account_balance_snapshots?id=eq.${snapshot!.id}`,
      user.accessToken,
      { method: "DELETE" },
    );
    expect([401, 403, 404]).toContain(deleteAttempt.status);
  });
});
