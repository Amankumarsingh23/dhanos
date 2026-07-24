-- investment_holdings: PROMPT 16 — the third "important distinction"
-- concept: the position that links one investment_account to one
-- investment_asset. This is where "multiple holdings can exist on one
-- platform" (a PROMPT 16 acceptance criterion) is structurally true: an
-- investment_accounts row has many investment_holdings, one per distinct
-- asset held through it.
--
-- Deliberately carries no quantity/current-value column — "do not model
-- all investments as a single mutable value" (PROMPT 16). A holding's
-- quantity and cost basis are derived by summing its
-- investment_transactions (contribution/purchase/sale/dividend/interest/
-- fee/withdrawal), the same "balance is derived from the ledger, never a
-- mutable field" pattern financial_accounts uses (see
-- src/lib/calculations/account-balance.ts and
-- docs/money-calculation-rules.md §2); its current value is read from the
-- latest investment_valuation_snapshots row, never stored here either.

create table public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- RESTRICT: an account with holdings can't be silently emptied by
  -- deleting the account — same reasoning as transactions.account_id
  -- (docs/database-plan.md §1 "Soft delete").
  investment_account_id uuid not null references public.investment_accounts (id) on delete restrict,
  investment_asset_id uuid not null references public.investment_assets (id) on delete restrict,
  opened_date date,
  closed_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_holdings_closed_requires_inactive
    check (closed_date is null or is_active = false),
  constraint investment_holdings_closed_after_opened
    check (opened_date is null or closed_date is null or closed_date >= opened_date),
  -- One holding row per (account, asset) pair for its whole lifecycle —
  -- fully exiting a position and later re-entering it is represented by
  -- new investment_transactions against the same row (quantity derived
  -- from the ledger can naturally go to zero and back up), never a second
  -- holding row for the same pair.
  unique (investment_account_id, investment_asset_id)
);

comment on table public.investment_holdings is
  'The position linking one investment_accounts row to one investment_assets row. Quantity and value are always derived (from investment_transactions and investment_valuation_snapshots respectively), never stored as a mutable column here. See PROMPT 16.';

create index investment_holdings_household_id_idx on public.investment_holdings (household_id);
create index investment_holdings_investment_account_id_idx on public.investment_holdings (investment_account_id);
create index investment_holdings_investment_asset_id_idx on public.investment_holdings (investment_asset_id);

create trigger set_updated_at
  before update on public.investment_holdings
  for each row
  execute function public.set_updated_at();

create function public.check_investment_holding_household_consistency()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.investment_accounts
    where id = new.investment_account_id and household_id = new.household_id
  ) then
    raise exception 'investment_holdings.investment_account_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.investment_assets
    where id = new.investment_asset_id and household_id = new.household_id
  ) then
    raise exception 'investment_holdings.investment_asset_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_investment_holding_household_consistency() is
  'Trigger: rejects an investment_holdings row whose investment_account_id or investment_asset_id belongs to a different household.';

create trigger check_investment_holding_household_consistency
  before insert or update on public.investment_holdings
  for each row
  execute function public.check_investment_holding_household_consistency();

alter table public.investment_holdings enable row level security;

create policy "members can view their household's investment holdings" on public.investment_holdings
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add investment holdings" on public.investment_holdings
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update investment holdings" on public.investment_holdings
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete investment holdings" on public.investment_holdings
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.investment_holdings to authenticated, service_role;
