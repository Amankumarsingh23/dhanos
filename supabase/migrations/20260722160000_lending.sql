-- PROMPT 23 — Money lent and receivables. `transactions.kind` already has
-- 'lending_disbursement'/'lending_repayment' reserved (see
-- supabase/migrations/20260721060006_transactions.sql and
-- src/lib/calculations/account-balance.ts's signedContribution — a
-- disbursement debits the source account, a repayment credits it), and
-- docs/database-plan.md §3/docs/financial-domain-model.md §4 already
-- sketched a "Receivable" shape; this migration is that shape.
--
-- **Unlike loans (PROMPT 21), lending has no "sanctioned but not yet
-- disbursed" stage** — PROMPT 23's own status list (active/partially
-- repaid/repaid/delayed/disputed/written_off) has nothing before "active",
-- because recording a lending is recording money that has already left the
-- household's hands. So creation and disbursement are one atomic step
-- (create_lending below), not the loans module's separate
-- create-then-record_loan_disbursement two-step — a lendings row can never
-- exist without its disbursement transaction alongside it.
--
-- **Outstanding is a derived figure, never a mutable column** — same rule
-- as loans.disbursed_amount_minor_units minus payments
-- (src/lib/calculations/loan-outstanding.ts): outstanding =
-- amount_lent_minor_units − sum(effective principal recovered), floored at
-- zero, computed in src/lib/calculations/lending-outstanding.ts.
-- "Effective" excludes a repayment that has been reversed and its reversal
-- row — the same reversal pattern loan_payments uses, not staking's
-- revision-versioning.

-- ---------------------------------------------------------------------------
-- 1. lendings
-- ---------------------------------------------------------------------------

