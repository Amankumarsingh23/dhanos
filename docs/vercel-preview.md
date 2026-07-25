# DhanOS — Vercel Preview Environment

Status: **codebase is preview-ready; the external accounts/dashboard steps are not yet done** (PROMPT 52). Everything in this document that's marked **"already true"** is verified against the current code — no further code change needed. Everything marked **"do this"** is a dashboard/account action outside this repository that only someone with Vercel and Supabase account access can perform; this document is the exact runbook for that person to follow. See [ci-cd.md](./ci-cd.md) §6 for how this fits into the overall PR → preview → merge → production pipeline.

## Why this is mostly a dashboard task, not a code task

A Vercel *project* and a Supabase Cloud *project* are both external accounts this codebase can't create or configure itself — there is no Vercel/Supabase credential available to run those steps from here. What this codebase **can** do — and already does — is make sure nothing in the app assumes a fixed hostname, a fixed environment, or production credentials, so that once those two external things exist and are pointed at each other correctly, preview "just works" with zero further code change. The sections below go through every item in the PROMPT 52 "Configure" list, each stating what's already handled in code and exactly what to do outside it.

## 1. Git repository — do this

Import `git@github.com:RookBattery/vyapar_os-.git` into Vercel ("Add New… → Project → Import Git Repository"). Vercel auto-detects Next.js (App Router) from `package.json`/`next.config.ts` — no framework preset or build-command override needed. Grant Vercel's GitHub App access to this repository (not your whole account) when prompted.

## 2. Vercel project — do this

Project name: `dhanos` (matches `package.json`'s `name` and `supabase/config.toml`'s `project_id`, for consistency — not a functional requirement). Root directory: repository root (this is a single-package repo, no monorepo path to configure). Node.js version: Vercel reads this from the project settings or `package.json`; set it to **24.x** to match what CI (`.github/workflows/ci.yml`) and local development already use — see [ci-cd.md](./ci-cd.md) §4.1. Build command / output: leave at Vercel's Next.js defaults (`pnpm build`, `.next`) — `package.json`'s `packageManager` field (`pnpm@11.15.1`) lets Vercel auto-select the right pnpm version the same way `pnpm/action-setup` does in CI.

## 3. Non-production Supabase project — do this

**Already true**: nothing in this codebase hardcodes a Supabase project reference — `src/lib/supabase/{client,server,middleware}.ts` all read `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at runtime, never a baked-in project ref. Pointing Preview at a different Supabase project than Production is purely an env-var difference (§4), not a code branch.

**Do this**, once, before the first real preview:

1. Create a new Supabase Cloud project dedicated to previews/staging — never reuse the eventual production project. This is the same "preview environment must point at a non-production Supabase project" rule already stated in [ci-cd.md](./ci-cd.md) §6, now made concrete.
2. `pnpm db:link` from this repo, targeting that new project (prompts for the project ref and a personal access token — see [local-supabase.md](./local-supabase.md) "Link a remote project"; never put the access token in `.env.local` or any tracked file).
3. `pnpm db:push` — applies every migration in `supabase/migrations/` in order, including the ones that create the private Storage buckets and their RLS policies (`supabase/migrations/20260721120000_expense_management.sql`, `20260727100000_settings_preferences.sql`, `20260729100000_storage_bucket_limits.sql` — see §7). Review the SQL before pushing, same as any other shared-environment deploy — see [local-supabase.md](./local-supabase.md) "Production migration rules," which applies identically to a staging project.
4. From that project's dashboard (Project Settings → API), copy its `URL` and `publishable`/`anon` key, and (Project Settings → API → service_role) its service-role key — these feed §4.
5. Optionally load `supabase/seed.sql`'s fixture data (or your own) into this staging project via the SQL editor or `psql` — useful for a reviewer to have a pre-populated demo household to look at on every preview without re-onboarding, but not required; every journey test signs up its own fresh user regardless (see [testing.md](./testing.md) §2).
6. Re-run `pnpm db:push` after every future migration, before or alongside merging the PR that adds it — a preview whose schema is behind `main`'s migrations will fail in confusing ways that have nothing to do with the PR being reviewed.

## 4. Preview variables — do this

In the Vercel project's Settings → Environment Variables, add all four app variables **scoped to the Preview environment only** (not Production — see [security-model.md](./security-model.md) §4, "scoped per environment, rotated if ever suspected exposed"):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The staging project's URL from §3.4 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The staging project's publishable/anon key from §3.4 |
| `NEXT_PUBLIC_APP_URL` | See §6 — a fixed fallback value is fine; it's not the mechanism that makes callback URLs work |
| `SUPABASE_SERVICE_ROLE_KEY` | The staging project's service-role key from §3.4 |

**Already true**: `src/lib/env/client.ts`/`server.ts` validate these are present and well-formed at build time and throw a clear error naming the missing/malformed variable if not — a misconfigured Preview environment fails the build loudly rather than deploying a broken app silently. These are the exact same four variables `.env.example`/[local-supabase.md](./local-supabase.md) document for local dev — same names, staging project's values instead of the local CLI's.

## 5. Authentication callback URLs — do this

This is the single step most likely to be gotten wrong, because Vercel gives every preview deployment **two different URLs** and Supabase's redirect-URL allowlist needs to accept both:

- A unique URL per deployment/commit: `https://dhanos-<hash>-<team>.vercel.app`
- A stable URL per branch, i.e. per open PR (updates in place with each new push): `https://dhanos-git-<branch>-<team>.vercel.app`

