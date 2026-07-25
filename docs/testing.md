# DhanOS — Testing

Status: **implemented and verified**. This documents the actual test commands in this repository and what each one needs running first — see [local-supabase.md](./local-supabase.md) for the local Supabase stack itself.

## 1. Unit tests — `pnpm test`

```bash
pnpm test          # runs once (CI-style)
pnpm test:watch    # reruns on file change
```

Runs Vitest over every `src/**/*.test.ts(x)` file (`vitest.config.ts`). No external services required — every unit test is a pure function or a mocked-dependency test (Supabase clients, `next/cache`, etc. are all `vi.mock`'d; see e.g. `src/lib/mutations/index.test.ts`). As of this writing: **794 tests across 75 files**, all passing.

This is where every named calculation module lives — money parsing/formatting, transaction classification, transfer balancing, split validation, account balance, cash flow, savings rate, investment gains, daily staking, EMI, loan prepayment, lending outstanding, ownership share, goal funding, inflation, emergency fund, net worth, safe redirects, file validation, and CSV sanitization (see `docs/financial-correctness-review.md` for the money-arithmetic modules specifically, and PROMPT 48's own audit for the full list-to-file mapping).

## 2. Integration/e2e tests — `pnpm test:e2e`

```bash
pnpm db:start      # local Supabase must be running first
pnpm test:e2e
```

Runs Playwright (`playwright.config.ts`). **Requires the local Supabase stack running** (`pnpm db:start` — see [local-supabase.md](./local-supabase.md) §"Start"; needs Docker). Playwright's own `webServer` config then runs `pnpm build && pnpm start` and waits for `http://127.0.0.1:3100` before running anything — the first run after a code change is slow (a full production build), subsequent runs reuse the server (`reuseExistingServer: !process.env.CI`) unless you're in CI.

To run one spec file only (much faster while iterating):

```bash
pnpm exec playwright test tests/e2e/financial-mutations.spec.ts --reporter=list
```

As of this writing: **191 tests across 16 spec files**, all passing.

### What "integration test" means in this repo

Most of `tests/e2e/*.spec.ts` are real Playwright browser tests (clicking through the UI — see `shell.spec.ts`, `accessibility.spec.ts`, `auth.spec.ts`). But several — `household-isolation.spec.ts`, `security-review.spec.ts`, and `financial-mutations.spec.ts` — never open a browser page at all. They call the **real local Supabase REST/RPC API directly** with real access tokens for freshly signed-up test users (`tests/e2e/support/supabase-rest.ts`: `signUpTestUser`, `createHousehold`, `restInsert`, `restRpc`, `restFetch`), exercising the exact RPC/table-insert path each Server Action calls, with Row Level Security actually enforced — never mocked. This is deliberate: RLS is the real tenancy boundary (see [security-model.md](./security-model.md) §3), and a mocked Supabase client can't prove it holds.

`financial-mutations.spec.ts` (PROMPT 48) covers the mutation flows unit tests can't reach — account creation, transfer, refund, recurring occurrence, SIP contribution, loan payment, lending repayment, insurance premium, asset valuation, monthly closing, and net-worth snapshot — each proving two things together: the owner's mutation succeeds with correct data, **and** a second, independent household's user is denied the same access. A regression in either the Server Action's role check or the RLS policy backing it fails this suite, not just a manual review.

These REST-only specs still run inside Playwright (there's no separate lightweight runner in this repo) — they just don't call any `page.*` methods, so the browser they spin up sits idle. Still requires the `webServer` build/start per Playwright's config; there is currently no way to skip that for a REST-only file without editing `playwright.config.ts`.

### Full browser journeys (PROMPT 49)

`*-journey.spec.ts` files are real, full browser journeys — every field filled and every button clicked exactly as a user would, using accessible selectors (`getByRole`/`getByLabel`, matching this repo's existing convention) rather than test-id hooks:

- `authentication-journey.spec.ts` — signup → onboarding → dashboard → logout → login, chained in one session.
- `cash-flow-journey.spec.ts` — create account → add income (source + a recorded receipt) → add expense → transfer → verify the dashboard reflects all of it.
- `investment-sip-journey.spec.ts` — create a daily SIP (asset/platform created inline, no separate holding-setup step) → record a contribution → verify the funding account's balance and the portfolio's "Contributed" column.
- `debt-journey.spec.ts` — create an education loan → disburse it → record an EMI payment → verify outstanding principal and the payment history's interest column.
- `insurance-journey.spec.ts` — create a policy → upload its document through the general vault (a real file upload against local Supabase Storage, linked back via the policy's id) → renew it and follow the link to the new period.
- `asset-goal-journey.spec.ts` — create an inherited-land asset → create a goal → verify net worth (live-computed, no snapshot needed) and the goal's readiness badge.
- `security-journey.spec.ts` — two separate browser contexts (`browser.newContext()`, not just two `signUpTestUser` tokens) prove a second household's signed-in user can't reach the first's account or document via direct URL navigation, their own list pages, or search.

Each journey signs up its own fresh user via `signUpAndOnboard` (`tests/e2e/support/ui.ts`) — no shared fixture household, no arbitrary `waitForTimeout` (every wait is Playwright's built-in auto-waiting via `expect(...).toBeVisible()` or an action's own actionability check), and nothing runs against anything but the local dev Supabase stack. Failures leave a trace (`playwright.config.ts`'s `trace: "retain-on-failure"`, fixed as part of PROMPT 49 — the old `"on-first-retry"` never fired locally since local runs don't retry) — inspect one with:

```bash
pnpm exec playwright show-trace test-results/<test-folder>/trace.zip
```

## 3. Type checking — `pnpm typecheck`

```bash
pnpm typecheck
```

`tsc --noEmit`. No external services required. Run this alongside `pnpm test` before considering any change done — several bugs in this codebase's history were caught here first (a stale `src/types/database.ts` after a migration, for instance — see `pnpm db:types` in [local-supabase.md](./local-supabase.md)).

## 4. Proving the tests are behavioral, not tautological

A test suite that always passes regardless of the code it's testing isn't proving anything. Two ways this has actually been checked in this codebase, and how to redo either:

**Application-layer authorization** — every financial mutation goes through `runHouseholdMutation` (`src/lib/mutations/index.ts`), which calls `requireHouseholdRole` before running the actual write. `src/lib/mutations/index.test.ts` mocks `requireHouseholdRole` and asserts the write (`run`) is never called when it rejects. Temporarily bypassing that call (e.g. hardcoding a fake authorized user/membership instead of awaiting the real check) makes 3 of that file's 9 tests fail immediately — confirmed live during PROMPT 48's own audit, then reverted.

**Database-layer authorization (RLS)** — every cross-household assertion in `household-isolation.spec.ts`, `security-review.spec.ts`, and `financial-mutations.spec.ts` only passes because Postgres RLS actually rejects the attacker's request; there is no mock to fall back on. Proving this requires temporarily weakening a live RLS policy (e.g. `alter policy ... using (true) with check (true)` on one table) and re-running the affected spec to watch it fail, then restoring the policy — this is a live security-policy change even when local and temporary, so treat it the same as any other security-config edit: confirm with whoever owns the environment before doing it, and never on a shared/remote database.

## 5. Seeding realistic volume (optional, for performance work)

Not needed for the tests above, but if you need bulk data to reproduce PROMPT 47's performance audit: see `supabase/perf-seed/` (two SQL scripts, run directly with `psql` against the local instance — `pnpm db:start` first). They create a dedicated `Perf Audit Household` plus 60 disposable "noise" households; drop them manually afterward (`delete from households where name like 'Noise Household%' or id = '99999999-9999-4999-8999-999999999999';`) rather than leaving bulk synthetic data in the shared local dev database.
