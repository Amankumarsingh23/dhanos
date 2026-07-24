-- income_sources: PROMPT 11 — a household's declared, expected income
-- streams (salary, freelance clients, rental, etc.), distinct from the
-- actual receipts recorded in `transactions`. Creating a source never
-- itself creates income (PROMPT 11 acceptance criterion) — it is purely
-- the expectation an actual `kind = 'income'` transaction (linked via
-- transactions.income_source_id, added below) is later compared against.

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  source_type text not null check (
    source_type in (
      'salary', 'internship', 'business', 'freelance', 'part_time', 'rental',
      'interest', 'dividend', 'commission', 'pension', 'gift', 'other'
    )
  ),
  -- "Institution/employer/client" — institutions.institution_type already
  -- covers 'employer' and 'business', so a client or platform paying this
  -- household is just another institution row, not a separate concept.
  institution_id uuid references public.institutions (id) on delete set null,
  -- "Person earning" — nullable: a household-level source (e.g. joint
  -- rental income) need not name one person.
  person_id uuid references public.people (id) on delete set null,
  -- Nullable: an irregular/variable-pay source may have no fixed
  -- expectation at all, only ad hoc receipts.
  expected_amount_minor_units bigint check (expected_amount_minor_units is null or expected_amount_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  frequency text not null check (
    frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'irregular')
  ),
  -- Structured half of the "expected payment date rule," used by the
  -- missed-income calculation (src/lib/calculations/income-schedule.ts) for
  -- monthly-or-slower cadences. Null for weekly/biweekly (day-of-week isn't
  -- modeled structurally — see expected_payment_date_rule) and for
  -- 'irregular' (no schedule to compute).
  expected_day_of_month smallint check (expected_day_of_month is null or expected_day_of_month between 1 and 31),
  -- Free-text half — "every 2nd Friday," "on invoice approval," etc. —
  -- for whatever the structured field can't capture. Display-only, never
  -- parsed.
  expected_payment_date_rule text,
  receiving_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  -- Optional default category applied when recording a receipt against
  -- this source (see recordIncomeAction) — not a PROMPT 11-listed field,
  -- but a low-cost convenience hook consistent with the category system
  -- already built (PROMPT 10).
  category_id uuid references public.transaction_categories (id) on delete set null,
  start_date date not null,
  end_date date,
  tax_withholding_expected boolean not null default false,
  tax_withholding_notes text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_sources_end_after_start check (end_date is null or end_date >= start_date)
);

comment on table public.income_sources is
  'A household''s declared, expected income stream. Setting one up never itself creates income — see transactions.income_source_id, and recordIncomeAction in src/features/income/actions.ts, for the actual receipts compared against it. See PROMPT 11.';
comment on column public.income_sources.expected_amount_minor_units is
  'The typical/expected amount per occurrence, or null for a source with no fixed expectation (e.g. variable freelance pay) — never treated as a recorded amount itself.';

create index income_sources_household_id_idx on public.income_sources (household_id);
create index income_sources_institution_id_idx on public.income_sources (institution_id);
create index income_sources_person_id_idx on public.income_sources (person_id);
create index income_sources_receiving_account_id_idx on public.income_sources (receiving_account_id);
create index income_sources_category_id_idx on public.income_sources (category_id);

create trigger set_updated_at
  before update on public.income_sources
  for each row
  execute function public.set_updated_at();

create function public.check_income_source_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_currency text;
begin
  select currency_code into v_account_currency
  from public.financial_accounts
  where id = new.receiving_account_id and household_id = new.household_id;

  if v_account_currency is null then
    raise exception 'income_sources.receiving_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'income_sources.currency_code must match receiving_account_id''s currency';
  end if;

  if new.institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.institution_id and household_id = new.household_id
  ) then
    raise exception 'income_sources.institution_id must belong to the same household';
  end if;

  if new.person_id is not null and not exists (
    select 1 from public.people
    where id = new.person_id and household_id = new.household_id
  ) then
    raise exception 'income_sources.person_id must belong to the same household';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'income_sources.category_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_income_source_consistency() is
  'Trigger: enforces income_sources.institution_id/person_id/receiving_account_id/category_id belong to the same household, and currency_code matches receiving_account_id''s currency.';

create trigger check_income_source_consistency
  before insert or update on public.income_sources
  for each row
  execute function public.check_income_source_consistency();

alter table public.income_sources enable row level security;

create policy "members can view their household's income sources" on public.income_sources
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add income sources" on public.income_sources
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update income sources" on public.income_sources
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete income sources" on public.income_sources
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.income_sources to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- transactions.income_source_id: links an actual kind = 'income' receipt
-- back to the source it fulfills — the join point "compare expected with
-- received" and "income by source" both read from. Nullable: plenty of
-- income (a one-off gift, a garage-sale sort of thing) has no declared
-- source. Restricted to kind = 'income' by a check constraint, same shape
-- as the existing transfer/refund constraints on this table.
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column income_source_id uuid references public.income_sources (id) on delete set null;

comment on column public.transactions.income_source_id is
  'The income_sources row this receipt fulfills, if any — null for income with no declared source. Only valid when kind = income (see transactions_income_source_requires_income_kind).';

create index transactions_income_source_id_idx on public.transactions (income_source_id);

alter table public.transactions
  add constraint transactions_income_source_requires_income_kind
  check (income_source_id is null or kind = 'income');

-- Extend the existing consistency trigger with the same
-- same-household-or-reject check every other transactions reference gets.
create or replace function public.check_transaction_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_transfer_household uuid;
  v_transfer_currency text;
  v_reversed_household uuid;
  v_reversed_kind text;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'transactions.account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'transactions.currency_code must match account_id''s currency';
  end if;

  if new.transfer_account_id is not null then
    select household_id, currency_code into v_transfer_household, v_transfer_currency
    from public.financial_accounts where id = new.transfer_account_id;

    if v_transfer_household is null or v_transfer_household <> new.household_id then
      raise exception 'transactions.transfer_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_transfer_currency then
      raise exception 'transactions.currency_code must match transfer_account_id''s currency (v1: same-currency transfers only)';
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'transactions.category_id must belong to the same household';
  end if;

  if new.recurring_rule_id is not null and not exists (
    select 1 from public.recurring_rules
    where id = new.recurring_rule_id and household_id = new.household_id
  ) then
    raise exception 'transactions.recurring_rule_id must belong to the same household';
  end if;

  if new.related_person_id is not null and not exists (
    select 1 from public.people
    where id = new.related_person_id and household_id = new.household_id
  ) then
    raise exception 'transactions.related_person_id must belong to the same household';
  end if;

  if new.income_source_id is not null and not exists (
    select 1 from public.income_sources
    where id = new.income_source_id and household_id = new.household_id
  ) then
    raise exception 'transactions.income_source_id must belong to the same household';
  end if;

  if new.reverses_transaction_id is not null then
    select household_id, kind into v_reversed_household, v_reversed_kind
    from public.transactions where id = new.reverses_transaction_id;

    if v_reversed_household is null or v_reversed_household <> new.household_id then
      raise exception 'transactions.reverses_transaction_id must belong to the same household';
    end if;

    if v_reversed_kind <> 'expense' then
      raise exception 'transactions.reverses_transaction_id must reference a kind = expense transaction';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_transaction_consistency() is
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/reversed-transaction references. See docs/database-plan.md §4.';
