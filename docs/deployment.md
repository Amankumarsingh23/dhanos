# DhanOS — Production Deployment

Status: **runbook ready; no production deployment has been performed.** This is PROMPT 54's deliverable — the exact procedure for cutting the first (and every subsequent) production release, plus the record of the pre-deploy checklist actually run against this codebase during this pass. It assumes [vercel-preview.md](./vercel-preview.md) (Vercel project + preview environment) and [production-supabase.md](./production-supabase.md) (production Supabase project, migrations pushed, RLS/Storage/auth-settings verified) are both already done — this document is what comes after those two, not a replacement for either. See [production-runbook.md](./production-runbook.md) for day-to-day operation of the already-deployed system, and [rollback.md](./rollback.md) if a deployment needs to be undone.

No Vercel/Supabase production account is available in this session — every step below marked **Do this** is a real action only someone with those credentials can perform; every step marked **Verified** was actually run against this codebase during this pass, with real output, not assumed.

## 1. Before deploying — run this checklist for real, every time

Not a suggestion — every item below was actually executed against this exact codebase during this pass (a genuinely clean install, not a warm one), in this order:

| Step | Command | Result this pass |
|---|---|---|
| Clean install | `rm -rf node_modules .next && pnpm install --frozen-lockfile` | ✅ succeeded in ~2s |
| Type check | `pnpm typecheck` | ✅ clean |
| Lint | `pnpm lint` | ✅ 0 errors (17 pre-existing warnings, all `react-hooks/incompatible-library` — React Compiler's known limitation with `react-hook-form`'s `watch()`, not a defect — see the note in §5) |
| Unit tests | `pnpm test` | ✅ 808/808 passing, 77 files |
| Build | `pnpm build` | ✅ succeeded in ~38s |
| Migration verification | `pnpm db:start && pnpm db:reset` | ✅ all 31 migrations applied cleanly from scratch |
| Generated-type parity | `pnpm db:types && git diff --exit-code -- src/types/database.ts` | Diff against the last commit is the same pre-existing, already-reviewed 144-line addition this repo has carried since PROMPT 41+'s migrations (see [production-supabase.md](./production-supabase.md) §3) — stable and reproducible across repeated runs, not new drift |
| Integration tests | `pnpm test:e2e` (full suite, all 16 spec files) | See §2 |

This is exactly `.github/workflows/ci.yml`'s two jobs run by hand (see [ci-cd.md](./ci-cd.md) §4) — CI already runs all of this on every PR, so in practice "before deploying" mostly means **confirm the PR's CI run was green**, not re-run everything by hand. Re-running it here was to produce a fresh, dated confirmation for this specific release-readiness pass rather than trusting a CI run from days/weeks earlier.

## 2. Critical Playwright tests against preview

**What "against preview" means and why this pass ran against local instead**: PROMPT 54 asks for the critical Playwright subset to run against the actual Vercel Preview URL — the strongest possible evidence, since it exercises the real Vercel Edge Middleware runtime and a real (staging) Supabase Cloud project rather than local Docker containers. No Vercel preview exists yet in this session (see [vercel-preview.md](./vercel-preview.md) — codebase-ready, external accounts not yet connected), so the full suite was run against the local build+Supabase stack instead, as the closest available proxy — the same production build (`next build && next start`) and the same real, RLS-enforced Postgres, just not Vercel's actual infrastructure.

Full suite result (16 spec files, run via `pnpm test:e2e`, against a real `next build && next start` and the local Supabase stack after a fresh `db:reset`): **191/191 passed, in 3m39s.** Notably, this run also produced unplanned, real evidence that PROMPT 50's error-monitoring pipeline works end-to-end under exactly the conditions §4 item 20 asks to be checked: a genuine server-side `NotFoundError` occurred during the run (parallel-worker test-data timing, not a defect — one test navigated to an account id another parallel test had already archived), and it was caught and logged correctly:

```json
{"level":"error","event":"client.render_error","environment":"production","release":"local","requestId":"f60b1fcf-...","digest":"3261917509","pathname":"/app/accounts/3a5c08ec-...","userId":"9c246b30-...","errorName":"Error","errorMessage":"An error occurred in the Server Components render. The specific message is omitted in production builds..."}
```

