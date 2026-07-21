import { expect, test } from "@playwright/test";
import {
  createHousehold,
  restFetch,
  signUpTestUser,
} from "./support/supabase-rest";

/**
 * Exercises the People and Institutions tables (PROMPT 8) directly against
 * the local Supabase REST API with real access tokens — same methodology
 * as tests/e2e/core-ledger.spec.ts and household-isolation.spec.ts.
 *
 * Covers this prompt's acceptance criteria at the data layer:
 *   - A person can represent the user or a family member (relationship_type
 *     accepts both, and any relationship_type is representable via REST).
 *   - An institution is a first-class row financial_accounts can already
 *     reference (see tests/e2e/core-ledger.spec.ts for the FK itself).
 *   - Cross-household access is blocked.
 *
 * The duplicate-warning *heuristic* (fuzzy name/domain/phone matching) is
 * application-layer logic in src/features/institutions/actions.ts, not a
 * REST-visible constraint — see src/features/institutions/actions.test.ts
 * and duplicate-detection.test.ts for that coverage. What IS enforced at
 * the database layer, and tested here, is the exact-name uniqueness index
 * and the enum/format check constraints.
 */

async function setupHousehold(label: string) {
  const user = await signUpTestUser(label);
  const householdId = await createHousehold(user.accessToken, `${label} HH`);
  return { user, householdId };
}

test.describe("people", () => {
  test("rejects an invalid relationship_type", async () => {
    const { user, householdId } = await setupHousehold("relType");

    const response = await restFetch("/people", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        display_name: "Someone",
        relationship_type: "cousin",
      }),
    });

    expect(response.status).toBe(400);
  });

  test("represents the user themself via relationship_type = self, and a family member via any other type", async () => {
    const { user, householdId } = await setupHousehold("selfFamily");

    const selfRes = await restFetch("/people", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        display_name: "Me",
        relationship_type: "self",
      }),
    });
    expect(selfRes.status).toBe(201);

    const spouseRes = await restFetch("/people", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        display_name: "My Spouse",
        relationship_type: "spouse",
      }),
    });
    expect(spouseRes.status).toBe(201);
  });

  test("rejects a blank display name", async () => {
    const { user, householdId } = await setupHousehold("blankName");

    const response = await restFetch("/people", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        display_name: "   ",
        relationship_type: "self",
      }),
    });

    expect(response.status).toBe(400);
  });

  test("two households' people are mutually unreadable and unwritable", async () => {
    const a = await setupHousehold("peopleA");
    const b = await setupHousehold("peopleB");

    const bPersonRes = await restFetch("/people", b.user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: b.householdId,
        display_name: "B's Spouse",
        relationship_type: "spouse",
      }),
    });
    const [bPerson] = (await bPersonRes.json()) as Array<{ id: string }>;

    const aReadsB = await restFetch(
      `/people?id=eq.${bPerson!.id}`,
      a.user.accessToken,
    );
    expect(await aReadsB.json()).toEqual([]);

    const aWritesIntoB = await restFetch("/people", a.user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: b.householdId,
        display_name: "Intruder",
        relationship_type: "other",
      }),
    });
    expect(aWritesIntoB.status).toBe(403);

    // A cannot archive B's person either.
    const aArchivesB = await restFetch(
      `/people?id=eq.${bPerson!.id}`,
      a.user.accessToken,
      { method: "PATCH", body: JSON.stringify({ is_active: false }) },
    );
    await aArchivesB.text();
    const stillActive = await restFetch(
      `/people?id=eq.${bPerson!.id}`,
      b.user.accessToken,
    );
    const [row] = (await stillActive.json()) as Array<{ is_active: boolean }>;
    expect(row?.is_active).toBe(true);
  });

  test("archiving sets is_active = false and the row remains readable", async () => {
    const { user, householdId } = await setupHousehold("archive");

    const createRes = await restFetch("/people", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        display_name: "Old Nominee",
        relationship_type: "nominee",
      }),
    });
    const [person] = (await createRes.json()) as Array<{ id: string }>;

    const archiveRes = await restFetch(
      `/people?id=eq.${person!.id}`,
      user.accessToken,
      { method: "PATCH", body: JSON.stringify({ is_active: false }) },
    );
    expect(archiveRes.status).toBe(204);

    const readRes = await restFetch(
      `/people?id=eq.${person!.id}`,
      user.accessToken,
    );
    const [row] = (await readRes.json()) as Array<{ is_active: boolean }>;
    expect(row?.is_active).toBe(false);
  });
});

