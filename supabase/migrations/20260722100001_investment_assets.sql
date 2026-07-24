-- investment_assets: PROMPT 16 — the second of the "important distinction"
-- concepts: the specific security/instrument itself (e.g. "Reliance
-- Industries Ltd", "HDFC Balanced Advantage Fund - Direct Growth",
-- "Bitcoin", "Sovereign Gold Bond 2028"), separate from any platform
-- account it happens to be held through (investment_accounts) and from
-- the position that links the two (investment_holdings, next migration).
--
-- Household-scoped, not a shared/global security master: this app has no
-- external market-data integration (see docs/product-scope.md §4, "no
-- brokerage/bank API aggregation in v1") and no cross-household data may
-- be shared (see docs/security-model.md §3), so each household maintains
-- its own catalog entries even for an identically-named instrument another
-- household also holds.

create table public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  asset_class text not null check (
    asset_class in (
      'mutual_fund', 'stock', 'etf', 'bond', 'fixed_deposit', 'recurring_deposit',
      'gold', 'digital_gold', 'ppf', 'epf', 'nps', 'crypto', 'staking',
      'private_business', 'private_lending', 'real_estate', 'other'
    )
  ),
  -- Ticker / ISIN / scheme code / crypto symbol / folio-scheme identifier —
  -- free text, never parsed or used to look anything up externally.
  symbol_or_identifier text,
  -- The currency this asset is denominated and valued in — independent of
  -- any investment_accounts.currency_code it's held through (see that
  -- table's comment). All of this asset's investment_transactions and
  -- investment_valuation_snapshots must use this same currency (enforced
  -- by trigger on those tables via the holding that links to this asset).
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.investment_assets is
  'A specific security/instrument a household tracks (e.g. a stock, a mutual fund scheme, a crypto asset, a PPF account''s underlying scheme) — household-scoped, not a shared security master (no external market-data integration in v1). See PROMPT 16, docs/financial-domain-model.md §4.';
comment on column public.investment_assets.asset_class is
  'One of the 17 asset classes PROMPT 16 specifies; ''real_estate'' covers "real estate investment" specifically (not the household''s primary residence — see the planned Assets module for that).';

create index investment_assets_household_id_idx on public.investment_assets (household_id);
create index investment_assets_asset_class_idx on public.investment_assets (household_id, asset_class);

create trigger set_updated_at
  before update on public.investment_assets
  for each row
  execute function public.set_updated_at();

-- No cross-table references beyond household_id, so no household-
-- consistency trigger is needed (unlike investment_accounts/_holdings).

alter table public.investment_assets enable row level security;

create policy "members can view their household's investment assets" on public.investment_assets
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add investment assets" on public.investment_assets
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update investment assets" on public.investment_assets
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete investment assets" on public.investment_assets
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.investment_assets to authenticated, service_role;
