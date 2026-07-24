-- investment_accounts: PROMPT 16 — a household's platform/custody account
-- for investments (a demat account, a mutual fund folio, a crypto
-- exchange wallet, a PPF/EPF/NPS account, a self-custody wrapper like
-- "physical gold at home" with no institution). This is the first of the
-- "important distinction" the prompt calls for: the *platform account* is
-- a separate concept from the *investment asset* (investment_assets, next
-- migration) and the *holding* (investment_holdings, after that) — a
-- single investment_accounts row can (and usually does) hold many
-- different assets, never one mutable value.
--
-- Deliberately has no account_type enum the way financial_accounts does:
-- one Zerodha demat account can hold stocks, ETFs, and bonds all at once,
-- so "type" is a property of what's held (investment_assets.asset_class),
-- not of the platform account itself.
--
-- currency_code is this account's own settlement/primary currency —
-- informational, and deliberately NOT enforced to match every asset held
-- through it (see investment_assets.currency_code and investment_holdings
-- below): an international-trading-enabled account can hold both INR and
-- USD positions, and this app never combines different currencies without
-- an explicit conversion (see docs/money-calculation-rules.md §1 and this
-- prompt's acceptance criteria).

create table public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  -- Nullable: a self-custody holding (physical gold at home, a private
  -- lending arrangement with no platform) has no institution — same
  -- convention as financial_accounts.institution_id.
  institution_id uuid references public.institutions (id) on delete set null,
  owner_person_id uuid references public.people (id) on delete set null,
  -- Last-4/masked representation only, same convention and reasoning as
  -- financial_accounts.masked_identifier (see docs/security-model.md §5).
  masked_identifier text,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  opened_date date,
  closed_date date,
  include_in_net_worth boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_accounts_closed_requires_inactive
    check (closed_date is null or is_active = false),
  constraint investment_accounts_closed_after_opened
    check (opened_date is null or closed_date is null or closed_date >= opened_date)
);

comment on table public.investment_accounts is
  'A household''s platform/custody account for investments (demat, MF folio, exchange wallet, PPF/EPF/NPS account, or a self-custody wrapper with no institution). Holds many investment_holdings, never a single mutable value. See PROMPT 16, docs/financial-domain-model.md §4.';
comment on column public.investment_accounts.currency_code is
  'This account''s own settlement/primary currency — informational only, not enforced to match every asset held through it. Never combine across currencies without an explicit conversion (see docs/money-calculation-rules.md §1).';

create index investment_accounts_household_id_idx on public.investment_accounts (household_id);
create index investment_accounts_institution_id_idx on public.investment_accounts (institution_id);
create index investment_accounts_owner_person_id_idx on public.investment_accounts (owner_person_id);

create trigger set_updated_at
  before update on public.investment_accounts
  for each row
  execute function public.set_updated_at();

-- institution_id and owner_person_id are FKs into other household-scoped
-- tables — a plain FK can't also require "and it's the same household,"
-- so that half of the invariant is a trigger (same pattern as
-- check_financial_account_household_consistency).
create function public.check_investment_account_household_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.institution_id and household_id = new.household_id
  ) then
    raise exception 'investment_accounts.institution_id must belong to the same household';
  end if;

  if new.owner_person_id is not null and not exists (
    select 1 from public.people
    where id = new.owner_person_id and household_id = new.household_id
  ) then
    raise exception 'investment_accounts.owner_person_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_investment_account_household_consistency() is
  'Trigger: rejects an investment_accounts row whose institution_id or owner_person_id belongs to a different household.';

create trigger check_investment_account_household_consistency
  before insert or update on public.investment_accounts
  for each row
  execute function public.check_investment_account_household_consistency();

alter table public.investment_accounts enable row level security;

create policy "members can view their household's investment accounts" on public.investment_accounts
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add investment accounts" on public.investment_accounts
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update investment accounts" on public.investment_accounts
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete investment accounts" on public.investment_accounts
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.investment_accounts to authenticated, service_role;
