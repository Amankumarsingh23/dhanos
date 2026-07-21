-- recurring_rules: a template (amount, cadence, next-due-date, linked
-- account/category) that later transactions rows are generated from or
-- reconciled against (see docs/financial-domain-model.md §3). The
-- template itself is never a transaction — 'refund' and 'adjustment' are
-- deliberately excluded from `kind` since neither recurs by definition.

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  kind text not null check (
    kind in (
      'income', 'expense', 'transfer', 'investment_contribution', 'investment_withdrawal',
      'loan_disbursement', 'loan_payment', 'lending_disbursement', 'lending_repayment'
    )
  ),
  amount_minor_units bigint not null check (amount_minor_units <> 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  account_id uuid not null references public.financial_accounts (id) on delete restrict,
  transfer_account_id uuid references public.financial_accounts (id) on delete restrict,
  category_id uuid references public.transaction_categories (id) on delete set null,
  counterparty text,
  frequency text not null check (
    frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom')
  ),
  interval_count smallint not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  next_due_date date not null,
  last_generated_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_transfer_shape check (
    (kind = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id)
    or (kind <> 'transfer' and transfer_account_id is null)
  ),
  constraint recurring_rules_end_after_start check (end_date is null or end_date >= start_date)
);

comment on table public.recurring_rules is
  'A recurring transaction template referenced by transactions.recurring_rule_id. Not itself a transaction. See docs/financial-domain-model.md §3.';

create index recurring_rules_household_id_idx on public.recurring_rules (household_id);
create index recurring_rules_account_id_idx on public.recurring_rules (account_id);
create index recurring_rules_next_due_date_idx on public.recurring_rules (next_due_date) where is_active;

create trigger set_updated_at
  before update on public.recurring_rules
  for each row
  execute function public.set_updated_at();

create function public.check_recurring_rule_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_transfer_household uuid;
  v_transfer_currency text;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'recurring_rules.account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'recurring_rules.currency_code must match account_id''s currency';
  end if;

  if new.transfer_account_id is not null then
    select household_id, currency_code into v_transfer_household, v_transfer_currency
    from public.financial_accounts where id = new.transfer_account_id;

    if v_transfer_household is null or v_transfer_household <> new.household_id then
      raise exception 'recurring_rules.transfer_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_transfer_currency then
      raise exception 'recurring_rules.currency_code must match transfer_account_id''s currency (v1: same-currency transfers only)';
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'recurring_rules.category_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_recurring_rule_consistency() is
  'Trigger: enforces recurring_rules.account_id/transfer_account_id/category_id belong to the same household, and currency matches the funding account(s). See docs/database-plan.md §4.';

create trigger check_recurring_rule_consistency
  before insert or update on public.recurring_rules
  for each row
  execute function public.check_recurring_rule_consistency();

alter table public.recurring_rules enable row level security;

create policy "members can view their household's recurring rules" on public.recurring_rules
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add recurring rules" on public.recurring_rules
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update recurring rules" on public.recurring_rules
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete recurring rules" on public.recurring_rules
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.recurring_rules to authenticated, service_role;
