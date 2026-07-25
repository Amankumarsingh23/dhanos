import { expect, test } from "@playwright/test";
import {
  createHousehold,
  restFetch,
  signUpTestUser,
} from "./support/supabase-rest";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./support/env";

/**
 * PROMPT 45 — security and privacy hardening. Attempts the explicit attack
 * list against the real local Supabase stack with real access tokens (the
 * same methodology tests/e2e/household-isolation.spec.ts already
 * established) — never mocks, since RLS is the actual enforcement point
 * (see docs/security-model.md §3). Findings are written up in
 * docs/security-review.md; this file is the permanent regression asset
 * that keeps every one of them proven, not just claimed. Each test builds
 * its own fresh victim household — no shared/cached fixture across
 * tests, so one test's assertions never depend on another's ordering.
 */

async function setupVictimHousehold(label: string) {
  const victim = await signUpTestUser(`victim-${label}`);
  const householdId = await createHousehold(
    victim.accessToken,
    "Victim Household",
  );

  const institutionRes = await restFetch("/institutions", victim.accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      household_id: householdId,
      name: "Victim Bank",
      institution_type: "bank",
    }),
  });
  const [institution] = (await institutionRes.json()) as [{ id: string }];

  const accountRes = await restFetch(
    "/financial_accounts",
    victim.accessToken,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        name: "Victim Savings",
        account_type: "savings",
        institution_id: institution.id,
        currency_code: "INR",
        masked_identifier: "XXXX9999",
        opening_balance_minor_units: 500000,
      }),
    },
  );
  const [account] = (await accountRes.json()) as [{ id: string }];

  const transactionRes = await restFetch("/transactions", victim.accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      household_id: householdId,
      kind: "expense",
      amount_minor_units: 150000,
      currency_code: "INR",
      transaction_date: "2026-07-01",
      account_id: account.id,
      description: "Victim's private grocery run",
    }),
  });
  const [txn] = (await transactionRes.json()) as [{ id: string }];

  const documentPath = `${householdId}/general/${householdId}/victim-secret.pdf`;
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/documents/${documentPath}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${victim.accessToken}`,
        "Content-Type": "application/pdf",
      },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF" magic bytes
    },
  );
  expect(
    uploadRes.ok,
    "victim's own upload to their own household path must succeed",
  ).toBe(true);

  const documentRes = await restFetch("/documents", victim.accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      household_id: householdId,
      original_filename: "victim-secret.pdf",
      display_name: "Victim Secret Document",
      mime_type: "application/pdf",
      size_bytes: 4,
      storage_bucket: "documents",
      storage_path: documentPath,
      category: "other",
    }),
  });
  const [document] = (await documentRes.json()) as [{ id: string }];

  return { victim, householdId, account, txn, document, documentPath };
}

test.describe("security review — cross-household IDOR", () => {
  test("attacker cannot read another household's accounts, transactions, or documents by known id", async () => {
    const { householdId, account, txn, document } =
      await setupVictimHousehold("idor-read");
    const attacker = await signUpTestUser("attacker-idor-read");
    await createHousehold(attacker.accessToken, "Attacker Household");

    const readAccount = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      attacker.accessToken,
    );
    expect(await readAccount.json()).toEqual([]);

    const readTxn = await restFetch(
      `/transactions?id=eq.${txn.id}`,
      attacker.accessToken,
    );
    expect(await readTxn.json()).toEqual([]);

    const readDoc = await restFetch(
      `/documents?id=eq.${document.id}`,
      attacker.accessToken,
    );
    expect(await readDoc.json()).toEqual([]);

    // Full-table listing must not leak other households' rows either —
    // proves scoping isn't just "the specific id is hidden by a filter"
    // but that nothing cross-tenant is readable at all.
    const listAccounts = await restFetch(
      "/financial_accounts",
      attacker.accessToken,
    );
    const accountIds = ((await listAccounts.json()) as { id: string }[]).map(
      (r) => r.id,
    );
    expect(accountIds).not.toContain(account.id);

    void householdId;
  });

  test("attacker cannot change another household's account id/name, delete it, or insert into it — even knowing the real household_id", async () => {
    const { victim, householdId, account } =
      await setupVictimHousehold("idor-write");
    const attacker = await signUpTestUser("attacker-idor-write");
    await createHousehold(attacker.accessToken, "Attacker Household");

    const writeAccount = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      attacker.accessToken,
      { method: "PATCH", body: JSON.stringify({ name: "Hijacked" }) },
    );
    // RLS filters the row out of the UPDATE entirely — 204/no rows
    // affected, not a visible error — so the only reliable proof is that
    // the victim's own account name is still what it was.
    expect([204, 200, 404]).toContain(writeAccount.status);
    const stillOriginal = await restFetch(
      `/financial_accounts?id=eq.${account.id}&select=name`,
      victim.accessToken,
    );
    const [row] = (await stillOriginal.json()) as [{ name: string }];
    expect(row.name).toBe("Victim Savings");

    // Attacker cannot insert a transaction into the victim's household,
    // even though they know the real household_id and a real account_id
    // (changing account IDs / IDOR via a forged household_id on write).
    // Rejected doubly here: check_transaction_consistency's own lookup of
    // account_id runs RLS-scoped to the *attacker*, so the victim's
    // account is invisible to it too and it raises before the INSERT's
    // own RLS WITH CHECK is even evaluated — a 400 (trigger exception),
    // not RLS's usual 403, but still an unconditional reject either way.
    const forgedInsert = await restFetch(
      "/transactions",
      attacker.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: householdId,
          kind: "income",
          amount_minor_units: 999999900,
          currency_code: "INR",
          transaction_date: "2026-07-01",
          account_id: account.id,
        }),
      },
    );
    expect([400, 403]).toContain(forgedInsert.status);
    const noForgedRow = await restFetch(
      `/transactions?household_id=eq.${householdId}&kind=eq.income`,
      victim.accessToken,
    );
    expect((await noForgedRow.json()) as unknown[]).toHaveLength(0);

    // Nor delete the victim's account.
    const deleteAttempt = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      attacker.accessToken,
      { method: "DELETE" },
    );
    expect([204, 200, 404]).toContain(deleteAttempt.status);
    const stillExists = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      victim.accessToken,
    );
    expect((await stillExists.json()) as unknown[]).toHaveLength(1);
  });
});

test.describe("security review — Storage path guessing", () => {
  test("attacker cannot download or mint a signed URL for a victim's document, even knowing the exact path", async () => {
    const { documentPath } = await setupVictimHousehold("storage-guess");
    const attacker = await signUpTestUser("attacker-storage");
    await createHousehold(attacker.accessToken, "Attacker Household 2");

    const directDownload = await fetch(
      `${SUPABASE_URL}/storage/v1/object/documents/${documentPath}`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${attacker.accessToken}`,
        },
      },
    );
    expect(
      directDownload.status,
      "guessing a known victim household id + path must not download the file",
    ).not.toBe(200);

    // An attacker who somehow learned the exact storage path (e.g. from a
    // leaked log) still can't get Storage to mint them a signed URL for
    // it — the signing endpoint itself is RLS-gated, not just the read.
    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/documents/${documentPath}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${attacker.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 }),
      },
    );
    expect(
      signRes.status,
      "attacker must not be able to mint a signed URL for a victim's file",
    ).not.toBe(200);
  });
});