In the staging Supabase project's dashboard (Authentication → URL Configuration → Redirect URLs), add a **wildcard** entry covering both forms — Supabase Auth's redirect-URL matching supports a `*` wildcard segment specifically for this case:

```
https://dhanos-*-<team>.vercel.app/**
```

(replace `<team>` with your actual Vercel team/username slug — visible in any of that project's deployment URLs once §1–2 are done). This single pattern matches both the per-deployment and per-branch URL forms, since both share the `dhanos-...-<team>.vercel.app` shape. Do **not** add a bare `*.vercel.app` wildcard — that would accept a redirect to a preview deployment of an unrelated project under the same Vercel team, which is broader than intended.

**Already true**: the actual redirect URL sent to Supabase on every auth email (`emailRedirectTo`/`redirectTo`) is computed per-request from the incoming `Host` header (`src/lib/auth/request-origin.ts`'s `getRequestOrigin()`), never from a fixed configured value — so it automatically matches whichever of the two preview URLs the user is actually using, with no further code change once the wildcard above is registered. See §6 for why this same mechanism is also what makes "canonical preview URL handling" a non-issue.

## 6. Canonical preview URL handling — already true

Two things make this a non-issue rather than something to build:

- **The app never assumes a fixed canonical origin.** `originFromHeaderGetter`/`getRequestOrigin` (`src/lib/auth/request-origin.ts`) build every redirect/callback URL from the request's own `Host`/`X-Forwarded-Host` and `X-Forwarded-Proto` headers — deliberately, per that file's own comment, because `request.nextUrl.origin`/`request.url` were found to reflect the server's own bound hostname rather than what the client actually requested. On Vercel, this means a user on the per-deployment URL gets redirects back to that same per-deployment URL, and a user on the per-branch URL gets redirects back to that URL — whichever one they're actually looking at, correctly, automatically. `NEXT_PUBLIC_APP_URL` (§4) is only the fallback for the (essentially unreachable in an HTTP request) case where no `Host` header is present at all.
- **For a human, "canonical" means which link to actually click and share.** Use the **per-branch URL** (`dhanos-git-<branch>-<team>.vercel.app`) as the one to treat as "this PR's preview" in review discussions — it's stable across every push to the branch, unlike the per-deployment URL which changes on every commit. This is also the URL Vercel's own GitHub PR comment/check surfaces as the primary link, so no extra tooling is needed to make it "the" canonical one; it already is.

## 7. Private Storage — already true (once §3.3 is done)

**Already true**: every Storage bucket in this schema (`documents`, `avatars`, plus asset/insurance/expense attachment buckets) is `private`, created with household/user-scoped RLS on `storage.objects` in the same migration that creates it — never a public bucket, never a bare public URL. Every download goes through a short-lived signed URL generated server-side (`createSignedDownloadUrl`, e.g. `documents.get_download_url`/`assets.get_document_url`/`insurance.get_claim_document_url` — see [observability.md](./observability.md) §9 for the matching "never log the signed URL itself" rule, and [security-model.md](./security-model.md) §5). None of this is environment-specific code — it's schema + RLS, so it's already fully in place on the staging project the moment `pnpm db:push` (§3.3) has run, with no further app-code change.

**Do this**: nothing beyond §3.3 — just don't skip that step, since a Preview pointed at a staging project with the migrations *not* pushed would have no buckets at all (upload actions would fail, loudly, not silently expose anything).

## 8. Preview monitoring — already true

**Already true**, from PROMPT 50's observability work ([observability.md](./observability.md)):

- `getEnvironment()` (`src/lib/observability/environment.ts`) reads Vercel's own `VERCEL_ENV` system variable first — `"preview"` on every preview deployment, `"production"` on the production deployment — automatically, with no configuration. Every structured log line (`logError`/`logEvent`) and `GET /api/health`'s response body both carry this, so a preview's logs/health checks are never mistaken for production's in a shared log viewer.
- `getRelease()` reads `VERCEL_GIT_COMMIT_SHA`, also automatic — every log line and `/api/health` response is traceable to the exact commit that preview deployment built from.
- `GET /api/health` (§ "safe health route" in [observability.md](./observability.md) §6) is unauthenticated and safe to hit on a preview URL directly to confirm the preview's Supabase connectivity without opening the app — e.g. `curl https://dhanos-git-<branch>-<team>.vercel.app/api/health` should return `{"status":"ok","environment":"preview",...}` once §3–4 are done.

**Do this**: nothing — this was built environment-agnostic from the start specifically so it would need zero preview-specific configuration.

## 9. Verify — automated coverage today, manual spot-check once a live preview exists

Every item in PROMPT 52's "Verify" list already has automated Playwright coverage, run on every PR by `.github/workflows/ci.yml`'s `integration` job (see [ci-cd.md](./ci-cd.md) §4.2) against a real production build and a real (local, freshly-migrated) Supabase instance — not a stand-in or a mock:

| Verify item | Covered by |
|---|---|
| Sign in | `tests/e2e/auth.spec.ts`, `tests/e2e/authentication-journey.spec.ts` |
| Onboarding | `tests/e2e/authentication-journey.spec.ts` |
| Account creation | `tests/e2e/cash-flow-journey.spec.ts`, `tests/e2e/financial-mutations.spec.ts` |
| Transaction | `tests/e2e/cash-flow-journey.spec.ts` |
| SIP | `tests/e2e/investment-sip-journey.spec.ts` |
| Loan | `tests/e2e/debt-journey.spec.ts` |
| Policy upload | `tests/e2e/insurance-journey.spec.ts` (a real file upload against Storage, per §7) |
| Charts | Rendered and asserted as part of the dashboard/report views each journey above visits |
| Privacy mode | `tests/e2e/shell.spec.ts` |
| Unauthorized access | `tests/e2e/shell.spec.ts`, `tests/e2e/security-journey.spec.ts`, `tests/e2e/household-isolation.spec.ts` |
| Refresh nested routes | `tests/e2e/shell.spec.ts` ("direct-loading and refreshing a nested route both work") |

This CI coverage is real evidence the *code* works — it is **not** a substitute for the acceptance criteria below, which are specifically about the *actual Vercel+Supabase-Cloud infrastructure* working, something a local Playwright run can't prove. Once §1–8 are done and a real PR has a live preview URL, manually re-walk this same table once against that URL before treating PROMPT 52 as accepted — a 10–15 minute pass, not a full re-test, since the automated suite already did the hard work of proving the app logic itself is correct.

## 10. Acceptance criteria — how each is satisfied

- **"Pull request produces working preview"** — automatic once §1–2 are done (Vercel's GitHub integration deploys every PR without further configuration); confirm by opening any PR after setup and checking Vercel's own status check/comment goes green.
- **"Preview does not use production financial data"** — satisfied by §3 (a dedicated staging Supabase project, never the production one) + §4 (Preview-scoped env vars pointing only at it). There is no code path by which a Preview deployment could reach the production Supabase project — it only ever knows the URL/keys it was built with.
- **"Auth callback returns to preview"** — satisfied by §5 (wildcard redirect URL registered) + §6 (Host-header-derived callback origin, already in code) together; neither alone is sufficient — the wildcard without the dynamic-origin code would need a manual URL per deployment, and the dynamic-origin code without the wildcard would have every auth email rejected by Supabase as an unlisted redirect target.
- **"Preview secrets are isolated"** — satisfied by §4 (Preview-scoped Vercel env vars, distinct project from Production) + §3 (a wholly separate Supabase project, with its own service-role key that has no access to production data by construction, not just by policy).
