# DhanOS — Rollback Procedure

Status: **procedure ready; never yet exercised against a real production deployment** (none exists yet). Companion to [deployment.md](./deployment.md) (deploying) and [production-runbook.md](./production-runbook.md) (day-to-day operation, including how an incident is first detected) — this document is specifically what to do once a rollback is the decided response, not how to decide something's wrong in the first place.

## 1. Decide which kind of rollback this is, first

Not every bad deployment needs the same fix, and picking the wrong one can make things worse:

```
Did the last deployment include a migration (a new file under supabase/migrations/)?
│
├─ No → §2 (app-only rollback: Vercel instant rollback, nothing else)
│
└─ Yes → Is the previous app version still compatible with the NEW (already-migrated) schema?
         │
         ├─ Yes (the migration was purely additive — a new column with a default,
         │       a new table nothing existing depends on) → §2 is still enough;
         │       leave the schema as-is, just roll the app back
         │
         └─ No (the previous app version expects a column/shape the migration
                 removed or changed incompatibly) → §3 (schema-aware rollback:
                 a forward-fix migration, or in the worst case PITR — §4)
```

**This is why [local-supabase.md](./local-supabase.md)'s and [production-supabase.md](./production-supabase.md) §12's migration conventions matter operationally, not just stylistically**: a migration that's purely additive (new nullable column, new table, new function) keeps the "no" branch above available — the app can always be rolled back independent of the schema. A migration that changes/removes something the current app depends on collapses that option; the only way back is forward (§3) or a full restore (§4). Prefer additive migrations specifically to keep §2 available as an option for as long as possible.

## 2. App-only rollback (Vercel instant rollback)

The fast path, and the right choice whenever §1 says it's available:

1. Vercel → Project → Deployments.
2. Find the last known-good production deployment (its commit SHA — cross-reference against the log drain's `release` field from [production-runbook.md](./production-runbook.md) §1 if it's not obvious which one was actually healthy).
3. Click "..." → "Promote to Production" (Vercel's terminology may read slightly differently depending on plan/UI version — the action is: make this previous deployment the one production traffic routes to, without a new build). This takes effect in seconds, no rebuild.
4. **This only works if the target deployment still exists** — see [deployment.md](./deployment.md) §3.8's Deployment Retention setting. If it's been garbage-collected, the fallback is: `git revert` (or check out) the last-known-good commit and push it as a new PR/deploy through the normal pipeline — slower (a full CI run + build), but always available since the code itself lives in git regardless of Vercel's own retention window.
5. Verify per §5 below.

No environment variable or Supabase change is needed for this path — the app code changes, the database doesn't.

## 3. Schema-aware rollback (a migration is implicated)

**Never** attempt to "undo" an already-pushed migration by editing or deleting the migration file, and never hand-edit the production schema to match what the old app expects — both violate the immutable-migration rule ([local-supabase.md](./local-supabase.md) "Production migration rules", [production-supabase.md](./production-supabase.md) §12) and make the schema history lie about what was actually applied when, which is exactly the kind of state that makes a *second* incident harder to diagnose.

1. **Write a forward-fix migration** that restores compatibility — re-adds a removed column (even if unused going forward, just to restore the shape the rolled-back app expects), reverses a constraint change, or whatever specifically closes the gap §1 identified. This is the same "forward-fix" approach [production-supabase.md](./production-supabase.md) §12 documents for a bad migration in general, applied here under rollback pressure specifically.
2. **Test it locally first, even under pressure**: `pnpm db:reset` with the fix migration included must still apply cleanly from scratch. Skipping this step to move faster is how a rollback becomes a second incident.
3. Push the fix migration the normal way (`production-supabase.md` §2: link, `db push` — never `db reset` against production).
4. Now perform §2 (app rollback) — the schema is compatible again, so the standard instant-rollback path applies.
5. Verify per §5 below.

If a forward-fix genuinely isn't possible in the time available (the original migration destroyed data with no way to reconstruct it, or the blast radius is severe enough that reasoning through a fix under incident pressure is itself risky) — escalate to §4.

## 4. Last resort: Point-in-Time Recovery (PITR)

Only when §3 isn't safely possible. PITR ([production-supabase.md](./production-supabase.md) §11) restores the **entire production database** to a specific timestamp before the incident — every legitimate write after that point is lost, not just the bad migration's effects. This is why it's positioned last in both this document and `production-supabase.md` §12, not a routine tool.

1. Confirm PITR is actually enabled and note the retention window (Supabase dashboard → the production project → Database → Backups) *before* deciding this is the path — don't discover it isn't available mid-incident.
2. Identify the exact restore timestamp: as close as possible to right before the bad migration/deploy, balancing "far enough back to be clean" against "as little legitimate data loss as possible." Cross-reference the log drain (`release`/deployment timestamps — [production-runbook.md](./production-runbook.md) §1) to pin this precisely rather than guessing.
3. Initiate the restore from the Supabase dashboard (this is an irreversible, Supabase-support-involved operation on most plans — follow their specific current flow, which this document can't fully substitute for since it changes with their platform).
4. Once the database is restored, the app deployment must match: roll the Vercel deployment (§2) back to whatever commit was actually live at the restore timestamp, not just "the previous one" — a mismatch here reintroduces exactly the incompatibility problem §1 exists to avoid, just in the opposite direction.
5. Communicate the data-loss window explicitly and honestly to anyone whose writes fell inside it — see [production-runbook.md](./production-runbook.md) §4. This is real financial data; silently losing a household's transaction from the restore window without telling them is not acceptable.
6. Verify per §5 below, plus a specific check that no household's data looks partially-reverted in a way that would confuse them (e.g. a transaction they remember entering is gone, but a category they created around the same time still exists) — flag this proactively rather than waiting for a support report.

## 5. Verify after any rollback

Regardless of which path above was used:

1. `/api/health` returns `"status":"ok"` — see [observability.md](./observability.md) §6.
2. `release` in `/api/health`'s response and in new log lines matches the commit that's now actually live — confirms the rollback took effect, not just that *a* deployment is serving traffic.
3. Re-run [production-supabase.md](./production-supabase.md) §3's generated-type parity check and §4's four RLS queries — a rollback (especially §3/§4's schema-touching paths) is exactly the kind of event that could silently reintroduce drift between the committed `src/types/database.ts`/RLS assumptions and the actual live schema.
4. Run the critical smoke-test subset from [deployment.md](./deployment.md) §4 — at minimum items 1 (signup/login), 3 (create account), 18 (unauthorized-access test) — against the now-restored production URL.
5. Update whatever incident record [production-runbook.md](./production-runbook.md) §4 started, noting the rollback path taken and the verification results above.