test.describe("security review — unauthenticated access", () => {
  test("every household table rejects a request with no bearer token at all (anon-key only)", async () => {
    const tables = [
      "households",
      "financial_accounts",
      "transactions",
      "documents",
      "insurance_policies",
      "investment_holdings",
    ];
    for (const table of tables) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      const body = (await res.json()) as unknown;
      // anon has no SELECT grant at all on any of these — PostgREST
      // returns 200 + [] under RLS-with-no-matching-policy in some
      // configs, or 401/403 if the grant itself is missing; either way,
      // zero rows must ever come back.
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    }
  });

  test("get_or_create_household RPC rejects an unauthenticated caller", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_or_create_household`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_name: "Anon Household",
          p_base_currency_code: "INR",
          p_timezone: "Asia/Kolkata",
          p_financial_month_start_day: 1,
        }),
      },
    );
    expect(res.status).not.toBe(200);
  });
});

test.describe("security review — malformed/adversarial input via direct REST (bypassing app-layer validation)", () => {
  test("rejects a zero-amount transaction", async () => {
    const { victim, householdId, account } =
      await setupVictimHousehold("zero-amount");
    const res = await restFetch("/transactions", victim.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 0,
        currency_code: "INR",
        transaction_date: "2026-07-01",
        account_id: account.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid (non-3-letter) currency code", async () => {
    const { victim, householdId, account } =
      await setupVictimHousehold("bad-currency");
    const res = await restFetch("/transactions", victim.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 1000,
        currency_code: "rupees",
        transaction_date: "2026-07-01",
        account_id: account.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("DB layer currently accepts a negative amount_minor_units for an expense — documents a real finding, see docs/security-review.md", async () => {
    const { victim, householdId, account } =
      await setupVictimHousehold("negative-amount");
    const res = await restFetch("/transactions", victim.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: -50000,
        currency_code: "INR",
        transaction_date: "2026-07-01",
        account_id: account.id,
      }),
    });
    // This intentionally documents current DB-layer behavior (accepts
    // it — only app-layer zod validation guards against it today) rather
    // than asserting a desired end state. If this starts failing after a
    // DB-level CHECK constraint is added, update this test to match.
    expect(res.status).toBe(201);
  });

  test("mass assignment: an unknown/extra column on insert is rejected outright, never silently accepted", async () => {
    const { victim, householdId, account } =
      await setupVictimHousehold("mass-assignment");
    const res = await restFetch("/transactions", victim.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 1000,
        currency_code: "INR",
        transaction_date: "2026-07-01",
        account_id: account.id,
        is_admin: true,
        role: "owner",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("cannot forge household_id on insert to a household the caller isn't a member of", async () => {
    const { victim, account } = await setupVictimHousehold(
      "forged-household-id",
    );
    // check_transaction_consistency catches this directly: account.id
    // genuinely belongs to the caller's real household, which doesn't
    // match the forged all-zero household_id — rejected as a 400
    // (trigger exception) before RLS's own WITH CHECK is even reached.
    const res = await restFetch("/transactions", victim.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: "00000000-0000-0000-0000-000000000000",
        kind: "expense",
        amount_minor_units: 1000,
        currency_code: "INR",
        transaction_date: "2026-07-01",
        account_id: account.id,
      }),
    });
    expect([400, 403]).toContain(res.status);
  });
});

test.describe("security review — oversized/disallowed file upload", () => {
  test("Storage rejects an upload past the app's documented 25MB cap, enforced server-side by the bucket's own file_size_limit", async () => {
    const victim = await signUpTestUser("oversize-uploader");
    const householdId = await createHousehold(
      victim.accessToken,
      "Oversize Household",
    );
    // 26MB — 1MB past the app's documented client-side cap
    // (MAX_DOCUMENT_SIZE_BYTES), to prove the cap is also enforced
    // server-side (supabase/migrations/20260729100000_storage_bucket_
    // limits.sql) and not just trusted client-side JS. An allowed MIME
    // type, so this isolates the size limit specifically.
    const oversized = new Uint8Array(26 * 1024 * 1024);
    const path = `${householdId}/general/${householdId}/oversized.pdf`;
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/documents/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${victim.accessToken}`,
          "Content-Type": "application/pdf",
        },
        body: oversized,
      },
    );
    expect(res.status).not.toBe(200);
  });

  test("Storage rejects a disallowed MIME type (e.g. an executable) regardless of size", async () => {
    const victim = await signUpTestUser("disallowed-mime-uploader");
    const householdId = await createHousehold(
      victim.accessToken,
      "Mime Household",
    );
    const path = `${householdId}/general/${householdId}/payload.exe`;
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/documents/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${victim.accessToken}`,
          "Content-Type": "application/x-msdownload",
        },
        body: new Uint8Array([0x4d, 0x5a]), // "MZ" — a Windows PE executable's magic bytes
      },
    );
    expect(res.status).not.toBe(200);
  });
});
