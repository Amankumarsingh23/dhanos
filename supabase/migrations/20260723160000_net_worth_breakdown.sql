-- PROMPT 32 — Net-worth engine. Grows the `net_worth_snapshots` table
-- (created in the tenancy-era migration `20260721021746_net_worth_snapshots.sql`
-- with only `total_assets_minor_units`/`total_liabilities_minor_units` — no
-- feature ever wrote to it) with the full component breakdown PROMPT 32
-- asks for: "do not store only the final total."
--
-- **Formula** — every component is computed by reusing each domain's own
-- already-correct logic, never re-derived:
--   - cash_and_accounts_minor_units — eligible financial_accounts balances
--     (excludes account_type in ('loan','credit'), same convention as the
--     emergency fund planner's isAccountTypeEligible, PROMPT 31).
--   - investments_minor_units — investment_holdings' latest valuations
--     (src/features/investments/queries.ts's getPortfolioHoldings).
--   - movable_assets_minor_units / property_minor_units — assets'
--     ownership-adjusted net worth contribution
--     (src/lib/calculations/assets.ts's computeNetWorthContributionMinorUnits,
--     already handles ownership_percentage and disputed/expected zeroing —
--     PROMPT 27/32's "ownership percentage is applied correctly"), split by
--     asset_group: immovable -> property, movable + business -> movable
--     assets.
--   - receivables_minor_units — lendings' currently-owed outstanding
--     (src/lib/calculations/lending-metrics.ts's computeLendingTotals).
--   - loans_minor_units — active loans' outstanding
--     (src/features/loans/queries.ts's getDebtSummary) — institutional debt.
--   - other_liabilities_minor_units — informal borrowing (any certainty)
--     plus general obligations with certainty = 'confirmed' only
--     (src/lib/calculations/net-worth.ts's computeOtherLiabilitiesBreakdown)
--     — an *estimated* general obligation is deliberately excluded from
--     this figure, never silently folded in (PROMPT 32: "minus other
--     confirmed liabilities").
--
-- total_assets_minor_units, total_liabilities_minor_units, and the new
-- net_worth_minor_units are all `generated always as ... stored` columns —
-- they can never drift from their components, the same "derived value
-- guaranteed correct by construction" idiom as
-- account_balance_snapshots.difference_minor_units.
--
-- **"Missing valuations lower completeness rather than becoming zero
-- silently"**: completeness_percentage/valuation_dependent_item_count/
-- missing_valuation_count are stored alongside every snapshot — a missing
-- investment/asset valuation still contributes 0 to the total (there's no
-- better number to use), but completeness_percentage always visibly
-- reports what fraction of valuation-dependent items actually had a real
-- valuation at snapshot time, so the total is never presented as more
-- reliable than it actually is.
--
-- **"Snapshot values are reproducible"**: every snapshot is computed "as
-- of now" only (no backdated recomputation) — see
-- src/features/net-worth/queries.ts — so recomputing from the same
-- underlying data always yields the same breakdown.
--
-- **"Historical snapshots are not rewritten automatically"**: already true
-- structurally (append-only — no update grant existed before this
-- migration and none is added now); `unique (household_id, as_of_date)`
-- means a second snapshot for a date already recorded fails outright
-- rather than silently overwriting it.

-- (The original migration's 'member'-role typo on the insert policy was
-- already fixed in 20260721051051_household_memberships.sql, which
-- dropped and recreated it as "owners, admins, and editors can record a
-- net worth snapshot" — nothing further needed here.)

-- The two original columns become generated (derived, never independently
-- settable) — safe because the table has no rows and no feature has ever
-- written to it yet.
alter table public.net_worth_snapshots
  drop column total_assets_minor_units,
  drop column total_liabilities_minor_units;

alter table public.net_worth_snapshots
  add column cash_and_accounts_minor_units bigint not null default 0 check (cash_and_accounts_minor_units >= 0),
  add column investments_minor_units bigint not null default 0 check (investments_minor_units >= 0),
  add column movable_assets_minor_units bigint not null default 0 check (movable_assets_minor_units >= 0),
  add column property_minor_units bigint not null default 0 check (property_minor_units >= 0),
  add column receivables_minor_units bigint not null default 0 check (receivables_minor_units >= 0),
  add column loans_minor_units bigint not null default 0 check (loans_minor_units >= 0),
  add column other_liabilities_minor_units bigint not null default 0 check (other_liabilities_minor_units >= 0),
  add column total_assets_minor_units bigint generated always as (
    cash_and_accounts_minor_units + investments_minor_units + movable_assets_minor_units + property_minor_units + receivables_minor_units
  ) stored not null,
  add column total_liabilities_minor_units bigint generated always as (
    loans_minor_units + other_liabilities_minor_units
  ) stored not null,
  add column net_worth_minor_units bigint generated always as (
    (cash_and_accounts_minor_units + investments_minor_units + movable_assets_minor_units + property_minor_units + receivables_minor_units)
    - (loans_minor_units + other_liabilities_minor_units)
  ) stored not null,
  -- The timestamp through which underlying data was actually considered —
  -- distinct from created_at (when the row was written), same
  -- data-cutoff-vs-generated-at convention already established for the
  -- planned Reports entity (see docs/money-calculation-rules.md §3).
  add column source_cutoff_at timestamptz not null default now(),
  add column completeness_percentage numeric not null default 100 check (completeness_percentage >= 0 and completeness_percentage <= 100),
  add column valuation_dependent_item_count integer not null default 0 check (valuation_dependent_item_count >= 0),
  add column missing_valuation_count integer not null default 0 check (missing_valuation_count >= 0 and missing_valuation_count <= valuation_dependent_item_count);

comment on table public.net_worth_snapshots is
  'Append-only, dated rollup of net worth (PROMPT 32) — every component (cash/accounts, investments, movable assets, property, receivables, loans, other liabilities) is stored, never just the final total. total_assets/total_liabilities/net_worth are generated columns, always consistent with their components by construction. Never updated in place — see docs/money-calculation-rules.md §3.';
comment on column public.net_worth_snapshots.other_liabilities_minor_units is
  'Informal borrowing (any certainty) plus general-obligation liabilities with certainty = confirmed only — an estimated general obligation is excluded here, never silently folded in. See src/lib/calculations/net-worth.ts''s computeOtherLiabilitiesBreakdown.';
comment on column public.net_worth_snapshots.completeness_percentage is
  'Share of valuation-dependent items (investment holdings + assets) that had a real, non-null valuation at snapshot time — a missing valuation still contributes 0 to the total, but always visibly lowers this figure rather than making the total look more reliable than it is. 100 when there are no valuation-dependent items at all.';
comment on column public.net_worth_snapshots.source_cutoff_at is
  'The timestamp through which underlying data was actually considered, distinct from created_at (when this row was written) — see docs/money-calculation-rules.md §3''s data-cutoff-vs-generated-at convention.';
