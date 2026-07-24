-- investment_valuation_snapshots: PROMPT 16 — append-only, dated valuation
-- record per holding. The concrete enforcement of "historical valuations
-- remain available" and "do not model all investments as a single mutable
-- value": a holding's current value is always read as its latest
-- snapshot, never a mutable column on investment_holdings itself — same
-- pattern as account_balance_snapshots for financial_accounts (see
-- docs/money-calculation-rules.md §3).
--
-- Resolves docs/database-plan.md §6 open question 2 for this table: a
-- plain FK to investment_holdings is used instead of a polymorphic
-- valuable_type/valuable_id pair, since in v1 a valuation only ever values
-- a holding (unlike attachments, which spans two unrelated entity types).
-- Revisit only if a second valuable entity type is introduced later.

create table public.investment_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- CASCADE: append-only history that's meaningless without its parent
  -- holding — same convention as account_balance_snapshots.account_id.
  investment_holding_id uuid not null references public.investment_holdings (id) on delete cascade,
  as_of_date date not null,
  -- The holding's total value as of as_of_date — not a per-unit price
  -- (see price_per_unit below for that, when relevant).
  value_minor_units bigint not null check (value_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Optional per-unit price (NAV/market price) that produced value_minor_units,
  -- for holdings where that's meaningful (stock/MF/ETF/crypto) — null for a
  -- lump-sum asset (FD/PPF/EPF/NPS) with no per-unit concept. numeric, not
  -- minor units — same precision reasoning as investment_transactions.price_per_unit.
  price_per_unit numeric check (price_per_unit is null or price_per_unit >= 0),
  -- Exactly what PROMPT 16 asks the dashboard to support recording:
  -- manually entered, imported, institution statement, or calculated
  -- (e.g. rolled up from quantity * a separately-entered price).
  source text not null check (
    source in ('manual', 'imported', 'institution_statement', 'calculated')
  ),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (investment_holding_id, as_of_date, source)
);

comment on table public.investment_valuation_snapshots is
  'Append-only, dated value per investment_holdings row. Never updated in place — a correction is a new snapshot for a later as_of_date. See PROMPT 16, docs/money-calculation-rules.md §3.';
comment on column public.investment_valuation_snapshots.source is
  'How this figure was produced: manual (user-entered), imported (from a file/import flow), institution_statement (transcribed from a broker/registrar statement — see investment_documents), or calculated (derived, e.g. quantity times a separately-entered price).';

create index investment_valuation_snapshots_household_id_idx on public.investment_valuation_snapshots (household_id);
create index investment_valuation_snapshots_investment_holding_id_idx on public.investment_valuation_snapshots (investment_holding_id);

-- investment_holding_id must belong to the same household as the
-- snapshot row, and currency_code must match the holding's asset
-- currency — same shape as check_account_balance_snapshot_household, plus
-- the currency half check_investment_transaction_consistency also does.
create function public.check_investment_valuation_snapshot_consistency()
returns trigger
language plpgsql
as $$
declare
  v_holding_household uuid;
  v_asset_currency text;
begin
  select ih.household_id, ia.currency_code
    into v_holding_household, v_asset_currency
  from public.investment_holdings ih
  join public.investment_assets ia on ia.id = ih.investment_asset_id
  where ih.id = new.investment_holding_id;

  if v_holding_household is null or v_holding_household <> new.household_id then
    raise exception 'investment_valuation_snapshots.investment_holding_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'investment_valuation_snapshots.currency_code must match the holding''s asset currency';
  end if;

  return new;
end;
$$;

comment on function public.check_investment_valuation_snapshot_consistency() is
  'Trigger: rejects an investment_valuation_snapshots row whose investment_holding_id belongs to a different household, or whose currency_code does not match the holding''s asset currency.';

create trigger check_investment_valuation_snapshot_consistency
  before insert on public.investment_valuation_snapshots
  for each row
  execute function public.check_investment_valuation_snapshot_consistency();

alter table public.investment_valuation_snapshots enable row level security;

create policy "members can view their household's investment valuations" on public.investment_valuation_snapshots
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all — a correction
-- is a new snapshot for a later as_of_date (docs/money-calculation-rules.md §3).
create policy "owners, admins, and editors can record an investment valuation" on public.investment_valuation_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- No update/delete grant either — see docs/database-plan.md §4.
grant select, insert on public.investment_valuation_snapshots to authenticated, service_role;
