import { expect, test } from "@playwright/test";
import {
  createHousehold,
  restFetch,
  signUpTestUser,
} from "./support/supabase-rest";

/**
 * Proves the household tenant boundary directly against the local Supabase
 * REST API with real access tokens for two independent users — no browser
 * needed, no UI to route around. This is the acceptance criterion for
 * PROMPT 4 ("Two test users cannot access each other's financial records")
 * exercised at the actual enforcement layer (RLS), the same methodology
 * docs/local-supabase.md's "Test RLS" section uses manually via curl.
 */

test.describe("household tenant isolation", () => {
  test("two independent users' households are mutually unreadable and unwritable", async () => {
    const userA = await signUpTestUser("isoA");
    const userB = await signUpTestUser("isoB");

    const householdA = await createHousehold(userA.accessToken, "Household A");
    const householdB = await createHousehold(userB.accessToken, "Household B");

    // Neither user can read the other's household.
    const aReadsB = await restFetch(
      `/households?id=eq.${householdB}`,
      userA.accessToken,
    );
    expect(await aReadsB.json()).toEqual([]);

    const bReadsA = await restFetch(
      `/households?id=eq.${householdA}`,
      userB.accessToken,
    );
    expect(await bReadsA.json()).toEqual([]);

    // Nor the other's membership rows.
    const aReadsBMembers = await restFetch(
      `/household_memberships?household_id=eq.${householdB}`,
      userA.accessToken,
    );
    expect(await aReadsBMembers.json()).toEqual([]);

    // A cannot write a net-worth snapshot into B's household.
    // total_assets/total_liabilities/net_worth_minor_units are `generated
    // always as` columns (derived from the breakdown columns below, see
    // supabase/migrations/20260723160000_net_worth_breakdown.sql) — never
    // set directly; the breakdown columns all default to 0.
    const crossWrite = await restFetch(
      "/net_worth_snapshots",
      userA.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: householdB,
          as_of_date: "2026-07-21",
          currency_code: "INR",
        }),
      },
    );
    expect(crossWrite.status).toBe(403);

    // A cannot change B's household settings — RLS filters the row out of
    // the update entirely (204/no rows affected), not a visible error, so
    // the only reliable proof is that B's name is still B's name after.
    await restFetch(`/households?id=eq.${householdB}`, userA.accessToken, {
      method: "PATCH",
      body: JSON.stringify({ name: "Hijacked" }),
    });
    const stillB = await restFetch(
      `/households?id=eq.${householdB}`,
      userB.accessToken,
    );
    const [householdBRow] = (await stillB.json()) as Array<{ name: string }>;
    expect(householdBRow?.name).toBe("Household B");

    // A cannot add themselves to B's household membership list either.
    const selfAdd = await restFetch(
      "/household_memberships",
      userA.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: householdB,
          user_id: userA.userId,
          role: "owner",
          status: "active",
        }),
      },
    );
    expect(selfAdd.status).toBe(403);
  });

  test("resubmitting onboarding does not create a second household", async () => {
    const user = await signUpTestUser("dup");

    const firstId = await createHousehold(user.accessToken, "First Household");
    const secondId = await createHousehold(
      user.accessToken,
      "Attempted Duplicate",
      { baseCurrencyCode: "USD" },
    );

    expect(secondId).toBe(firstId);

    const households = await restFetch(
      "/households?select=id",
      user.accessToken,
    );
    expect(await households.json()).toHaveLength(1);
  });
});