test.describe("institutions", () => {
  test("rejects an invalid institution_type", async () => {
    const { user, householdId } = await setupHousehold("instType");

    const response = await restFetch("/institutions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "Crypto Exchange Co",
        institution_type: "crypto_exchange",
      }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects a malformed support_email", async () => {
    const { user, householdId } = await setupHousehold("badEmail");

    const response = await restFetch("/institutions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "HDFC Bank",
        institution_type: "bank",
        support_email: "not-an-email",
      }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects an exact-name duplicate within the same household (case-insensitive)", async () => {
    const { user, householdId } = await setupHousehold("exactDup");

    const first = await restFetch("/institutions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "HDFC Bank",
        institution_type: "bank",
      }),
    });
    expect(first.status).toBe(201);

    const second = await restFetch("/institutions", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "hdfc bank", // same name, different case
        institution_type: "bank",
      }),
    });
    expect(second.status).toBe(409);
  });

  test("two households' institutions are mutually unreadable and unwritable, and an institution can be referenced by a financial_account", async () => {
    const a = await setupHousehold("instA");
    const b = await setupHousehold("instB");

    const bInstRes = await restFetch("/institutions", b.user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: b.householdId,
        name: "B Bank",
        institution_type: "bank",
      }),
    });
    const [bInstitution] = (await bInstRes.json()) as Array<{ id: string }>;

    const aReadsB = await restFetch(
      `/institutions?id=eq.${bInstitution!.id}`,
      a.user.accessToken,
    );
    expect(await aReadsB.json()).toEqual([]);

    const aWritesIntoB = await restFetch("/institutions", a.user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: b.householdId,
        name: "Intruder Bank",
        institution_type: "bank",
      }),
    });
    expect(aWritesIntoB.status).toBe(403);

    // Acceptance criterion: an institution can later be linked to an
    // account — proven here by actually creating one against it.
    const accountRes = await restFetch(
      "/financial_accounts",
      b.user.accessToken,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          household_id: b.householdId,
          name: "B Savings",
          account_type: "savings",
          institution_id: bInstitution!.id,
          currency_code: "INR",
        }),
      },
    );
    expect(accountRes.status).toBe(201);

    // And A still can't attach an account to B's institution.
    const aLinksToB = await restFetch(
      "/financial_accounts",
      a.user.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: a.householdId,
          name: "Sneaky",
          account_type: "savings",
          institution_id: bInstitution!.id,
          currency_code: "INR",
        }),
      },
    );
    expect([400, 403]).toContain(aLinksToB.status);
  });

  test("archiving sets is_archived = true and linked accounts keep referencing it", async () => {
    const { user, householdId } = await setupHousehold("instArchive");

    const instRes = await restFetch("/institutions", user.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        name: "Old Bank",
        institution_type: "bank",
      }),
    });
    const [institution] = (await instRes.json()) as Array<{ id: string }>;

    await restFetch("/financial_accounts", user.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        name: "Savings at Old Bank",
        account_type: "savings",
        institution_id: institution!.id,
        currency_code: "INR",
      }),
    });

    const archiveRes = await restFetch(
      `/institutions?id=eq.${institution!.id}`,
      user.accessToken,
      { method: "PATCH", body: JSON.stringify({ is_archived: true }) },
    );
    expect(archiveRes.status).toBe(204);

    const accountsRes = await restFetch(
      `/financial_accounts?institution_id=eq.${institution!.id}`,
      user.accessToken,
    );
    const accounts = (await accountsRes.json()) as unknown[];
    expect(accounts).toHaveLength(1);
  });
});
