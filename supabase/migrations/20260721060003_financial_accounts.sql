-- financial_accounts: a household's savings/current/cash/wallet/deposit/
-- investment/demat/loan/credit/staking/provident-fund/pension/other
-- account (see docs/financial-domain-model.md §2).
--
-- opening_balance_minor_units is a starting point only — the account's
-- *current* balance is derived from account_balance_snapshots (next
-- migration) and/or the transaction ledger, never a mutable field edited
-- in place here (see docs/money-calculation-rules.md §2).

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  account_type text not null check (
    account_type in (
      'savings', 'current', 'cash', 'wallet', 'fixed_deposit', 'recurring_deposit',
      'investment', 'demat', 'loan', 'credit', 'staking', 'provident_fund', 'pension', 'other'
    )
  ),
  -- Nullable: cash-in-hand has no institution.
  institution_id uuid references public.institutions (id) on delete set null,
  -- Nullable: an account can be added before an owner is assigned.
  owner_person_id uuid references public.people (id) on delete set null,
  -- Last-4/masked representation only — see docs/security-model.md §5
  -- (PII minimization), never a full account number.
  masked_identifier text,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  opening_balance_minor_units bigint not null default 0,
  is_active boolean not null default true,
  opened_date date,
  closed_date date,
  include_in_net_worth boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_closed_requires_inactive
    check (closed_date is null or is_active = false),
  constraint financial_accounts_closed_after_opened
    check (opened_date is null or closed_date is null or closed_date >= opened_date)
);

comment on table public.financial_accounts is
  'A household account held at an institution (or none, e.g. cash). Current balance is derived from account_balance_snapshots/transactions, never this row''s opening_balance_minor_units. See docs/financial-domain-model.md §2, docs/money-calculation-rules.md §2.';
comment on column public.financial_accounts.opening_balance_minor_units is
  'The balance at the account''s opening_date, i.e. its starting point for ledger reconstruction — not the current balance.';

create index financial_accounts_household_id_idx on public.financial_accounts (household_id);
create index financial_accounts_institution_id_idx on public.financial_accounts (institution_id);
create index financial_accounts_owner_person_id_idx on public.financial_accounts (owner_person_id);

create trigger set_updated_at
  before update on public.financial_accounts
  for each row
  execute function public.set_updated_at();

-- institution_id and owner_person_id are FKs into other household-scoped
-- tables — a plain FK can't also require "and it's the same household," so
-- that half of the invariant is a trigger.
create function public.check_financial_account_household_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.institution_id and household_id = new.household_id
  ) then
    raise exception 'financial_accounts.institution_id must belong to the same household';
  end if;

  if new.owner_person_id is not null and not exists (
    select 1 from public.people
    where id = new.owner_person_id and household_id = new.household_id
  ) then
    raise exception 'financial_accounts.owner_person_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_financial_account_household_consistency() is
  'Trigger: rejects a financial_accounts row whose institution_id or owner_person_id belongs to a different household.';

create trigger check_financial_account_household_consistency
  before insert or update on public.financial_accounts
  for each row
  execute function public.check_financial_account_household_consistency();

alter table public.financial_accounts enable row level security;

create policy "members can view their household's accounts" on public.financial_accounts
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add accounts" on public.financial_accounts
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update accounts" on public.financial_accounts
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete accounts" on public.financial_accounts
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.financial_accounts to authenticated, service_role;
