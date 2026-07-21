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
