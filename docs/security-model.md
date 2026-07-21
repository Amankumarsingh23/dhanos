# DhanOS — Security Model

Status: **proposed**. No auth code, Supabase project, or environment configuration exists yet. This defines the security posture to implement, since DhanOS handles highly sensitive personal financial data (account numbers, balances, insurance nominees, documents).

## 1. Threat model summary

- **Primary asset**: a household's complete financial picture — balances, holdings, debts, insurance, identity-adjacent documents (statements, policy PDFs).
- **Primary threats**: cross-tenant data leakage (household A reading household B's data), stolen/leaked session or service-role credentials, secrets committed to the repo, unauthorized access via a shared/family device, document storage exposure.
- **Not in scope for the app itself**: protecting against a compromised Supabase/Vercel platform account — that's operational account security (2FA, credential hygiene) rather than application architecture, but should be noted as a real dependency.

## 2. Authentication

- Supabase Auth as the identity provider: email/password at minimum, optional OAuth providers later.
- Session handling via Supabase's standard cookie-based session for server-rendered Next.js (not raw JWTs in localStorage) to reduce XSS token-theft exposure.
- Password reset via Supabase's built-in flow (time-limited token email).
- No custom auth/session logic to be hand-rolled — rely on the maintained Supabase Auth helpers for Next.js.

## 3. Authorization (tenancy isolation)

- Household is the tenant boundary. Every financial table carries `household_id` and has Row Level Security enabled from creation (see [database-plan.md](./database-plan.md) §2).
- Role-based access within a household: `owner`/`admin` (full read/write, manage settings and membership), `editor` (read/write financial data), `viewer` (read-only) — enforced by RLS policies, not just hidden UI. A membership's `status` (`active`/`invited`/`suspended`) gates access independently of role — only `active` counts; `invited` is reserved for a collaboration-invite flow not yet built.
- Centralized authorization helpers (`src/lib/households/permissions.ts`): `requireUser`, `requireHousehold` (page-gating — redirects to `/onboarding`), `requireHouseholdMember`/`requireHouseholdRole` (data-layer — throw, and always re-verify a *submitted* `household_id` against the database rather than trusting it), `canManageHousehold`. A household is created exclusively through `get_or_create_household()` (a Postgres function, `security invoker`), which is idempotent — a retry/double-submit returns the caller's existing household rather than creating a duplicate (enforced by a partial unique index, one owner-membership per user).
- The Next.js layer must never be the only enforcement point — every Supabase query (server or client) executes under RLS, so even a bug in server action logic cannot leak cross-household data. Application code is a second, redundant layer of scoping, not the primary one. Verified directly against two independent users' access tokens in `tests/e2e/household-isolation.spec.ts`, not just through app code.
- The `SUPABASE_SERVICE_ROLE_KEY` (which bypasses RLS) is used only in narrowly-scoped, audited server contexts (e.g. a scheduled job computing net-worth snapshots across all households) — never in a request path that echoes arbitrary user-supplied filters, and never sent to the client.

## 4. Secrets & environment variables

- `.env*` files gitignored from the first commit; no secrets ever committed, including in example/seed files (use obviously-fake values in `.env.example`).
- Client-exposed variables limited to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL` (safe under RLS by design).
- Service-role key and any third-party API keys (future bank-aggregation integrations, etc.) live only in server-side platform environment config (Vercel project env vars, Supabase project settings), scoped per environment (dev/staging/prod), rotated if ever suspected exposed.

## 5. Data handling

- **Documents** (bank statements, policy PDFs, receipts): stored in Supabase Storage with bucket-level policies mirroring the household RLS pattern — a document must not be fetchable by URL guessing; use signed URLs with short expiry for downloads rather than public bucket access.
- **PII minimization**: store only what the product scope requires (account *labels*, not necessarily full account numbers where a masked/last-4 representation suffices for the UI).
- **Export**: the data-export feature (see [product-scope.md](./product-scope.md) §3.9) must itself be access-controlled and rate-limited — a full financial export is a high-value target if an account session is hijacked.
- **Audit trail**: because historical/append-only records are a domain requirement (see [money-calculation-rules.md](./money-calculation-rules.md)), the same append-only tables that provide financial correctness also double as a partial audit log; consider a dedicated lightweight `audit_log` table for security-relevant events (login, export, membership changes, service-role key usage) distinct from financial history.

## 6. Application-layer risks to guard against once implementation starts

- **IDOR (insecure direct object reference)**: any route/server action taking an entity ID (account, transaction, document) must confirm household ownership via RLS-backed query, not just "does this ID exist."
- **Mass assignment**: server actions must validate input against an explicit zod schema (allow-list fields), never spread a raw client payload into an insert/update.
- **SSRF/webhook risk**: if bank-aggregation or export-to-external-service features are added later, treat any outbound URL/callback as untrusted input.
- **Rate limiting**: auth endpoints (sign-in, password reset) and the export endpoint are the two most important places to add rate limiting early, given they're the highest-value abuse targets in a personal-finance app.
- **Dependency hygiene**: given the sensitivity of the data, keep an explicit habit of dependency auditing (`npm audit`/`pnpm audit`) as part of the deployment checklist, not just at project start.

## 7. Current state

Auth is implemented per §2: Supabase Auth (email/password) via `@supabase/ssr`'s cookie-based session, no custom session logic, password reset via Supabase's built-in flow. Concretely:

- The authenticated user is always resolved server-side (`getCurrentUser`/`requireUser` in `src/lib/auth/session.ts`, `supabase.auth.getUser()` — never trusting an unverified cookie); the browser is never the source of truth.
- `src/lib/auth/safe-redirect.ts` rejects any `next`/redirect-target value that isn't a same-origin path (protocol-relative `//`, backslash tricks, absolute URLs, and non-http(s) schemes all fall back to a safe default) — covered by both unit tests and an e2e test that attempts a real redirect-injection sign-in.
- The `profiles` table (see `supabase/migrations/20260721024731_profiles.sql`) has RLS scoped to `id = auth.uid()` for select/update only — no insert policy exists, so even a granted `authenticated` role can never create a stray profile row; rows are provisioned exclusively by a `SECURITY DEFINER` trigger on `auth.users`.
- `SUPABASE_SERVICE_ROLE_KEY` is not used anywhere in the auth flow — every auth mutation goes through the cookie-aware server client (`src/lib/supabase/server.ts`) or the request-scoped client built in `src/app/auth/callback/route.ts`.
- A real finding fixed during implementation, worth remembering for future Route Handlers: a Route Handler that constructs and returns its own `NextResponse` must attach Supabase's session cookies directly to that response object (`response.cookies.set(...)`) — routing them through `next/headers`'s `cookies().set()` (correct for Server Actions/Components) does not reliably land on a custom-built response, and separately, `request.nextUrl.origin`/`request.url` were observed reporting the server's own bound hostname under `next start` rather than the actual `Host` header, which would otherwise redirect the browser to a different origin than the one holding the just-set session cookie. See `src/app/auth/callback/route.ts` and `src/lib/auth/request-origin.ts`.

Tenancy (the household model) is implemented per §3: households/`household_memberships` with RLS, role/status enforcement, and the centralized permission helpers. Concretely:

- Cross-tenant isolation is verified directly against the REST API with two independent users' real access tokens (`tests/e2e/household-isolation.spec.ts`) — not just through app-level code — covering cross-household read (households, memberships), cross-household write (a net-worth snapshot, a household-settings update), and self-adding to an arbitrary household's membership list, all correctly rejected by RLS.
- A real finding fixed during implementation, relevant to any future `insert ... returning` against a table with a cascading `AFTER INSERT` trigger and RLS: `RETURNING` is checked against the table's SELECT policy, but evaluates against a snapshot that doesn't yet see that same trigger's own insert — so an insert whose RLS-visibility depends on its own trigger (like a household becoming visible only once `create_owner_membership` has run) fails RLS specifically on `RETURNING`, even though the insert itself succeeds without it. `get_or_create_household()` avoids this by generating the id up front and never using `RETURNING` — see `supabase/migrations/20260721051051_household_memberships.sql`.

The app shell and privacy mode address the "unauthorized access via a shared/family device" threat noted in §1. Concretely:

- Every nested `/app/*` route is gated in one place (`src/app/(workspace)/app/layout.tsx`, which calls `requireOnboardedUser`/`requireHousehold` before rendering anything) rather than per-page — a new section route can't accidentally ship unauthenticated by forgetting a check, since the shell (and the data it needs) never renders without one.
- Privacy mode (`src/components/shared/privacy-provider.tsx`, `SensitiveAmount`) is a *display-only* concealment — toggling it writes a 1-bit cookie and re-renders; it never touches stored values, and revealing/concealing is purely client-side presentation. Its initial state is read from that cookie server-side (`src/app/(workspace)/app/layout.tsx`), so the very first paint already matches the user's last choice — no flash of revealed amounts, no hydration mismatch between server and client output. No formatted amount is ever passed into a page `<title>`/metadata or left in a `console.log` — see `tests/e2e/shell.spec.ts`'s title assertions.
- Privacy mode is a convenience against shoulder-surfing/a glanced-at screen, not an access control — anyone with the session can still toggle it back on. It doesn't replace RLS or the auth gate above.

Everything else in this document remains a preventive design constraint for modules not yet built, to revisit as each one lands (see [manual-test-checklist.md](./manual-test-checklist.md)).
