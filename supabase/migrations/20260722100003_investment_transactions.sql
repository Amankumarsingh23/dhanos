-- investment_transactions: PROMPT 16 — every event that changes a
-- holding's quantity or records cash flow against it, discriminated by
-- transaction_type so "contribution; purchase; sale; dividend/interest;
-- fee" (the prompt's "important distinction" list) are never conflated
-- into one mutable figure — the same kind-discriminated-single-table
-- pattern the core ledger's transactions table already uses.
--
-- This table is deliberately separate from the core public.transactions
-- ledger (investment activity needs quantity/price-per-unit, which plain
-- cash-flow transactions don't) but optionally bridges back to it via
-- linked_transaction_id, so a contribution/sale/dividend/fee that actually
-- moved cash through a financial_accounts-based bank account can still
-- surface in cash-flow reporting (public.cash_flow_transactions,
-- transactions.kind = 'investment_contribution'/'investment_withdrawal',
-- and the PROMPT 15 dashboard) without this table becoming a second,
-- disconnected source of truth for that cash movement.
--
-- Editable + soft-cancelable (status), not append-only: this is a data-
-- entry record like the core transactions table (correctable via update,
-- audited via activity_events at the application layer), not an immutable
-- historical fact like investment_valuation_snapshots below.

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- RESTRICT: mirrors transactions.account_id — a holding with recorded
  -- activity can't be silently emptied by deleting the holding.
  investment_holding_id uuid not null references public.investment_holdings (id) on delete restrict,
  transaction_type text not null check (
    transaction_type in ('contribution', 'purchase', 'sale', 'dividend', 'interest', 'fee', 'withdrawal')
  ),
  transaction_date date not null,
  -- The total cash amount of this event, in currency_code. Unlike
  -- transactions.amount_minor_units (check <> 0), zero is allowed here: a
  -- bonus-share issue or a reinvested-at-zero-cost event is a legitimate
  -- quantity-only, cash-free occurrence.
  amount_minor_units bigint not null check (amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Quantity/price apply to unit-based assets (stock/MF/ETF/gold/crypto/
  -- bond); both null for a lump-sum asset with no "units" (an FD deposit,
  -- a PPF/EPF/NPS contribution, a private lending advance). Always both
  -- present or both absent — see investment_transactions_quantity_price_pair.
  -- numeric (exact decimal, not float — see docs/money-calculation-rules.md
  -- §1), not minor units: a mutual fund NAV commonly needs more precision
  -- than a currency's own minor-unit exponent (e.g. 4 decimal places on an
  -- INR NAV, which paise alone can't represent) — same reasoning as
  -- transactions.exchange_rate already being a plain numeric, not an
  -- integer minor-unit column.
  quantity numeric check (quantity is null or quantity >= 0),
  price_per_unit numeric check (price_per_unit is null or price_per_unit >= 0),
  -- A fee specific to this event (e.g. brokerage on a purchase/sale),
  -- distinct from a standalone transaction_type = 'fee' row (e.g. an
  -- annual demat AMC charge unrelated to any single trade) — same
  -- inline-fee-plus-standalone-fee shape as transactions.transfer_fee_minor_units.
  fee_minor_units bigint check (fee_minor_units is null or fee_minor_units >= 0),
  -- Bridges to the core ledger — see the file header. Nullable: not every
  -- investment event necessarily has (or the household chooses to record)
  -- a corresponding bank-account-side cash-flow transaction.
  linked_transaction_id uuid references public.transactions (id) on delete set null,
  related_person_id uuid references public.people (id) on delete set null,
  counterparty text,
  description text,
  status text not null default 'cleared' check (status in ('planned', 'pending', 'cleared', 'cancelled')),
  source_type text not null default 'manual' check (source_type in ('manual', 'import')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_transactions_quantity_price_pair
    check ((quantity is null) = (price_per_unit is null))
);

comment on table public.investment_transactions is
  'Every contribution/purchase/sale/dividend/interest/fee/withdrawal event against an investment_holdings row — kind-discriminated by transaction_type, editable + soft-cancelable (status), never a single mutable "current value." See PROMPT 16.';
comment on column public.investment_transactions.linked_transaction_id is
  'The core-ledger transactions row this event''s cash movement corresponds to, if recorded there too (e.g. kind = investment_contribution/investment_withdrawal/income/expense) — optional, so cash-flow reporting keeps reading from one place. See PROMPT 15''s dashboard.';

create index investment_transactions_household_id_idx on public.investment_transactions (household_id);
create index investment_transactions_investment_holding_id_idx on public.investment_transactions (investment_holding_id);
create index investment_transactions_linked_transaction_id_idx on public.investment_transactions (linked_transaction_id);
create index investment_transactions_related_person_id_idx on public.investment_transactions (related_person_id);
create index investment_transactions_transaction_date_idx on public.investment_transactions (household_id, transaction_date desc);

create trigger set_updated_at
  before update on public.investment_transactions
  for each row
  execute function public.set_updated_at();

-- Household + currency consistency, same shape as
-- check_transaction_consistency on the core ledger: a plain FK confirms
-- investment_holding_id/linked_transaction_id/related_person_id *exist*,
-- but not that they belong to the same household, or (for the holding)
-- that this row's currency matches the holding's asset currency.
create function public.check_investment_transaction_consistency()
returns trigger
language plpgsql
as $$
declare
  v_holding_household uuid;
  v_asset_currency text;
  v_linked_household uuid;
begin
  select ih.household_id, ia.currency_code
    into v_holding_household, v_asset_currency
  from public.investment_holdings ih
  join public.investment_assets ia on ia.id = ih.investment_asset_id
  where ih.id = new.investment_holding_id;

  if v_holding_household is null or v_holding_household <> new.household_id then
    raise exception 'investment_transactions.investment_holding_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'investment_transactions.currency_code must match the holding''s asset currency';
  end if;

  if new.related_person_id is not null and not exists (
    select 1 from public.people
    where id = new.related_person_id and household_id = new.household_id
  ) then
    raise exception 'investment_transactions.related_person_id must belong to the same household';
  end if;

  if new.linked_transaction_id is not null then
    select household_id into v_linked_household
    from public.transactions where id = new.linked_transaction_id;

    if v_linked_household is null or v_linked_household <> new.household_id then
      raise exception 'investment_transactions.linked_transaction_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_investment_transaction_consistency() is
  'Trigger: enforces household consistency across investment_holding_id/related_person_id/linked_transaction_id, and that currency_code matches the holding''s asset currency.';

create trigger check_investment_transaction_consistency
  before insert or update on public.investment_transactions
  for each row
  execute function public.check_investment_transaction_consistency();

alter table public.investment_transactions enable row level security;

create policy "members can view their household's investment transactions" on public.investment_transactions
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add investment transactions" on public.investment_transactions
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update investment transactions" on public.investment_transactions
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete investment transactions" on public.investment_transactions
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.investment_transactions to authenticated, service_role;
