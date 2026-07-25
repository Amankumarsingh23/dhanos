# DhanOS — CI/CD and Release Workflow

Status: **CI implemented** (PROMPT 51 — `.github/workflows/ci.yml`); **Vercel preview codebase-ready but not yet connected** (PROMPT 52 — see [vercel-preview.md](./vercel-preview.md)); **production deploy not yet configured** — no Vercel project exists yet (see [implementation-status.md](./implementation-status.md) §1, "Deployment | Not configured"). This document is both a description of what runs today and the target end-to-end release process — each section says which it is.

## 1. Pipeline overview

```
feature branch → PR opened → CI (GitHub Actions) → Vercel preview deploy → manual acceptance → merge to main → production deploy
```

Every step before "merge to main" happens against a **branch**, never against `main` directly — see §2. Nothing in this pipeline ever touches a production credential or production data before the final "production deploy" step — see §7.

## 2. Branch workflow — implemented (repo convention, not machine-enforced yet)

- `main` is the trunk; it's what production deploys from once Vercel is connected (§6).
- All work happens on a short-lived branch off `main` — `feature/<short-description>`, `fix/<short-description>`, or a PROMPT-numbered name (matching this repo's existing convention of one branch/PR per numbered prompt) are all fine; there's no enforced naming scheme.
- Rebase or merge `main` into your branch before opening a PR if `main` has moved — CI runs against your branch's own tip, not a synthetic merge commit, so an out-of-date branch can pass CI and still conflict on merge.
- Branch protection on `main` (requiring the CI status checks below before merge, disallowing force-push) is a GitHub repository setting, not something this codebase can configure — see §8 for what to turn on once the repo has a GitHub remote with admin access set up for it.

## 3. Pull Request — implemented (workflow trigger), branch protection not yet enabled

Opening a PR against `main` (or pushing a new commit to one) triggers the CI workflow (§4) automatically via the `pull_request` event in `.github/workflows/ci.yml`. Once a Vercel project is connected (§6), the same PR also gets an automatic preview deployment comment from Vercel's own GitHub integration — no extra workflow step needed for that, it's Vercel's native GitHub App behavior.

## 4. CI — implemented (`.github/workflows/ci.yml`)

Two jobs, `checks` then `integration` (the latter only runs if the former passes — no point booting Docker/Supabase if the basics are already broken):

### 4.1 `checks` — install, type check, lint, unit tests, production build

Runs on every PR and every push to `main`. No Docker, no Supabase, no real environment values:

1. **Install** — `pnpm install --frozen-lockfile`. Fails outright if `pnpm-lock.yaml` is missing or doesn't match `package.json` — the lockfile-drift check comes for free from this flag, not a separate step.
2. **Cache** — `actions/setup-node`'s built-in `cache: pnpm` (keyed on `pnpm-lock.yaml`) for the pnpm store, plus a separate `actions/cache` step for `.next/cache` (keyed on the lockfile + a hash of `src/**`) so an unchanged dependency tree and unchanged source don't pay for a cold Next.js build cache.
3. **Type check** — `pnpm typecheck` (`tsc --noEmit`).
4. **Lint** — `pnpm lint` (ESLint flat config — see `eslint.config.mjs`).
5. **Unit tests** — Vitest, run with both the default and a JUnit reporter (`--outputFile.junit=./test-results/unit-results.xml`); the JUnit file is uploaded as a **failure artifact** (`unit-test-results`, 14-day retention) so a failure's exact assertion output is downloadable from the run, not just visible in scrollback.
6. **Production build** — `pnpm build`. Uses fixed placeholder values for `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_APP_URL`/`SUPABASE_SERVICE_ROLE_KEY` (see the job's `env:` block) — the app's own env validation (`src/lib/env/client.ts`/`server.ts`) only checks *shape* (a valid URL, a non-empty string), never reachability, and the build never actually queries Supabase (confirmed: `pnpm build` succeeds with no Supabase instance running at all). These placeholders are not secrets and are committed in plain text in the workflow file — see §7.

### 4.2 `integration` — migration validation, generated-type consistency, Playwright

Runs only after `checks` passes. This is "Playwright in a separate safe job": isolated from the fast-feedback job, and "safe" in the sense that matters for CI hardening — `permissions: contents: read` (same as `checks`), triggered by the plain `pull_request` event rather than `pull_request_target` (a fork PR's run gets a read-only token and **no** repository secrets — see §7), and every credential it uses is generated fresh for that run alone.

1. **Install** — same frozen-lockfile install as `checks` (jobs don't share a filesystem, so this repeats).
2. **Start local Supabase** — `pnpm db:start` (`supabase start`). `ubuntu-latest` ships Docker preinstalled; no service-container config needed, the Supabase CLI manages its own containers.
3. **Migration validation** — `pnpm db:reset` (`supabase db reset`): drops and recreates the database, applies every file in `supabase/migrations/` in filename order, then runs `supabase/seed.sql`. A migration that doesn't apply cleanly from scratch fails this step directly — this is the same command [local-supabase.md](./local-supabase.md) already tells a developer to run "before considering a migration change done," now enforced in CI too.
4. **Generated-type consistency check** — `pnpm db:types` regenerates `src/types/database.ts` from the schema §4.2.3 just proved applies cleanly, then `git diff --exit-code -- src/types/database.ts`. A migration that changed the schema without a regenerated, committed `database.ts` fails here with an explicit message telling the author to run `pnpm db:types` — this is the exact bug class [testing.md](./testing.md) §3 already calls out ("a stale `src/types/database.ts` after a migration").
5. **Write test-only `.env.local`** — reads `supabase status -o json` (the CLI's own status output for the instance just started in step 2) and maps it to the app's expected variable names, byte-for-byte the same mapping [local-supabase.md](./local-supabase.md) tells a developer to do by hand. See §7 for why this is never a secret.
6. **Playwright** — `pnpm test:e2e`. Playwright's own `webServer` config (`playwright.config.ts`) runs `pnpm build && pnpm start` against the `.env.local` from step 5 and waits for it before testing; `reuseExistingServer: !process.env.CI` means CI always does a fresh build+start (GitHub Actions sets `CI=true` automatically). Covers both real browser journeys (`*-journey.spec.ts`) and the REST-only specs that exercise Row Level Security directly with real access tokens (`household-isolation.spec.ts`, `security-review.spec.ts`, `financial-mutations.spec.ts` — see [testing.md](./testing.md) §2 for why these count as integration tests despite never calling a `page.*` method).
7. **Failure artifacts** — on failure, `playwright-report/` and `test-results/` (HTML report, screenshots, and traces — `trace: "retain-on-failure"` in `playwright.config.ts`) are uploaded as the `playwright-report` artifact (14-day retention). Inspect a trace locally after downloading with `pnpm exec playwright show-trace <path>/trace.zip`.
8. **Stop local Supabase** — `pnpm db:stop`, `if: always()` (cleanup even after a failure). Not strictly required on an ephemeral runner, but keeps the job's own lifecycle explicit and matches local-dev hygiene.

### 4.3 Reproducing CI locally

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # ≈ checks job (pnpm verify also runs format:check)
pnpm db:start && pnpm db:reset && pnpm db:types && git diff --exit-code -- src/types/database.ts && pnpm test:e2e   # ≈ integration job
```

## 5. Caching and speed

- **pnpm store** — `actions/setup-node`'s `cache: pnpm`, keyed on `pnpm-lock.yaml`.
- **Next.js build cache** — `.next/cache`, keyed on the lockfile + a hash of `src/**`, with a lockfile-only restore-key fallback so a source change still gets a warm (if partially stale) cache rather than a fully cold one.
- **Playwright browsers** — `~/.cache/ms-playwright`, keyed on `pnpm-lock.yaml` (a `@playwright/test` version bump changes the lockfile hash and correctly busts the cache). OS-level dependencies (`--with-deps`) are still installed on every run regardless of cache hit — `apt` package installation isn't cached, but is fast.
- Both CI jobs use `concurrency: cancel-in-progress` per branch/ref — pushing a new commit to an open PR cancels that PR's in-flight run rather than letting two runs race.

## 6. Vercel preview — codebase ready (PROMPT 52), external accounts not yet connected

The application code, auth-callback handling, Storage privacy, and preview-vs-production monitoring are all already preview-ready — verified with no further code change needed. What's missing is purely the external Vercel project + dedicated staging Supabase project, which only someone with account access can create. **See [vercel-preview.md](./vercel-preview.md) for the complete, step-by-step runbook** — Git repository import, Vercel project settings, preview environment variables, the non-production Supabase project (and pushing migrations to it), the exact Supabase Auth redirect-URL wildcard needed for Vercel's two preview URL forms, why "canonical preview URL handling" is already solved in code (`src/lib/auth/request-origin.ts`), private Storage, and preview monitoring (`getEnvironment()` already prefers `VERCEL_ENV`) — plus a table mapping every PROMPT 52 "Verify" item to the existing Playwright spec that already covers it in CI.

Once connected, Vercel's GitHub integration deploys a Preview automatically for every PR/branch push, independent of the GitHub Actions workflow in §4 — the two run in parallel, not one triggering the other. A PR shows both: GitHub Actions' own check runs (`checks`, `integration`) and Vercel's preview-deployment check/comment.

## 7. Secrets and credentials policy — implemented (CI), planned (Vercel/production)

- **`.github/workflows/ci.yml` uses zero `secrets.*` references today.** The `checks` job's env values are fixed, non-functional placeholders (they satisfy the app's env-shape validation only — see §4.1). The `integration` job's values are generated fresh per run by the local Supabase CLI (`supabase status`) and discarded with the runner; they're the same well-known, published local-dev defaults [local-supabase.md](./local-supabase.md) already documents as safe for a gitignored `.env.local` and never a real environment.
- **No production credential is ever available to CI.** There is currently no GitHub Actions secret configured for this repository at all. If a future test genuinely needs a real test-only credential (e.g. a sandboxed third-party API key), add it as a repository or environment-scoped secret named with a `TEST_`/`SANDBOX_` prefix, scoped to a dedicated GitHub Environment (with required reviewers if it should not run on every fork PR) — never reuse a production secret's name or value, and never widen the `integration` job's `permissions:` block beyond `contents: read` to accommodate it without a specific reason.
- **The `pull_request` trigger (not `pull_request_target`) is deliberate**: a fork's PR run gets a read-only `GITHUB_TOKEN` and no access to any repository secret under this event — this matters more once a real `TEST_*` secret is eventually added than it does today (when none exist).
- **Production credentials** (a real `SUPABASE_SERVICE_ROLE_KEY`, a linked Supabase project's access token) live only in Vercel's project environment settings and in Supabase's own project dashboard — never in this repository, never in a GitHub Actions secret used by the `pull_request`-triggered workflow above. See [security-model.md](./security-model.md) §4.

## 8. Branch protection — planned (GitHub repository setting)

Not yet enabled (requires repo admin access from the GitHub UI, not something committable). Once the CI workflow has run at least once so its job names are selectable, turn on for `main`: require the `checks` and `integration` status checks to pass before merging, require the branch to be up to date before merging, and disallow force-push/direct pushes to `main`.

## 9. Manual acceptance — planned (process, not tooling)

After CI is green and a Vercel Preview exists (§6): the PR author (or a reviewer) exercises the actual feature in the Preview deployment's browser — the golden path plus the edge cases called out in the PR description — the same "test the feature in a browser before reporting complete" standard this project already holds itself to for UI changes. A code review (logic, security implications per [security-model.md](./security-model.md) §6, adherence to [data-access-patterns.md](./data-access-patterns.md)) happens alongside, not instead of, this manual check — CI proves the code doesn't crash and isn't a regression against existing behavior; it doesn't prove the feature is *right*.

**See [production-acceptance-report.md](./production-acceptance-report.md) (PROMPT 55)** for a full worked example of exactly this kind of review, conducted against a real production build — found and fixed a real bug (a filter checkbox that looked unresponsive under real network latency, across 5 manager components) that no amount of code review alone would have caught, only actually clicking through the app under simulated real-world conditions did.

## 10. Merge — planned (process)

Squash or merge (either is fine; this repo has no stated preference) once: CI is green, the Preview has been manually accepted (§9), and any review feedback is resolved. Merging to `main` is what triggers a production deploy (§11) once Vercel is connected — treat a merge to `main` with the same weight as a production release, not as "just landing a PR."

## 11. Production — planned, not yet configured

**See [production-supabase.md](./production-supabase.md) (PROMPT 53) for the full production-Supabase readiness runbook** — region choice, applying migrations safely (`db push`, never `db reset`), generated-type parity verification against the live schema, RLS/Storage/grant verification (with the exact SQL used), auth settings and rate limits that must differ from local dev, the security/performance-advisor-equivalent audit already run locally (one real finding fixed — excess `anon`/`authenticated` grants, `supabase/migrations/20260731100000_revoke_unused_anon_authenticated_privileges.sql`), backups/PITR, the migration forward-fix policy, and the manual two-user production isolation test procedure.

**See [deployment.md](./deployment.md) (PROMPT 54) for the full production deployment runbook** — the pre-deploy checklist (actually run against this codebase: clean install, typecheck, lint, 808/808 unit tests, build, all 31 migrations, and the full 191-test Playwright suite, all green), production Vercel/domain/Supabase-redirect configuration, security headers, monitoring, the cron decision (not needed today — reminders have no out-of-band consumer, see deployment.md §3.7), deployment retention, and the 20-item smoke-test checklist mapped to automated coverage. **See [production-runbook.md](./production-runbook.md)** for day-to-day operation once live (where to look, rotating a credential, responding to elevated errors, periodic maintenance) and **[rollback.md](./rollback.md)** for the specific rollback decision tree and procedure (app-only vs. schema-aware vs. last-resort PITR).

Once Vercel is connected (§6) with a Production environment pointed at a real Supabase Cloud project:

- Every merge to `main` deploys to production automatically (Vercel's default GitHub integration behavior) — there is no separate manual "deploy" step or button by default. If a manual gate before production is wanted (e.g. for a specific high-risk change), that's a Vercel project setting (deployment protection / manual promotion), not something this repository's code controls.
- **Database migrations are never applied ad hoc against production.** A migration that's part of a merged PR must be pushed via `pnpm db:push` against the linked production Supabase project as a deliberate, reviewed step — ideally before or as part of the same release the code merge ships in, so the app version and schema version never drift apart. See [local-supabase.md](./local-supabase.md) "Production migration rules" for the immutability/ordering rules this already follows for staging; the same rules apply to production, just with higher stakes.
- Roll back a bad production deploy per [rollback.md](./rollback.md).
