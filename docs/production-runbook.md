# DhanOS — Production Runbook

Status: **runbook ready; no production system exists yet to operate.** This is the "day 2" companion to [deployment.md](./deployment.md) (which covers the *act* of deploying) — where to look when something's wrong, the recurring maintenance tasks a production financial app needs, and how to make routine changes (a new migration, a rotated credential) safely once the system is live. See [rollback.md](./rollback.md) for the specific procedure when a deployment or migration needs to be undone rather than just investigated.

## 1. Where to look

| Question | Where |
|---|---|
| Is the app up at all? | `curl https://<production-domain>/api/health` — unauthenticated, returns `{"status":"ok"/"degraded","environment":"production","release":"<commit-sha>",...}` in under a second if healthy (see [observability.md](./observability.md) §6) |
| What's happening right now? | Vercel → Project → Logs (live tail, short retention — good for "what just happened," not history) |
| What happened an hour/day/week ago? | The log drain configured in [deployment.md](./deployment.md) §3.6 — search by `requestId` (correlates one user's request across every log line it produced), `event` (e.g. `documents.upload`, `imports.commit_batch`, `client.render_error` — see [observability.md](./observability.md) §8 for the full list of named events), or `householdId` |
| Is a specific request/error correlated across logs? | The `x-request-id` response header on any request, or the reference code shown in the client error boundary's fallback UI (`error.digest` or a generated ID — see `src/app/error.tsx`) — either one is the exact `requestId` to search the log drain for |
| Is the database healthy / what's its current load? | Supabase dashboard → the production project → Database → the built-in usage/performance graphs |
| Are there known security/performance issues right now? | Supabase dashboard → the production project → Advisors (Security Advisor, Performance Advisor) — see §4 |
| Did a deployment just ship, and what's in it? | Vercel → Project → Deployments — each one shows its commit SHA, which matches `release` in every log line and `/api/health` response from that point on |

## 2. Common operational tasks

### 2.1 Applying a new migration to production

Every migration ships through the normal PR flow (CI validates it applies cleanly from scratch — see [ci-cd.md](./ci-cd.md) §4.2), then reaches production via the exact procedure in [production-supabase.md](./production-supabase.md) §2/§12: `pnpm db:reset` locally first to confirm the full history (including the new migration) still applies cleanly, then `pnpm exec supabase link --project-ref <production-ref>` (if not already linked in whatever environment is doing the push) and `pnpm db:push` — **never `db reset`** against a linked production project (see the warning at the top of `production-supabase.md`). Re-verify per `production-supabase.md` §3 (generated-type parity) and §4 (RLS) afterward, using the same SQL queries documented there.

### 2.2 Rotating a credential

If `SUPABASE_SERVICE_ROLE_KEY` (or the publishable key, lower stakes but still worth doing promptly) is ever suspected exposed (committed by accident, leaked in a log, shared insecurely):

1. Generate a new key from the Supabase dashboard (Project Settings → API) — Supabase supports rotating the service-role key without downtime (the old key keeps working until explicitly revoked, giving a window to update the new value everywhere before cutting over).
2. Update the value in Vercel's Production environment variables ([deployment.md](./deployment.md) §3.1).
3. Redeploy (a new deployment is required to pick up the changed env var — Vercel doesn't hot-reload environment variables into an already-running deployment).
4. Revoke the old key in the Supabase dashboard once the new deployment is confirmed healthy (`/api/health` returning `"ok"`).
5. If the exposure happened via a committed file or public log, treat it as a real incident regardless of how quickly it's rotated — check the log drain for any request pattern suggesting the key was actually used by someone else in the exposure window (the service-role key bypasses RLS entirely, so its misuse wouldn't show up as a rejected/403 request the way a stolen user session would — it would show up as unexpected direct-Postgres-shaped activity, which this app's own server code never generates on its own, since [security-model.md](./security-model.md) §3 already restricts the service-role key to "narrowly-scoped, audited server contexts" and it currently has zero call sites at all — see [security-review.md](./security-review.md) Finding #9).

### 2.3 Responding to elevated error rates

1. Check `/api/health` first — distinguishes "the whole app/database is down" from "a specific feature is erroring."
2. Search the log drain for `"level":"error"` in the affected time window, grouped by `event` — [observability.md](./observability.md) §2's severity table means every `error`-level line is something unexpected, never a routine user-facing rejection (those log at `info`), so this is already a pre-filtered, real-problem list, not noise.
3. A spike in `"errorCode":"permission_denied"` at `"level":"warn"` specifically (not `error`) is [observability.md](./observability.md) §7's authorization-failure-monitoring signal — worth checking separately, since it indicates either an attempted-attack pattern or (more commonly) a real UX bug where a role check is stricter than the UI it's backing.
4. If the errors correlate with a recent deployment, see [rollback.md](./rollback.md).
5. If the errors correlate with a Supabase-side issue (connection errors, timeouts) rather than an app bug, check Supabase's own status page and the project's Database usage graphs (§1) before assuming it's this codebase's fault.

### 2.4 Handling a suspected abuse/rate-limit report

The app-layer export rate limit (`checkExportRateLimit`, [security-model.md](./security-model.md) §5/§6) and Supabase's own auth rate limits ([production-supabase.md](./production-supabase.md) §8) are the two defenses already in place. If either is actually being hit by a real abuse pattern (not a false positive from a legitimate power user), that's a signal to *lower* the relevant `[auth.rate_limit]` value in the production project's dashboard (never edit `supabase/config.toml` and `config push` it — see `production-supabase.md` §7/§9's warning about why local/CI values and production values must stay independently managed) — do this directly in the dashboard, then confirm via the log drain that the offending pattern actually stops.

### 2.5 Adding/removing team access

Vercel and Supabase both manage their own project-level team membership independently (Vercel → Project → Settings → Members; Supabase → Project → Settings → Team) — there's no single place to manage both. When someone leaves the team, remove them from both, and rotate the service-role key (§2.2) if they had access to it (any project member with sufficient Supabase role does, by design of that platform).

## 3. Periodic maintenance

Not one-time launch tasks — recurring, on a cadence:

| Task | Cadence | Why |
|---|---|---|
| Review Supabase Security Advisor + Performance Advisor | Monthly, or after any schema change | New advisor checks get added by Supabase over time, and traffic patterns that didn't exist at launch (see [production-supabase.md](./production-supabase.md) §10's deferred FK-index findings) may surface a real Performance Advisor hit once there's actual production query volume to analyze |
| `pnpm audit` / `pnpm outdated` | Monthly | [security-model.md](./security-model.md) §6 already calls out "keep an explicit habit of dependency auditing... not just at project start" — a financial app's dependency tree is a real attack surface |
| Confirm the log drain is still receiving events | Monthly | A silently-broken log drain (an expired token, a changed endpoint) means §2.3's entire "search the logs" workflow silently stops working — worth a periodic `curl /api/health`-triggered check or a deliberate test error, confirmed to arrive |
| Review Vercel's Deployment Retention setting against actual rollback needs | Quarterly, or after any incident that needed a rollback | See [deployment.md](./deployment.md) §3.8 / [rollback.md](./rollback.md) — confirm the retention window still covers "how far back would we realistically need to roll back" |
| Confirm PITR is still enabled and note the current retention window | Quarterly | [production-supabase.md](./production-supabase.md) §11 — a lapsed subscription/plan downgrade could silently disable this without an obvious symptom until the moment it's needed |

## 4. Incident response — lightweight, for a small team

No formal on-call rotation or paging system exists for this project today, and this runbook doesn't invent one — the process below is deliberately sized for whoever is actually operating this:

1. **Confirm it's real** — `/api/health`, then the log drain, before assuming a report is accurate (§1).
2. **Triage severity**: is real financial data at risk of cross-tenant exposure (drop everything, this is the scenario [security-model.md](./security-model.md)'s entire threat model exists to prevent) versus a degraded-but-safe experience (a feature erroring but no data exposure) versus cosmetic.
3. **Mitigate first, root-cause after**, for anything above cosmetic: [rollback.md](./rollback.md) if a recent deploy/migration is implicated, §2.2 if a credential is implicated, tightening a rate limit (§2.4) if it's an abuse pattern.
4. **Write down what happened** once resolved — even a few sentences in this repo's own history (a follow-up PR's description, or appended to this file if it reveals a process gap) beats losing the lesson. This repo already has a pattern for this: [security-review.md](./security-review.md)'s findings table and [testing.md](./testing.md) §4's "how this was actually verified" — real incidents deserve the same honest, specific record-keeping.
