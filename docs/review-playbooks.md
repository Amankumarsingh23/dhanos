# DhanOS — Review Playbooks

Status: **reference material for future development sessions**, not a record of what's been done. These are the four reusable review prompts to run at specific points in future work on this repository — after a phase, when a feature misbehaves, before applying a migration, and when a calculation needs independent verification. Saved here (rather than only in chat history) so any future session — this one or a fresh one — can be pointed at "run the phase-review playbook" and know exactly what that means, versioned alongside the code it reviews.

## 1. Phase review — run after every numbered development prompt

Review the current phase as a senior engineer responsible for a production financial application. Compare the implementation with the exact phase prompt and acceptance criteria.

Inspect:
1. Functional correctness
2. Financial correctness
3. Money-unit handling
4. Transaction classification
5. Database integrity
6. Household authorization
7. Supabase RLS
8. Private Storage
9. Input validation
10. Error handling
11. Loading and empty states
12. Accessibility
13. Responsive behavior
14. Query efficiency
15. Test quality
16. Documentation
17. Unexpected changes outside scope

Identify: blockers; high-severity issues; medium issues; low issues; accepted limitations.

Fix all blockers and high-severity issues within this phase. Run the relevant verification suite.

Return:
- Implementation summary
- Financial rules implemented
- Files changed
- Migrations created
- RLS policies added
- Tests added
- Commands run
- Manual testing steps
- Known limitations
- Whether the phase is ready to commit

Do not begin the next phase.

## 2. Bug investigation — run when a feature is not behaving correctly

Do not immediately rewrite it. First:
1. Reproduce the issue
2. Inspect UI and server errors
3. Inspect related transactions
4. Inspect database constraints
5. Inspect RLS
6. Inspect Storage policies where relevant
7. Inspect money-unit conversion
8. Inspect timezone and date handling
9. Inspect calculation logic
10. Determine the root cause

Write a regression test where practical. Apply the smallest complete root-cause fix.

Run: type check; lint; relevant unit tests; relevant integration tests; production build.

Report:
- Root cause
- Affected financial records
- Whether historical data requires correction
- Files changed
- Migration required
- Tests added
- Manual verification steps

Do not weaken authorization or suppress errors merely to make the screen appear successful.

## 3. Migration review — run before a new Supabase migration is applied

Verify: migration ordering; table and column names; data types; money fields; currency fields; nullability; check constraints; foreign keys; deletion behavior; indexes; RLS enabled; select policy; insert policy; update policy; delete policy; Storage implications; backward compatibility; generated-type impact; clean-reset compatibility.

Check that no broad authenticated-user policy permits cross-household access.

Fix confirmed problems and run a clean local reset (`pnpm db:reset`). Do not edit previously deployed migrations — create a corrective migration when necessary (see [local-supabase.md](./local-supabase.md) "Production migration rules").

## 4. Financial-calculation review — run to independently verify a calculation

Audit the current calculation independently.

Identify: inputs; units; sign conventions; included record types; excluded record types; formula; rounding rules; missing-data behavior; timezone behavior; historical-data behavior; projection assumptions.

Test: zero; minimum currency unit; large number; negative adjustment; missing input; duplicate transaction; reversed transaction; multiple currencies; partial period; month-end boundary.

Ensure the UI explains whether the result is: actual; estimated; projected; incomplete; stale.

Do not approve the calculation until the formula and tests agree.

## Where these apply against the current codebase

- §1's dimensions map directly onto the standards this codebase already holds itself to — see [security-model.md](./security-model.md) (§6–7), [data-access-patterns.md](./data-access-patterns.md) (the 8-step mutation process), [money-calculation-rules.md](./money-calculation-rules.md), and [testing.md](./testing.md).
- §2 mirrors the debugging discipline already visible in this repo's own commit/finding history — e.g. the pagination and filter-checkbox bugs recorded in [version-one-release-notes.md](./version-one-release-notes.md) were both found by reproducing first, tracing to a shared root cause, and fixing every affected instance rather than patching the first symptom.
- §3 is the concrete version of what [local-supabase.md](./local-supabase.md) "Create a migration" and "Production migration rules" already require.
- §4 is the same rigor [financial-correctness-review.md](./financial-correctness-review.md) was built with, and the standard [money-calculation-rules.md](./money-calculation-rules.md) already sets — this playbook is how to re-run that rigor on a *new* calculation, not a description of one already done.
