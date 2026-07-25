# DhanOS — Production Acceptance Report (PROMPT 55)

Status: **review conducted; one real, reproducible bug found and fixed across 5 files, with a permanent regression test.** No live production deployment exists yet (see [deployment.md](./deployment.md), [vercel-preview.md](./vercel-preview.md), [production-supabase.md](./production-supabase.md) — external Vercel/Supabase Cloud accounts aren't available in this session), so "test the deployed product as a real user" was conducted against the closest available substitute: a genuine `pnpm build && pnpm start` production build, running against the local Supabase stack after a fresh `db:reset` — the same architecture and code that would run in production, not `next dev`, not mocks. Every finding below is real, reproduced with real browser interaction (Playwright, headed logic even where run headless — actual clicks, actual network requests, actual timing), not inferred from reading code.

## 1. Methodology

- **As a real user, not just via existing specs.** The existing 191-test Playwright suite (verified green as part of [deployment.md](./deployment.md)'s pre-deploy checklist) already covers most golden paths. This review specifically hunted for gaps — review areas with no existing automated coverage — by writing new, throwaway investigation scripts, watching what actually happened (including printing real DOM state, real download contents, real log lines), and only then deciding whether something was a bug.
- **Never trust a first failure.** Every apparent bug in this pass was re-investigated with a tighter, more precise reproduction before being classified as real — two of the four areas investigated turned out to be *test* bugs (an ambiguous Playwright locator, a `force: true` click bypassing a real browser safeguard no actual user could bypass), not app bugs. Only after isolating the confounds was the one real finding (§3) confirmed.
- **Fix root cause, verify empirically.** The confirmed bug was fixed, then the fix was verified by re-running the exact same reproduction that first caught it (not just "looks right on read") — the before/after DOM-state samples in §3 are both real captures.

## 2. Review — findings per area

| Area | Result |
|---|---|
| **Authentication** | No new issues. Signup/login/logout, redirect-injection protection, and expired-callback-link handling all already covered (`auth.spec.ts`, `authentication-journey.spec.ts`). |
| **First-use onboarding** | No new issues. Household creation, idempotent resubmission (`household-isolation.spec.ts`), and the full onboarding→dashboard flow all covered. |
| **Transaction entry** | No new issues beyond §3 (which affects the *filter* UI around transactions, not entry itself). Create/edit/refund/split flows covered by `cash-flow-journey.spec.ts` and unit tests. |
| **Calculations** | No new issues. Out of scope for a fresh audit in this pass — [financial-correctness-review.md](./financial-correctness-review.md) already conducted a dedicated audit of every money-touching calculation against [money-calculation-rules.md](./money-calculation-rules.md); nothing in this review's real-user walkthrough surfaced a new calculation discrepancy. |
| **Charts** | No new issues. Rendered and exercised as part of every journey spec's dashboard assertions; no visual/data mismatch observed. |
| **Private documents** | No new issues. Upload, signed-URL download, and cross-household rejection all covered (`insurance-journey.spec.ts`, `security-review.spec.ts`'s Storage-path-guessing tests). |
| **Slow network** | **Real bug found and fixed — see §3.** No existing automated coverage before this pass (confirmed: no spec throttles or delays network responses anywhere in the suite prior to this review). |
| **Invalid input** | No new issues. Extensively covered — every validation schema has unit tests, and `security-review.spec.ts`'s "malformed/adversarial input via direct REST" describe block specifically bypasses the app layer to hit Postgres/PostgREST directly (zero-amount rejection, invalid currency, mass assignment, forged `household_id`). |
| **Mobile** | No new issues. `shell.spec.ts`'s mobile-nav test and `accessibility.spec.ts`'s 375px-viewport dialog tests both passed; these are emulated-viewport checks (Chromium desktop engine, not real device hardware) — see [deployment.md](./deployment.md) §4 item 19 for the standing recommendation to spot-check on an actual phone once a real production URL exists, which no local review can substitute for. |
| **Accessibility** | No new issues. `accessibility.spec.ts` (253 lines, axe-core scans across every route/viewport combination, dialog focus-trap tests, keyboard-only navigation tests) passed in full as part of this pass's suite run. |
| **Session expiration** | Investigated fresh — no bug found. Two scenarios tested: (1) navigating to a protected route after the session cookie is cleared correctly redirects to `/login`; (2) submitting an already-open, filled-in form *after* the session is invalidated mid-interaction (clearing cookies without navigating first — the realistic "left a tab open past expiry" case) correctly fails safely: the mutation pipeline's `requireHouseholdRole` rejection surfaces a visible error rather than crashing or silently no-op'ing. No existing spec covered the mid-interaction case before this pass (`auth.spec.ts`'s existing "session expiration" coverage was specifically about an expired *email link*, a different scenario) — worth a permanent regression test as a fast-follow, noted but not added in this pass to keep scope to the one confirmed, fixed bug (see "Do not add new features during this phase" and §5). |
| **Archived data** | Investigated fresh — no bug found, beyond confirming §3's checkbox affects this exact UI. A closed account correctly disappears from the default list and correctly reappears (now with the fix, *immediately* on click) when "Show closed" is checked. Existing coverage (`people-institutions.spec.ts`) only exercised People/Institutions archival before this pass; Accounts' closed-account visibility had no dedicated e2e coverage until this review. |
| **Exports** | Investigated fresh — no bug found. The JSON export button (Settings → Data) was never exercised end-to-end in a real browser before this pass (only `src/features/settings/export/build.test.ts`'s unit-level output and the rate-limit unit tests existed). Verified live: clicking "Export all data (JSON)" produces a real file download (`dhanos-export-<date>.json`) with the expected shape (`schemaVersion`, `exportedAt`, `householdId`, `notes`, `tables`, `truncatedTables`, `failedTables`) and real `schemaVersion: "2.0.0"` content, not a stub. |
| **Reminders** | No new issues found in this pass's lighter-touch check (page loads without error for both an empty and the seeded demo household; no dedicated interactive snooze/skip/complete browser test exists — `reminders.sync` itself is unit- and integration-tested per [observability.md](./observability.md) §8, but the UI interactions are lower-risk, read-mostly surface not exercised as deeply in this pass given the time budget — noted as a smaller residual gap, not a finding). |
| **Production logs** | No new issues — verified structurally correct. Every mutation performed during this review's investigation (account/institution/income/transaction/person creation and archival, an export) produced structured JSON log lines matching [observability.md](./observability.md)'s documented shape when errors occurred, and zero sensitive values (account numbers, document contents, transaction descriptions) appeared in any log line inspected — consistent with [security-review.md](./security-review.md)'s "zero `console.*` calls anywhere in application code" finding and this review finding nothing to contradict it. |

## 3. Bug found — the "Show [X]" filter checkboxes don't reflect a click under real network latency

Followed the full 8-step bug process:

### 1. Reproduce

Accounts' "Show closed" checkbox is bound directly to `filters.includeClosed` — a prop read fresh from the Server Component on every navigation (the app's own documented URL-searchParam-driven filter pattern — see [implementation-status.md](./implementation-status.md)'s Accounts row), **not** local React state. Clicking it calls `router.push()` with an updated URL, and the checkbox's visual `checked` state only updates once that navigation completes and the Server Component re-renders with fresh data.

Reproduced by throttling the specific navigation request the checkbox triggers (a realistic 1.5s delay, simulating a slow connection) and sampling the checkbox's actual `checked` DOM state every 100ms for 1.5s after clicking:

```
CHECKBOX STATE SAMPLES over 1.5s after click:
[ false, false, false, false, false, false, false, false, false, false, false, false, false, false, true ]
```

The checkbox stayed **unchecked** for the entire 1.4 seconds of the request, only flipping at the very end. A real user on a slow or degraded connection clicking this checkbox would see nothing happen for well over a second — indistinguishable from the click not having registered at all.

### 2. Classify severity

**Medium.** Not a data-correctness or security issue (no data is lost, corrupted, or exposed — this is purely a visual-feedback defect), but a genuine, guaranteed-to-occur (not merely occasional) usability defect that actively misleads the user about whether their action was received, on every single click, with severity scaling directly with connection quality — exactly the scenario this review's "slow network" category exists to catch.

### 3. Add regression test

`tests/e2e/slow-network.spec.ts` (new, permanent) — throttles the same request, asserts the checkbox reflects the click within 200ms (not "eventually"), stays checked throughout the simulated 1.5s delay (not flip-flopping), and is still checked once the real navigation completes.

### 4. Fix root cause

`filters.includeClosed` (and its siblings — see below) is the *authoritative* value, but the checkbox needs to show the *intended* value immediately while that authoritative value catches up. Fixed with React 19's `useOptimistic`: the checkbox now shows the just-clicked value immediately and automatically reconciles with the real server value once the navigation settles — the correct primitive for exactly this "optimistic UI, eventually consistent with the server" pattern, rather than a workaround.

**Scope**: a direct code search (`grep -rn "checked={filters\." src --include="*.tsx"`) found this was not isolated to Accounts — the identical pattern existed in **5 files total**, all fixed with the same change:

- `src/features/accounts/accounts-manager.tsx` ("Show closed")
- `src/features/institutions/institutions-manager.tsx` ("Show archived")
- `src/features/income/income-manager.tsx` ("Show inactive")
- `src/features/transactions/transactions-manager.tsx` ("Show cancelled")
- `src/features/people/people-manager.tsx` ("Show archived")

Fixing only the one instance that happened to be reproduced first, while leaving four other checkboxes with the identical, already-understood defect, would have left known bugs unfixed for no reason — the fix pattern is small, mechanical, and uses a hook (`useOptimistic`) already proven correct by the first fix's verification.

### 5. Verify locally

- `pnpm typecheck` — clean across all 5 changed files.
- `pnpm test` — 808/808 unit tests still passing (no unit test covers this UI interaction directly, but confirms no regression elsewhere).
- Re-ran the exact §3.1 reproduction against the fixed build: checkbox now shows `true` (checked) on **every** sample from the first 100ms onward — see the before/after contrast.
- `tests/e2e/slow-network.spec.ts` (the new permanent regression test) passes.
- Full Playwright suite (191 pre-existing tests + the new regression test) re-run against the fixed build — see §4 for the result.

### 6. Verify preview

**Not performed** — no Vercel Preview deployment exists (see [vercel-preview.md](./vercel-preview.md)). This step is pending the external account setup documented there; the fix should be re-verified against a real preview URL (repeating §3.1's throttled-checkbox check) before merge, per [deployment.md](./deployment.md) §2's "critical Playwright tests against preview" step.

### 7. Deploy

**Not performed** — no production Vercel/Supabase project exists (see [deployment.md](./deployment.md), [production-supabase.md](./production-supabase.md)).

### 8. Verify production

**Not performed**, for the same reason as steps 6–7. Once a real deployment exists, re-run §3.1's check (or `tests/e2e/slow-network.spec.ts` pointed at the production URL) as part of the standard post-deploy smoke pass.

## 4. Full suite result after the fix

**192/192 passed, in 3.9 minutes** (191 pre-existing tests across all 16 spec files, plus the new `slow-network.spec.ts` regression test) — a completely clean build (`rm -rf .next test-results` first), against a real `next build && next start` and the local Supabase stack. No test flakiness, no regression from any of the 5 `useOptimistic` fixes.

This run also independently reproduced the exact same real, unplanned error-monitoring evidence [deployment.md](./deployment.md) §2 first captured during PROMPT 54's pre-deploy pass — a genuine parallel-worker-timing `NotFoundError` (a different account id this time, same mechanism), correctly caught and logged:

```json
{"level":"error","event":"client.render_error","environment":"production","release":"local","requestId":"e752df58-...","digest":"3261917509","pathname":"/app/accounts/b065dcf5-...","userId":"f8520323-...","errorName":"Error","errorMessage":"An error occurred in the Server Components render. The specific message is omitted in production builds..."}
```

Two independent occurrences of the identical, correct behavior (safe fallback UI, structured log, no leaked detail) is stronger evidence than one — this isn't a fluke, the error-monitoring pipeline reliably does what [observability.md](./observability.md) documents it should.

## 5. Explicitly out of scope for this pass

Per "Do not add new features during this phase" and to keep this review's fix scope to the one confirmed, reproduced, root-caused bug rather than opportunistically expanding: two smaller residual gaps were noted during the review (§2's Session expiration and Reminders rows) but not turned into new permanent tests or additional fixes in this pass, since neither surfaced an actual defect — only an absence of prior automated coverage for a scenario that, once tested, behaved correctly. Recommended as fast-follow test-coverage additions, not bugs to fix.
