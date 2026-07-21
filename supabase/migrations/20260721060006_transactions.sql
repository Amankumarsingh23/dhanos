-- transactions: the atomic ledger entry (see docs/financial-domain-model.md
-- §3). Every row carries a `kind` discriminator so a transfer can never be
-- miscounted as income/expense, an investment contribution never
-- miscounted as consumption spending, and a refund is always traceable to
-- the expense it reverses (docs/money-calculation-rules.md §2).
--
-- account_id/transfer_account_id use ON DELETE RESTRICT (not CASCADE): an
-- account with transaction history cannot be silently emptied by deleting
-- the account — see docs/database-plan.md §1 "Soft delete".

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (
    kind in (
      'income', 'expense', 'transfer', 'investment_contribution', 'investment_withdrawal',
      'loan_disbursement', 'loan_payment', 'lending_disbursement', 'lending_repayment',
      'refund', 'adjustment'
    )
  ),
  amount_minor_units bigint not null check (amount_minor_units <> 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  transaction_date date not null,
  account_id uuid not null references public.financial_accounts (id) on delete restrict,
  -- Destination account — required for, and only for, kind = 'transfer'.
  transfer_account_id uuid references public.financial_accounts (id) on delete restrict,
  category_id uuid references public.transaction_categories (id) on delete set null,
  counterparty text,
  description text,
  status text not null default 'cleared' check (status in ('pending', 'cleared', 'void')),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'recurring', 'system')),
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  related_person_id uuid references public.people (id) on delete set null,
  -- Required for, and only for, kind = 'refund'. RESTRICT: the reversed
  -- expense can't be deleted out from under a refund that references it.
  reverses_transaction_id uuid references public.transactions (id) on delete restrict,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_transfer_shape check (
    (kind = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id)
    or (kind <> 'transfer' and transfer_account_id is null)
  ),
  constraint transactions_refund_shape check (
    (kind = 'refund' and reverses_transaction_id is not null)
    or (kind <> 'refund' and reverses_transaction_id is null)
  )
);

comment on table public.transactions is
  'The atomic ledger entry, discriminated by kind. Reporting logic must read public.cash_flow_transactions (below) rather than filtering this table ad hoc, so a transfer can never be miscounted as income/expense. See docs/financial-domain-model.md §3, docs/money-calculation-rules.md §2.';
comment on column public.transactions.transfer_account_id is
  'Destination account, required only for kind = transfer. Must be same household and same currency as account_id (v1: same-currency transfers only) — enforced by trigger.';
comment on column public.transactions.reverses_transaction_id is
  'The original expense transaction this refund reverses, required only for kind = refund. Must reference a kind = expense row in the same household — enforced by trigger.';

create index transactions_household_id_idx on public.transactions (household_id);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_transfer_account_id_idx on public.transactions (transfer_account_id);
create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_recurring_rule_id_idx on public.transactions (recurring_rule_id);
create index transactions_related_person_id_idx on public.transactions (related_person_id);
create index transactions_reverses_transaction_id_idx on public.transactions (reverses_transaction_id);
create index transactions_transaction_date_idx on public.transactions (household_id, transaction_date desc);

create trigger set_updated_at
  before update on public.transactions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Household + currency consistency (docs/database-plan.md §4)
--
-- A plain FK can confirm account_id/transfer_account_id/category_id/
-- recurring_rule_id/related_person_id/reverses_transaction_id *exist*, but
-- not that they belong to the *same household* as the transaction, or (for
-- the two account references) the same currency. That's what this trigger
-- adds — the acceptance criterion "transfers cannot be misclassified as
-- income by reporting logic" starts here: a transfer can only ever
-- reference two same-household, same-currency accounts, never leak across
-- tenants or currencies for reporting code to have to detect after the fact.
-- ---------------------------------------------------------------------------

create function public.check_transaction_consistency()
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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/reversed-transaction references. See docs/database-plan.md §4.';

create trigger check_transaction_consistency
  before insert or update on public.transactions
  for each row
  execute function public.check_transaction_consistency();

-- ---------------------------------------------------------------------------
-- Reporting-safe view: transfers are structurally excluded, not left to
-- report code to remember to filter. This is the acceptance criterion
-- "Transfers cannot be misclassified as income by reporting logic" — any
-- income/expense report built against this view cannot include a transfer
-- no matter how it's aggregated downstream.
-- ---------------------------------------------------------------------------

create view public.cash_flow_transactions
with (security_invoker = true)
as
  select *
  from public.transactions
  where kind in ('income', 'expense');

comment on view public.cash_flow_transactions is
  'transactions filtered to kind IN (income, expense) — the only rows that belong in cash-flow/income-vs-expense reporting. Transfers, investment moves, loan/lending activity, refunds, and adjustments are excluded by construction. security_invoker = true so the view is subject to the same RLS as the underlying table.';

grant select on public.cash_flow_transactions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.transactions enable row level security;

create policy "members can view their household's transactions" on public.transactions
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add transactions" on public.transactions
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update transactions" on public.transactions
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete transactions" on public.transactions
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.transactions to authenticated, service_role;
