# DhanOS — Manual Test Checklist

Status: **forward-looking** for every module except §1's first two items and §11 — see [implementation-status.md](./implementation-status.md). This checklist is written now so each module is tested against these criteria as it ships, rather than inventing test criteria after the fact.

Check items off per module as that module is implemented and manually verified, in addition to (not instead of) automated tests.

## 1. Auth & tenancy

- [x] Sign up, sign in, sign out, password reset all work end to end. Verified manually (browser) and via `tests/e2e/auth.spec.ts` against the real local Supabase stack, including a real emailed password-reset round trip through local Mailpit.
- [x] A second test household's data is never visible to the first household's user, via API/network inspection. Verified with two independent users' real access tokens in `tests/e2e/household-isolation.spec.ts` (households, memberships, a net-worth-snapshot write, a household-settings update, and self-adding to the other's membership list all correctly rejected). Not yet re-verified via UI navigation/direct URL manipulation — there's no cross-household UI surface to click through yet (no accounts/transactions modules exist).
- [ ] Viewer-role member cannot write (create/edit/delete) any financial record, only read. RLS policies exist for this (see [database-plan.md](./database-plan.md) §2) but there's no financial data or second-member UI yet to exercise it against.
- [ ] Removing a household member revokes their access immediately (no stale session access). No membership-management flow exists yet (see PROMPT 4's "do not implement invitations yet").

## 2. Accounts & transactions

- [ ] Creating an account requires a currency; balance starts derived from transactions, not manually settable.
- [ ] An expense transaction reduces available balance and appears in expense totals; a transfer between two owned accounts does **not** appear in expense or income totals.
- [ ] An investment contribution does not appear in the expense total for the period.
- [ ] A refund is entered linked to its original expense and the category's net spend reflects the reversal correctly.
- [ ] Entering a fractional currency amount (e.g. ₹100.25) round-trips exactly through storage and display with no floating-point drift (verify against several values known to be float-unsafe, e.g. 0.1 + 0.2 equivalents).
- [ ] Attempting to submit a zero-amount transaction is rejected.

## 3. Loans & lending

- [ ] Recording a loan payment requires both a principal and interest component that sum to the payment total; submitting a mismatched split is rejected.
- [ ] Outstanding principal shown to the user matches manual recomputation from the full payment history.
- [ ] Total interest paid to date is independently viewable from total principal paid.
- [ ] Editing a past loan payment is not possible through the UI; correcting a mis-entered payment produces a new adjustment record, and both the original and the adjustment remain visible in history.

## 4. Investments, SIPs, staking, valuations

- [ ] Adding a new valuation for a holding creates a new snapshot; the previous valuation remains queryable/visible in history, not overwritten.
- [ ] A SIP contribution is categorized as an investment contribution, not an expense, in cash-flow views.
- [ ] Cost basis (sum of contributions) and current value (latest valuation) are shown as distinct figures, never merged into one number.

## 5. Net worth & monthly closing

- [ ] Net-worth trend chart reflects historical snapshots, not a recomputation that changes past points when new data is added today.
- [ ] Closing a month locks that month's report; attempting to edit a closed month's figures directly is not possible through the UI.
- [ ] Correcting a closed month produces a new, clearly linked closing record; the original closed report is still viewable unchanged.

## 6. Reports & projections

- [ ] Every generated report visibly shows its data cutoff date, separate from the date it was generated/viewed.
- [ ] Every projection/calculator screen displays the assumed rate(s) (return, inflation) next to the projected figure, not hidden in settings.
- [ ] Any daily-compounding projection (e.g. high-volatility asset calculators) shows prominent risk language at the point of display, not only in a linked terms page.
- [ ] Actual historical performance and projected future performance are visually distinguishable on any chart that shows both (e.g. solid vs. dashed lines, distinct labeling).

## 7. Documents & reminders

- [ ] A document uploaded under one household cannot be fetched via a guessed/adjacent URL by a user in a different household.
- [ ] Document download uses a short-lived signed URL, not a permanently public link.
- [ ] Reminders generated from recurring commitments, loan due dates, and insurance renewals fire/display at the correct date.

## 8. Data export

- [ ] Export contains only the requesting user's own household data.
- [ ] Export action itself requires authentication and is not exposed as an unauthenticated endpoint.

## 9. Accessibility (per shipped screen)

- [ ] All interactive elements reachable and operable via keyboard alone.
- [ ] Form errors (especially money/date validation) are announced to assistive tech, not conveyed by color alone.
- [ ] Color is not the sole means of distinguishing income vs. expense vs. transfer, actual vs. projected — pair with icon/label/pattern.
- [ ] Sufficient contrast for all text against the theme background, in both light and dark mode if both are supported.

## 10. Cross-cutting

- [ ] Every money amount displayed anywhere is formatted through the shared presentation utility, never an ad hoc `/100` in a component.
- [ ] No `console.log`/debug output of financial data left in shipped code.
- [ ] No secrets present in client-side bundle (spot check via browser devtools network/source inspection) beyond the intentionally public Supabase URL/anon key.

## 11. App shell & privacy mode

- [x] Unauthorized (signed-out) visitors cannot see the shell — every nested `/app/*` route redirects to `/login` before rendering anything, verified for four different sections in `tests/e2e/shell.spec.ts`.
- [x] Direct-loading and refreshing a nested route both work (no client-only routing state required to render correctly) — verified in `tests/e2e/shell.spec.ts`.
- [x] Privacy mode conceals amounts across every dashboard card at once and survives a full page refresh with no flash of revealed amounts — verified in `tests/e2e/shell.spec.ts`. Not yet re-verified against real ledger data (accounts/transactions cards don't exist yet) — re-check as each module's cards ship.
- [x] Mobile navigation opens, lists every section, navigates, and closes itself — verified in `tests/e2e/shell.spec.ts` at a 390×844 viewport.
- [x] No console errors/warnings (including hydration mismatches) across a dashboard load, a nested-route load, and a refresh — verified in `tests/e2e/shell.spec.ts`.
- [x] No amount (concealed or revealed) ever appears in the document title — verified in `tests/e2e/shell.spec.ts`.
- [ ] Full keyboard-only walkthrough of the sidebar, mobile nav, command search, and user menu (tab order, focus trapping in the mobile sheet/dialogs, Escape to close) — the primitives (Radix Dialog/DropdownMenu) provide this by construction, but hasn't been manually walked end to end.
- [ ] Visual/contrast pass once real design tokens arrive (see [architecture.md](./architecture.md) §4) — today's shell uses the placeholder shadcn/ui theme.