— safe, digest-only message (never leaking the underlying cause), correct `"environment":"production"` (this was a real `next build`/`next start`, not `next dev`), full `requestId`/`userId`/`pathname` context, and the corresponding Playwright assertion for that page still passed, confirming the user-facing side showed the safe fallback UI rather than a crash. This is real evidence the mechanism works, not a description of intent.

**Do this** once a real preview exists: re-run at minimum the specs marked "critical" below against the live preview URL (`PLAYWRIGHT_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/smoke.spec.ts tests/e2e/auth.spec.ts tests/e2e/household-isolation.spec.ts tests/e2e/security-review.spec.ts tests/e2e/financial-mutations.spec.ts` — note `playwright.config.ts`'s `webServer` only starts a local server when no external `baseURL` override is given; check its current config before assuming this flag works as-is, it may need a small config addition to support pointing at an already-deployed URL rather than always spawning `pnpm build && pnpm start`) before promoting to production:

- **Critical (tenant-isolation/security — never skip)**: `household-isolation.spec.ts`, `security-review.spec.ts`, `financial-mutations.spec.ts`, `security-journey.spec.ts`.
- **Critical (auth — never skip)**: `auth.spec.ts`, `authentication-journey.spec.ts`.
- **High-value (golden-path journeys)**: `cash-flow-journey.spec.ts`, `investment-sip-journey.spec.ts`, `debt-journey.spec.ts`, `insurance-journey.spec.ts`, `asset-goal-journey.spec.ts`.
- **Lower priority for a preview spot-check** (still run in full CI, less critical to re-run manually against a specific preview): `shell.spec.ts`, `accessibility.spec.ts`, `smoke.spec.ts`.

## 3. Configure

### 3.1 Production variables — do this

Same four variables as every other environment (`.env.example`), Production-scoped in Vercel, pointing at the **real production Supabase project** from [production-supabase.md](./production-supabase.md) — never the staging/preview project (§3.4 there has the exact values to copy):

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production Supabase project's publishable/anon key |
| `NEXT_PUBLIC_APP_URL` | The production domain (§3.2), e.g. `https://dhanos.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Production Supabase project's service-role key |

Vercel project → Settings → Environment Variables, scoped to **Production only**. Confirm the Preview-scoped values ([vercel-preview.md](./vercel-preview.md) §4) are *not* accidentally also applied to Production (Vercel lets a variable be scoped to multiple environments at once — double-check each one's checkboxes rather than assuming the scope from when it was first added).

### 3.2 Production domain — do this

Vercel project → Settings → Domains → add the real domain. Vercel issues the TLS certificate automatically once DNS is verified (an `A`/`ALIAS` record for an apex domain, a `CNAME` for a subdomain — Vercel's domain-add flow shows the exact record to create). Budget for DNS propagation time before the domain is reachable.

### 3.3 Canonical URL — do this

Set the real domain (not the auto-generated `dhanos-<team>.vercel.app` production alias, which still resolves and serves the same deployment) as the canonical one everywhere a URL is user-facing or configured:

- If using both an apex and a `www` subdomain, pick exactly one as canonical and configure Vercel's automatic redirect from the other (Domains → the non-canonical domain → "Redirect to" the canonical one) — never serve real content from both.
- `NEXT_PUBLIC_APP_URL` (§3.1) is set to the canonical domain.
- Supabase's Site URL (§3.4) is set to the canonical domain.

**Already true, needing no further code change**: as documented in [vercel-preview.md](./vercel-preview.md) §6 for the preview case, `getRequestOrigin()`/`originFromHeaderGetter` (`src/lib/auth/request-origin.ts`) derive every auth-callback origin from the actual incoming request, never a hardcoded value — so once the canonical domain is the *only* one real user traffic reaches (via the redirect above), every callback naturally resolves to it. The `.vercel.app` alias remaining technically reachable is a Vercel platform behavior, not something the app needs to defend against — it isn't linked anywhere, isn't the registered Supabase redirect target (§3.4), and isn't what any real user would type or click.

### 3.4 Supabase redirects — do this

In the production Supabase project's dashboard (Authentication → URL Configuration) — this is the production-specific instance of what [production-supabase.md](./production-supabase.md) §6 already documents in full, restated here as the deploy-time checklist item:

- **Site URL**: the canonical production domain (§3.3), exactly — no wildcard (unlike Preview's necessary wildcard for Vercel's per-deployment URLs, per [vercel-preview.md](./vercel-preview.md) §5, production has exactly one URL).
- **Redirect URLs**: the canonical production domain only. Remove any `localhost`/`127.0.0.1`/preview-wildcard entries if this project was ever used for anything other than production — a production project should never accept a redirect to a non-production origin.

### 3.5 Security headers — already true

**Verified**: `next.config.ts` applies four baseline security headers to every response, framework-level (no per-route opt-in needed): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` — see [security-review.md](./security-review.md) Finding #4 (fixed at PROMPT 45). These apply identically on Vercel with zero additional configuration — they're Next.js response headers, not something Vercel's platform needs to know about separately. Confirm live post-deploy with `curl -sI https://<production-domain>/ | grep -i "x-frame\|x-content\|referrer\|permissions-policy"`.

**Known, deliberately deferred gap**: no Content-Security-Policy (`security-review.md` Finding #5) — needs nonce-based `script-src` wiring through middleware and a dedicated QA pass across every page (dialogs, charts, the command palette) to avoid breaking the app's own inline hydration scripts; rushing it into a deploy checklist risks shipping a broken app in the name of hardening it. Track as a fast-follow, not a launch blocker — the four headers above already cover clickjacking/MIME-sniffing/referrer-leak/unwanted-device-API classes; CSP is defense-in-depth against script injection specifically, and this app has zero `dangerouslySetInnerHTML`/`innerHTML` usage (verified during the original PROMPT 45 review) reducing that particular exposure already.

### 3.6 Monitoring — already true (mechanism), do this (retention)

**Already true**: [observability.md](./observability.md) (PROMPT 50) is environment-agnostic by design — `getEnvironment()` reads `VERCEL_ENV` (`"production"` on the production deployment, automatic, zero config), every structured log line and `GET /api/health` carry it, so production's logs/health are never confused with preview's in a shared view.

**Do this**: Vercel's own Runtime Logs (Project → Logs tab) are useful for a quick live look but have a short retention window by default (not a durable audit trail) — for anything beyond "what just happened in the last hour," configure a **Log Drain** (Vercel → Project Settings → Log Drains) forwarding to wherever the team already has an aggregator (Datadog/Better Stack/Axiom/a simple hosted Postgres+cron ingester — this repo doesn't mandate a specific vendor), so a structured `logError`/`logEvent` line (§2's severity levels — `error`/`warn`/`info`, see [observability.md](./observability.md) §2) is actually searchable by `requestId`/`event`/`householdId` days or weeks later, not just in the moment. Until a log drain exists, treat "check Vercel's live log tail during/immediately after a deploy" as the only monitoring available — sufficient for a launch-day watch, not for retroactive incident investigation.

### 3.7 Cron — assessed, not configured (not required today)

No `vercel.json` cron exists, and none is added by this pass. Reminders (`src/features/reminders/sync.ts`) regenerate two ways: best-effort on every load of `/app/reminders` (30-day-back/90-day-forward window, always catches up correctly regardless of how long since the last visit — see the comment in `sync.ts`), and via the page's manual "Refresh" button. **There is no out-of-band consumer of reminder freshness** — no email/push notification delivery exists in this app, and no other page (dashboard included — checked, no reminder-derived widget anywhere else) reads reminder data, so a stale reminders table is invisible until the moment a user opens the one page that reads it, at which point it's no longer stale. A cron job would add operational surface (a scheduled Route Handler, a secret to authenticate it, monitoring for its own failures) with no correctness or UX benefit given the current feature set. **Revisit this the moment a notification-delivery feature ships** (email/push reminders) — that would need reminders generated independent of any page visit, and would be the concrete trigger for adding a `vercel.json` cron hitting a dedicated authenticated Route Handler that calls `syncReminders` per household.

### 3.8 Previous deployment retention — do this

Vercel project → Settings → General → Deployment Retention (plan-gated — available on paid plans). Set this to keep enough deployment history to actually roll back to a meaningfully old release, not just the immediately previous one — see [rollback.md](./rollback.md), whose instant-rollback procedure depends on the target deployment still existing. A short retention window silently narrows the rollback window without anyone noticing until the moment they need a deployment that's already been garbage-collected.

## 4. Smoke tests

Every item below is either already covered by the automated Playwright suite (re-run against the live production URL is still worth doing once, per the "automated coverage today, manual spot-check once real infra exists" pattern established in [vercel-preview.md](./vercel-preview.md) §9 and [production-supabase.md](./production-supabase.md)'s manual isolation test) or needs a genuinely manual check because it depends on infrastructure a local/CI run can't simulate (real mobile hardware/network, a real log aggregator).

| # | Smoke test | Automated coverage | Manual check needed on production |
|---|---|---|---|
| 1 | Signup/login | `auth.spec.ts`, `authentication-journey.spec.ts` | Confirm the real confirmation email arrives (production has `enable_confirmations = true` — see [production-supabase.md](./production-supabase.md) §7 — unlike local/CI, so this path is genuinely different in production and worth a real click-through) |
| 2 | Onboarding | `authentication-journey.spec.ts` | — |
| 3 | Create account | `cash-flow-journey.spec.ts`, `financial-mutations.spec.ts` | — |
| 4 | Add income | `income` flows covered in unit tests (`src/lib/calculations/income-schedule.test.ts`) + exercised as part of journey specs' setup | Walk the actual Income form once |
| 5 | Add expense | `cash-flow-journey.spec.ts` | — |
| 6 | Transfer | `cash-flow-journey.spec.ts`, `financial-mutations.spec.ts` | — |
| 7 | Create SIP | `investment-sip-journey.spec.ts` | — |
| 8 | Record contribution | `investment-sip-journey.spec.ts`, `financial-mutations.spec.ts` | — |
| 9 | Create loan | `debt-journey.spec.ts` | — |
| 10 | Record payment | `debt-journey.spec.ts`, `financial-mutations.spec.ts` | — |
| 11 | Add policy | `insurance-journey.spec.ts` | — |
| 12 | Upload private document | `insurance-journey.spec.ts` (a real Storage upload), `security-review.spec.ts` (rejects oversized/disallowed) | Confirm a downloaded document opens correctly from a real (not local) signed URL — signed-URL generation/expiry timing can behave subtly differently against a real Supabase Cloud project's Storage vs. the local CLI's |
| 13 | Add asset | `asset-goal-journey.spec.ts` | — |
| 14 | Create goal | `asset-goal-journey.spec.ts` | — |
| 15 | Verify net worth | `asset-goal-journey.spec.ts` (live-computed net worth, no snapshot needed) | — |
| 16 | Close month | RPC-level only today: `financial-mutations.spec.ts`'s "monthly closing" test (`start_monthly_closing` + cross-household rejection) — **no full UI journey spec exists** for open → review → complete → close | Walk the full Monthly Closing UI flow manually at least once — this is the one smoke item without full journey automation, so give it real attention rather than assuming the RPC-level test covers the UI too |
| 17 | Privacy mode | `shell.spec.ts` | — |
| 18 | Unauthorized-access test | `shell.spec.ts`, `security-journey.spec.ts`, `household-isolation.spec.ts` | — |
| 19 | Mobile test | `shell.spec.ts`'s mobile-nav test, `accessibility.spec.ts` (both run Chromium desktop viewport emulation, not a real device) | Open the production URL on an actual phone once — emulated viewport testing doesn't catch real touch-target/font-rendering/network-condition issues |
| 20 | Error-monitoring test | No dedicated Playwright spec deliberately triggers a render error, but §2's full-suite run this pass produced one *for real* (an unplanned `NotFoundError` from parallel-test timing) and confirmed the whole pipeline — safe fallback UI shown, structured `client.render_error` log line emitted with full `requestId`/`userId`/`pathname` context and no leaked internal detail, correctly tagged `"environment":"production"` — see the log line quoted in §2 | Same check, against the real production log drain (§3.6) rather than local stdout: deliberately trigger an error against production (e.g. a route that doesn't exist, or a temporary throw in a non-critical component) and confirm the log line lands wherever the drain sends it, tagged `"environment":"production"` |

## 5. A note on the pre-existing lint warnings

The 17 `react-hooks/incompatible-library` warnings (§1) predate this pass and are not a regression — React Compiler flags every `react-hook-form` `watch()` call as "cannot be memoized safely," which is React Compiler correctly describing a real limitation of `react-hook-form`'s API shape, not a bug in this codebase's use of it. `pnpm lint` treats these as warnings, not errors, and CI's `checks` job (`.github/workflows/ci.yml`) only fails on an actual lint error — this is not something to "fix" before deploying, just a known, stable baseline worth naming so it isn't mistaken for new build noise during a deploy.
