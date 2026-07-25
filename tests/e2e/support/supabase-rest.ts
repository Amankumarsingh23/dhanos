import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

export type TestUser = { accessToken: string; userId: string };

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dhanos.local`;
}

/**
 * Signs up a brand-new user directly against the local Supabase Auth REST
 * API — no browser needed. Mirrors docs/local-supabase.md's "Test RLS"
 * curl methodology, used here to prove household tenant isolation (see
 * PROMPT 4's acceptance criteria) with real access tokens rather than
 * mocks.
 */
export async function signUpTestUser(label: string): Promise<TestUser> {
  const email = uniqueEmail(label);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: "test-password-123" }),
  });

  if (!response.ok) {
    throw new Error(
      `Signup failed for ${email}: ${response.status} ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    user: { id: string };
  };
  return { accessToken: data.access_token, userId: data.user.id };
}

/** A PostgREST request authenticated as the given test user. */
export async function restFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/**
 * Inserts one row and returns it, using `Prefer: return=representation` —
 * the same pattern already established in security-review.spec.ts's
 * `setupVictimHousehold`. Throws with the response body on failure so a
 * fixture-setup mistake fails loudly rather than producing a confusing
 * `undefined` downstream.
 */
export async function restInsert<T = Record<string, unknown>>(
  table: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await restFetch(`/${table}`, accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Insert into ${table} failed: ${response.status} ${await response.text()}`,
    );
  }
  const [row] = (await response.json()) as [T];
  return row;
}

/** Calls a Postgres RPC as the given user, returning the parsed response and the raw Response for status/error assertions. */
export async function restRpc<T = unknown>(
  name: string,
  accessToken: string,
  args: Record<string, unknown>,
): Promise<{ response: Response; data: T | null; text: string }> {
  const response = await restFetch(`/rpc/${name}`, accessToken, {
    method: "POST",
    body: JSON.stringify(args),
  });
  // Read the body exactly once — Response.text()/.json() both consume the
  // stream, so a caller that also wants the raw text for a failure
  // message (rather than re-reading) must get it from here.
  const text = await response.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { response, data, text };
}

/** One of a household's auto-seeded default transaction categories (see seed_default_transaction_categories() — every household gets these on creation, so tests never need to create their own). */
export async function getAnyCategoryId(
  accessToken: string,
  householdId: string,
): Promise<string> {
  const response = await restFetch(
    `/transaction_categories?household_id=eq.${householdId}&limit=1&select=id`,
    accessToken,
  );
  const [row] = (await response.json()) as [{ id: string }];
  if (!row) {
    throw new Error(
      `No transaction_categories found for household ${householdId} — seed_default_transaction_categories() should have created them on household creation.`,
    );
  }
  return row.id;
}

/** Calls get_or_create_household as the given user — see supabase/migrations/20260721051051_household_memberships.sql. */
export async function createHousehold(
  accessToken: string,
  name: string,
  overrides: { baseCurrencyCode?: string } = {},
): Promise<string> {
  const response = await restFetch(
    "/rpc/get_or_create_household",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        p_name: name,
        p_base_currency_code: overrides.baseCurrencyCode ?? "INR",
        p_timezone: "Asia/Kolkata",
        p_financial_month_start_day: 1,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `get_or_create_household failed: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as string;
}