create table public.lendings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  -- Borrower is a person or a company (institution, e.g. institution_type =
  -- 'business') — at least one required, same "at least one of X/Y" shape
  -- as loans.lender_institution_id/lender_person_id (PROMPT 21).
  borrower_person_id uuid references public.people (id) on delete restrict,
  borrower_institution_id uuid references public.institutions (id) on delete restrict,
  -- The account money left from, and the account repayments return to —
  -- one account for both sides, same single-account model as
  -- loans.payment_account_id.
  source_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  amount_lent_minor_units bigint not null check (amount_lent_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  disbursed_date date not null,
  disbursement_transaction_id uuid references public.transactions (id) on delete set null,
  purpose text,
  charges_interest boolean not null default false,
  -- Bounded the same way loans.annual_interest_rate is (see
  -- src/lib/calculations/calculators/rate-validation.ts's
  -- MAX_VALID_ANNUAL_RATE): <= -100% is impossible, above 1000%/year is
  -- certainly a data-entry error.
  annual_interest_rate numeric check (annual_interest_rate is null or (annual_interest_rate > -1 and annual_interest_rate <= 10)),
  interest_type text check (interest_type is null or interest_type in ('simple', 'compound')),
  expected_repayment_date date check (expected_repayment_date is null or expected_repayment_date >= disbursed_date),
  repayment_schedule_type text not null default 'lump_sum' check (
    repayment_schedule_type in ('lump_sum', 'installments', 'on_demand', 'flexible')
  ),
  installment_amount_minor_units bigint check (installment_amount_minor_units is null or installment_amount_minor_units > 0),
  installment_frequency text check (installment_frequency is null or installment_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'active' check (
    status in ('active', 'partially_repaid', 'repaid', 'delayed', 'disputed', 'written_off')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lendings_requires_a_borrower check (borrower_person_id is not null or borrower_institution_id is not null),
  constraint lendings_interest_rate_requires_charges check (not charges_interest or annual_interest_rate is not null),
  constraint lendings_installments_require_amount check (
    repayment_schedule_type <> 'installments'
    or (installment_amount_minor_units is not null and installment_frequency is not null)
  )
);

comment on table public.lendings is
  'Money the household has lent to a person or company. Created and disbursed atomically (see create_lending) — unlike loans, there is no pre-disbursement stage. Outstanding is never stored — see src/lib/calculations/lending-outstanding.ts. See PROMPT 23.';
comment on column public.lendings.amount_lent_minor_units is
  'The one-time amount actually disbursed, set at creation by create_lending and never edited afterward — the same fact loans.disbursed_amount_minor_units captures, just without a separate pre-disbursement stage.';
comment on column public.lendings.status is
  'active -> partially_repaid -> repaid, auto-advanced by record_lending_repayment as principal is recovered. delayed/disputed/written_off are set manually. A written-off lending is never deleted or hidden — its outstanding figure remains visible (PROMPT 23 acceptance criterion).';

create index lendings_household_id_idx on public.lendings (household_id);
create index lendings_borrower_person_id_idx on public.lendings (borrower_person_id);
create index lendings_borrower_institution_id_idx on public.lendings (borrower_institution_id);
create index lendings_source_account_id_idx on public.lendings (source_account_id);

create trigger set_updated_at
  before update on public.lendings
  for each row
  execute function public.set_updated_at();

create function public.check_lending_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.source_account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'lendings.source_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'lendings.currency_code must match source_account_id''s currency';
  end if;

  if new.borrower_person_id is not null and not exists (
    select 1 from public.people
    where id = new.borrower_person_id and household_id = new.household_id
  ) then
    raise exception 'lendings.borrower_person_id must belong to the same household';
  end if;

  if new.borrower_institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.borrower_institution_id and household_id = new.household_id
  ) then
    raise exception 'lendings.borrower_institution_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_lending_consistency() is
  'Trigger: enforces lendings.source_account_id/borrower_person_id/borrower_institution_id belong to the same household, and currency_code matches source_account_id''s currency.';

create trigger check_lending_consistency
  before insert or update on public.lendings
  for each row
  execute function public.check_lending_consistency();

alter table public.lendings enable row level security;

create policy "members can view their household's lendings" on public.lendings
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add lendings" on public.lendings
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update lendings" on public.lendings
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete lendings" on public.lendings
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.lendings to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. lending_repayments — append-only, same shape as loan_payments
--    (docs/money-calculation-rules.md §3). A mis-entered repayment is
--    corrected by inserting a new row that reverses it
--    (reverses_repayment_id + required reversal_reason), never by
--    editing/deleting the original.
-- ---------------------------------------------------------------------------

create table public.lending_repayments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- RESTRICT: a lending with repayment history can't be silently orphaned
  -- by deleting the lending record.
  lending_id uuid not null references public.lendings (id) on delete restrict,
  repayment_date date not null,
  -- Principal repayment is never income (PROMPT 23 acceptance criterion) —
  -- enforced by construction: record_lending_repayment always writes kind =
  -- lending_repayment, never kind = income, regardless of how this row's
  -- components are split. Interest is tracked in its own column so it can
  -- be classified/reported separately from principal recovery, per the
  -- other acceptance criterion ("interest received may be classified
  -- separately").
  principal_component_minor_units bigint not null default 0 check (principal_component_minor_units >= 0),
  interest_component_minor_units bigint not null default 0 check (interest_component_minor_units >= 0),
  total_repayment_minor_units bigint not null check (total_repayment_minor_units > 0),
  -- The portion of principal_component_minor_units that exceeded the
  -- lending's outstanding balance immediately before this repayment — 0 for
  -- an ordinary repayment. Same explicit-confirmation shape as
  -- loan_payments.overpayment_amount_minor_units (PROMPT 21).
  excess_amount_minor_units bigint not null default 0 check (excess_amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- The core-ledger transaction this repayment produced (kind =
  -- lending_repayment).
  linked_transaction_id uuid references public.transactions (id) on delete set null,
  reverses_repayment_id uuid references public.lending_repayments (id) on delete set null,
  reversal_reason text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lending_repayments_total_balances check (
    total_repayment_minor_units = principal_component_minor_units + interest_component_minor_units
  ),
  constraint lending_repayments_reversal_requires_reason check (
    reverses_repayment_id is null or (reversal_reason is not null and char_length(btrim(reversal_reason)) > 0)
  )
);

comment on table public.lending_repayments is
  'Append-only lending repayment record — principal/interest kept separate (docs/money-calculation-rules.md §2). Never updated or deleted; a correction is a new row referencing the original via reverses_repayment_id. See PROMPT 23.';
comment on column public.lending_repayments.excess_amount_minor_units is
  'The slice of principal_component_minor_units that pushed the lending below zero outstanding, explicitly confirmed by the caller before being recorded (PROMPT 23, mirroring PROMPT 21''s overpayment handling). 0 for an ordinary repayment.';

create index lending_repayments_household_id_idx on public.lending_repayments (household_id);
create index lending_repayments_lending_id_idx on public.lending_repayments (lending_id, repayment_date desc);
create index lending_repayments_linked_transaction_id_idx on public.lending_repayments (linked_transaction_id);
create index lending_repayments_reverses_repayment_id_idx on public.lending_repayments (reverses_repayment_id);

create function public.check_lending_repayment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_lending_household uuid;
  v_lending_currency text;
  v_reversed_lending_id uuid;
  v_reversed_household uuid;
begin
  select household_id, currency_code into v_lending_household, v_lending_currency
  from public.lendings where id = new.lending_id;

  if v_lending_household is null or v_lending_household <> new.household_id then
    raise exception 'lending_repayments.lending_id must belong to the same household';
  end if;

  if new.currency_code <> v_lending_currency then
    raise exception 'lending_repayments.currency_code must match the lending''s currency';
  end if;

  if new.reverses_repayment_id is not null then
    select lending_id, household_id into v_reversed_lending_id, v_reversed_household
    from public.lending_repayments where id = new.reverses_repayment_id;

    if v_reversed_household is null or v_reversed_household <> new.household_id then
      raise exception 'lending_repayments.reverses_repayment_id must belong to the same household';
    end if;

    if v_reversed_lending_id <> new.lending_id then
      raise exception 'lending_repayments.reverses_repayment_id must reference a repayment on the same lending';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_lending_repayment_consistency() is
  'Trigger: enforces lending_repayments.lending_id belongs to the same household, currency_code matches the lending''s currency, and a reversed repayment (if any) belongs to the same lending and household.';

create trigger check_lending_repayment_consistency
  before insert on public.lending_repayments
  for each row
  execute function public.check_lending_repayment_consistency();

alter table public.lending_repayments enable row level security;

create policy "members can view their household's lending repayments" on public.lending_repayments
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all.
create policy "owners, admins, and editors can record a lending repayment" on public.lending_repayments
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert on public.lending_repayments to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. transactions.lending_id — links a disbursement or repayment
--    transaction back to the lendings row it belongs to, same pattern as
--    transactions.loan_id (PROMPT 21).
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column lending_id uuid references public.lendings (id) on delete set null;

comment on column public.transactions.lending_id is
  'The lendings row this disbursement or repayment belongs to, if any — null for any other kind. Only valid when kind in (lending_disbursement, lending_repayment) — see transactions_lending_id_requires_lending_kind. See PROMPT 23.';

create index transactions_lending_id_idx on public.transactions (lending_id);

alter table public.transactions
  add constraint transactions_lending_id_requires_lending_kind
  check (lending_id is null or kind in ('lending_disbursement', 'lending_repayment'));

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
  v_loan_household uuid;
  v_lending_household uuid;
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

  if new.loan_id is not null then
    select household_id into v_loan_household
    from public.loans where id = new.loan_id;

    if v_loan_household is null or v_loan_household <> new.household_id then
      raise exception 'transactions.loan_id must belong to the same household';
    end if;
  end if;

  if new.lending_id is not null then
    select household_id into v_lending_household
    from public.lendings where id = new.lending_id;

    if v_lending_household is null or v_lending_household <> new.household_id then
      raise exception 'transactions.lending_id must belong to the same household';
    end if;
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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/lending/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. attachments.attachable_type grown to include 'lending' — schema-ready
--    for the "documents" field (PROMPT 23), same "extend with a new branch"
--    follow-up docs/financial-domain-model.md §8 already anticipated. No
--    upload UI exists yet for any attachable_type beyond
--    financial_account/transaction (see docs/implementation-status.md) —
--    this migration only makes the schema ready, matching the precedent
--    PROMPT 16's investment_documents and PROMPT 21's loans both left for
--    a future documents-module pass.
-- ---------------------------------------------------------------------------

alter table public.attachments
  drop constraint attachments_attachable_type_check;

alter table public.attachments
  add constraint attachments_attachable_type_check
  check (attachable_type in ('financial_account', 'transaction', 'lending'));

create or replace function public.check_attachment_target()
returns trigger
language plpgsql
as $$
begin
  if new.attachable_type = 'financial_account' then
    if not exists (
      select 1 from public.financial_accounts
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a financial_accounts row in the same household';
    end if;
  elsif new.attachable_type = 'transaction' then
    if not exists (
      select 1 from public.transactions
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a transactions row in the same household';
    end if;
  elsif new.attachable_type = 'lending' then
    if not exists (
      select 1 from public.lendings
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a lendings row in the same household';
    end if;
  else
    -- Unreachable given the attachable_type CHECK constraint; guards
    -- against the check and this trigger drifting apart in a future edit.
    raise exception 'unsupported attachments.attachable_type: %', new.attachable_type;
  end if;

  return new;
end;
$$;

comment on function public.check_attachment_target() is
  'Trigger: validates attachments.attachable_id exists in the table named by attachable_type and belongs to the same household. Extend with a new branch when a new attachable_type is added.';

-- ---------------------------------------------------------------------------
-- 5. create_lending() — atomically writes a new lendings row and its
--    one-time disbursement transaction (kind = lending_disbursement, so
--    PROMPT 23's "amount lent is not a consumption expense" holds by
--    construction: no other write path can create a lending_disbursement
--    row, and a lendings row can never exist without one).
-- ---------------------------------------------------------------------------

create function public.create_lending(
  p_household_id uuid,
  p_name text,
  p_source_account_id uuid,
  p_amount_lent_minor_units bigint,
  p_currency_code text,
  p_disbursed_date date,
  p_borrower_person_id uuid default null,
  p_borrower_institution_id uuid default null,
  p_purpose text default null,
  p_charges_interest boolean default false,
  p_annual_interest_rate numeric default null,
  p_interest_type text default null,
  p_expected_repayment_date date default null,
  p_repayment_schedule_type text default 'lump_sum',
  p_installment_amount_minor_units bigint default null,
  p_installment_frequency text default null,
  p_risk_level text default 'medium',
  p_notes text default null
)
returns public.lendings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lending public.lendings;
  v_transaction public.transactions;
begin
  insert into public.lendings (
    household_id, name, borrower_person_id, borrower_institution_id,
    source_account_id, amount_lent_minor_units, currency_code, disbursed_date,
    purpose, charges_interest, annual_interest_rate, interest_type,
    expected_repayment_date, repayment_schedule_type, installment_amount_minor_units,
    installment_frequency, risk_level, notes
  )
  values (
    p_household_id, p_name, p_borrower_person_id, p_borrower_institution_id,
    p_source_account_id, p_amount_lent_minor_units, p_currency_code, p_disbursed_date,
    p_purpose, p_charges_interest, p_annual_interest_rate, p_interest_type,
    p_expected_repayment_date, p_repayment_schedule_type, p_installment_amount_minor_units,
    p_installment_frequency, p_risk_level, p_notes
  )
  returning * into v_lending;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, lending_id, status, source_type, description
  )
  values (
    p_household_id, 'lending_disbursement', p_amount_lent_minor_units, p_currency_code, p_disbursed_date,
    p_source_account_id, v_lending.id, 'cleared', 'manual', coalesce(p_purpose, 'Money lent: ' || p_name)
  )
  returning * into v_transaction;

  update public.lendings
  set disbursement_transaction_id = v_transaction.id
  where id = v_lending.id
  returning * into v_lending;

  return v_lending;
end;
$$;

comment on function public.create_lending(uuid, text, uuid, bigint, text, date, uuid, uuid, text, boolean, numeric, text, date, text, bigint, text, text, text) is
  'Atomically creates a lending record and its one-time disbursement transaction (kind = lending_disbursement — never a consumption expense). Unlike record_loan_disbursement, there is no separate pre-disbursement row: a lendings row cannot exist without this transaction. See PROMPT 23.';

grant execute on function public.create_lending(uuid, text, uuid, bigint, text, date, uuid, uuid, text, boolean, numeric, text, date, text, bigint, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. record_lending_repayment() — atomically writes the core-ledger
--    transaction (kind = lending_repayment) and the lending_repayments row
--    linked to it, then auto-advances the lending's status as principal is
--    recovered (active/delayed -> partially_repaid -> repaid). Never
--    auto-sets 'disputed'/'written_off' — those are always a deliberate,
--    manual status change (setLendingStatusAction).
-- ---------------------------------------------------------------------------

create function public.record_lending_repayment(
  p_household_id uuid,
  p_lending_id uuid,
  p_repayment_date date,
  p_principal_component_minor_units bigint,
  p_interest_component_minor_units bigint,
  p_excess_amount_minor_units bigint default 0,
  p_notes text default null
)
returns public.lending_repayments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lending public.lendings;
  v_total bigint;
  v_transaction public.transactions;
  v_repayment public.lending_repayments;
  v_remaining_outstanding bigint;
begin
  select * into v_lending from public.lendings
  where id = p_lending_id and household_id = p_household_id;

  if v_lending.id is null then
    raise exception 'Lending record not found';
  end if;

  v_total := p_principal_component_minor_units + p_interest_component_minor_units;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, lending_id, status, source_type, description
  )
  values (
    p_household_id, 'lending_repayment', v_total, v_lending.currency_code, p_repayment_date,
    v_lending.source_account_id, p_lending_id, 'cleared', 'manual', coalesce(p_notes, 'Lending repayment')
  )
  returning * into v_transaction;

  insert into public.lending_repayments (
    household_id, lending_id, repayment_date, principal_component_minor_units,
    interest_component_minor_units, total_repayment_minor_units, excess_amount_minor_units,
    currency_code, linked_transaction_id, notes
  )
  values (
    p_household_id, p_lending_id, p_repayment_date, p_principal_component_minor_units,
    p_interest_component_minor_units, v_total, p_excess_amount_minor_units,
    v_lending.currency_code, v_transaction.id, p_notes
  )
  returning * into v_repayment;

  select greatest(
    0,
    v_lending.amount_lent_minor_units - coalesce(sum(lr.principal_component_minor_units), 0)
  )
  into v_remaining_outstanding
  from public.lending_repayments lr
  where lr.lending_id = p_lending_id
    and lr.reverses_repayment_id is null
    and lr.id not in (
      select reverses_repayment_id from public.lending_repayments
      where lending_id = p_lending_id and reverses_repayment_id is not null
    );

  if v_lending.status in ('active', 'partially_repaid', 'delayed') then
    if v_remaining_outstanding = 0 then
      update public.lendings set status = 'repaid' where id = p_lending_id and household_id = p_household_id;
    elsif v_remaining_outstanding < v_lending.amount_lent_minor_units then
      update public.lendings set status = 'partially_repaid' where id = p_lending_id and household_id = p_household_id;
    end if;
  end if;

  return v_repayment;
end;
$$;

comment on function public.record_lending_repayment(uuid, uuid, date, bigint, bigint, bigint, text) is
  'Atomically writes one lending repayment''s cash-flow transaction (kind = lending_repayment — never income) and lending_repayments row, then auto-advances status toward repaid as principal is recovered. excess_amount_minor_units must already be confirmed by the caller — see src/lib/calculations/lending-outstanding.ts. See PROMPT 23.';

grant execute on function public.record_lending_repayment(uuid, uuid, date, bigint, bigint, bigint, text) to authenticated, service_role;
