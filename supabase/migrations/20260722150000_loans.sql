-- PROMPT 21 — Loan management. `transactions.kind` already has
-- 'loan_disbursement'/'loan_payment' reserved (see
-- supabase/migrations/20260721060006_transactions.sql and
-- src/lib/calculations/account-balance.ts's signedContribution — a
-- disbursement credits the payment account, a payment debits it), and
-- docs/database-plan.md §3/docs/financial-domain-model.md §4 already
-- sketched a `loans`/`loan_payments` shape; this migration is that shape,
-- extended per PROMPT 21's fuller field list (fee/penalty components
-- alongside principal/interest, education-loan fields, an explicit
-- overpayment column).
--
-- **Outstanding principal is a derived figure, never a mutable column** —
-- same rule as financial_accounts' calculated balance (PROMPT 9) and
-- staking_positions' current value (PROMPT 19): `loans` stores
-- `disbursed_amount_minor_units` (a fact — how much was actually paid out),
-- and outstanding = disbursed − sum(effective principal paid), floored at
-- zero, computed in src/lib/calculations/loan-outstanding.ts. "Effective"
-- excludes a payment that has been reversed and its reversal row (see
-- loan_payments below), the same reversal pattern transactions.reverses_transaction_id
-- already uses for refunds/transfer-reversals — not the revision-versioning
-- staking_daily_snapshots uses, which solves a different problem ("one
-- deterministic value per day") that a discrete payment event doesn't have.

-- ---------------------------------------------------------------------------
-- 1. loans
-- ---------------------------------------------------------------------------

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  loan_type text not null check (
    loan_type in (
      'education', 'personal', 'business', 'home', 'vehicle', 'gold',
      'credit_card', 'family', 'informal', 'other'
    )
  ),
  -- Lender is an institution (bank/NBFC) or a person (family/informal
  -- loan) — at least one required. No existing table in this schema has
  -- an "at least one of X/Y" CHECK yet (income_sources/financial_accounts'
  -- institution_id/person_id pairs are both independently optional), but
  -- a loan without any lender at all is a simple, absolute invariant this
  -- app's own money-calculation-rules.md §1 says to enforce with a CHECK
  -- rather than "the application will validate it."
  lender_institution_id uuid references public.institutions (id) on delete restrict,
  lender_person_id uuid references public.people (id) on delete restrict,
  borrower_person_id uuid not null references public.people (id) on delete restrict,
  co_borrower_person_id uuid references public.people (id) on delete set null,
  original_principal_minor_units bigint not null check (original_principal_minor_units > 0),
  -- Null until a disbursement is recorded (record_loan_disbursement below)
  -- — a sanctioned-but-undisbursed loan has nothing outstanding yet.
  disbursed_amount_minor_units bigint check (disbursed_amount_minor_units is null or disbursed_amount_minor_units > 0),
  disbursed_date date,
  disbursement_transaction_id uuid references public.transactions (id) on delete set null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Bounded the same way calculator/staking rate inputs are (see
  -- src/lib/calculations/calculators/rate-validation.ts's
  -- MAX_VALID_ANNUAL_RATE): <= -100% is impossible, and above 1000%/year
  -- is certain to be a data-entry error, not a real loan term.
  annual_interest_rate numeric not null check (annual_interest_rate > -1 and annual_interest_rate <= 10),
  interest_type text not null check (interest_type in ('fixed', 'floating')),
  -- Null while a moratorium is in effect and no EMI has started yet.
  emi_amount_minor_units bigint check (emi_amount_minor_units is null or emi_amount_minor_units > 0),
  start_date date not null,
  repayment_start_date date not null check (repayment_start_date >= start_date),
  maturity_date date check (maturity_date is null or maturity_date >= repayment_start_date),
  -- RESTRICT: same reasoning as transactions.account_id — an account that
  -- has funded/received loan activity can't be silently emptied.
  payment_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  status text not null default 'pending_disbursement' check (
    status in ('pending_disbursement', 'active', 'closed', 'defaulted', 'settled')
  ),
  collateral text,
  notes text,
  -- Education-loan fields (PROMPT 21) — nullable and usable regardless of
  -- loan_type at the schema layer (the UI only collects/shows them for
  -- loan_type = 'education'); co-borrower and repayment_start_date are
  -- deliberately not duplicated here since the generic columns above
  -- already cover both.
  educational_institution_id uuid references public.institutions (id) on delete set null,
  course text,
  study_start_date date,
  study_end_date date check (study_end_date is null or study_start_date is null or study_end_date >= study_start_date),
  moratorium boolean not null default false,
  moratorium_end_date date check (moratorium_end_date is null or moratorium_end_date >= start_date),
  interest_subsidy boolean not null default false,
  interest_subsidy_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_requires_a_lender check (lender_institution_id is not null or lender_person_id is not null),
  constraint loans_moratorium_requires_end_date check (not moratorium or moratorium_end_date is not null)
);

comment on table public.loans is
  'A loan the household has borrowed (education/personal/business/home/vehicle/gold/credit_card/family/informal/other). Outstanding principal is never stored — see src/lib/calculations/loan-outstanding.ts. See PROMPT 21.';
comment on column public.loans.disbursed_amount_minor_units is
  'How much has actually been paid out so far (set once, by record_loan_disbursement) — outstanding is derived from this, not from original_principal_minor_units, since undisbursed principal is not yet owed.';
comment on column public.loans.status is
  'pending_disbursement (sanctioned, not yet paid out) -> active -> closed (repaid in full) | defaulted | settled (negotiated closure for less than owed). record_loan_payment auto-advances active -> closed once outstanding reaches zero.';

create index loans_household_id_idx on public.loans (household_id);
create index loans_lender_institution_id_idx on public.loans (lender_institution_id);
create index loans_lender_person_id_idx on public.loans (lender_person_id);
create index loans_borrower_person_id_idx on public.loans (borrower_person_id);
create index loans_co_borrower_person_id_idx on public.loans (co_borrower_person_id);
create index loans_payment_account_id_idx on public.loans (payment_account_id);
create index loans_educational_institution_id_idx on public.loans (educational_institution_id);

create trigger set_updated_at
  before update on public.loans
  for each row
  execute function public.set_updated_at();

create function public.check_loan_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.payment_account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'loans.payment_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'loans.currency_code must match payment_account_id''s currency';
  end if;

  if new.lender_institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.lender_institution_id and household_id = new.household_id
  ) then
    raise exception 'loans.lender_institution_id must belong to the same household';
  end if;

  if new.lender_person_id is not null and not exists (
    select 1 from public.people
    where id = new.lender_person_id and household_id = new.household_id
  ) then
    raise exception 'loans.lender_person_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.people
    where id = new.borrower_person_id and household_id = new.household_id
  ) then
    raise exception 'loans.borrower_person_id must belong to the same household';
  end if;

  if new.co_borrower_person_id is not null and not exists (
    select 1 from public.people
    where id = new.co_borrower_person_id and household_id = new.household_id
  ) then
    raise exception 'loans.co_borrower_person_id must belong to the same household';
  end if;

  if new.educational_institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.educational_institution_id and household_id = new.household_id
  ) then
    raise exception 'loans.educational_institution_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_loan_consistency() is
  'Trigger: enforces loans.payment_account_id/lender_institution_id/lender_person_id/borrower_person_id/co_borrower_person_id/educational_institution_id belong to the same household, and currency_code matches payment_account_id''s currency.';

create trigger check_loan_consistency
  before insert or update on public.loans
  for each row
  execute function public.check_loan_consistency();

alter table public.loans enable row level security;

create policy "members can view their household's loans" on public.loans
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add loans" on public.loans
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update loans" on public.loans
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete loans" on public.loans
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.loans to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. loan_payments — append-only (docs/money-calculation-rules.md §3: "Do
--    not overwrite loan-payment history. Each payment is an immutable,
--    append-only row.") A mis-entered payment is corrected by inserting a
--    new row that reverses it (reverses_payment_id + required
--    reversal_reason), never by editing/deleting the original — same
--    shape as transactions.reverses_transaction_id. Reversing a payment
--    *record* does not itself move money back; correcting the underlying
--    cash transaction (if it was genuinely wrong) is a separate step via
--    the Transactions feature.
-- ---------------------------------------------------------------------------

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- RESTRICT: a loan with payment history can't be silently orphaned by
  -- deleting the loan.
  loan_id uuid not null references public.loans (id) on delete restrict,
  payment_date date not null,
  principal_component_minor_units bigint not null default 0 check (principal_component_minor_units >= 0),
  interest_component_minor_units bigint not null default 0 check (interest_component_minor_units >= 0),
  fee_component_minor_units bigint not null default 0 check (fee_component_minor_units >= 0),
  penalty_component_minor_units bigint not null default 0 check (penalty_component_minor_units >= 0),
  total_payment_minor_units bigint not null check (total_payment_minor_units > 0),
  -- The portion of principal_component_minor_units that exceeded the
  -- loan's outstanding balance immediately before this payment — 0 for a
  -- normal payment. record_loan_payment only ever writes a nonzero value
  -- here when the caller has explicitly confirmed the overpayment
  -- (PROMPT 21: "cannot become negative without explicit overpayment
  -- handling").
  overpayment_amount_minor_units bigint not null default 0 check (overpayment_amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- The core-ledger transaction this payment produced (kind =
  -- loan_payment) — PROMPT 21: "each paid EMI should produce ... a linked
  -- cash transaction."
  linked_transaction_id uuid references public.transactions (id) on delete set null,
  reverses_payment_id uuid references public.loan_payments (id) on delete set null,
  reversal_reason text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint loan_payments_total_balances check (
    total_payment_minor_units = principal_component_minor_units + interest_component_minor_units
      + fee_component_minor_units + penalty_component_minor_units
  ),
  constraint loan_payments_reversal_requires_reason check (
    reverses_payment_id is null or (reversal_reason is not null and char_length(btrim(reversal_reason)) > 0)
  )
);

comment on table public.loan_payments is
  'Append-only loan payment record — principal/interest/fee/penalty kept separate (docs/money-calculation-rules.md §2). Never updated or deleted; a correction is a new row referencing the original via reverses_payment_id. See PROMPT 21.';
comment on column public.loan_payments.overpayment_amount_minor_units is
  'The slice of principal_component_minor_units that pushed the loan below zero outstanding, explicitly confirmed by the caller before being recorded (PROMPT 21 acceptance criterion). 0 for an ordinary payment.';

create index loan_payments_household_id_idx on public.loan_payments (household_id);
create index loan_payments_loan_id_idx on public.loan_payments (loan_id, payment_date desc);
create index loan_payments_linked_transaction_id_idx on public.loan_payments (linked_transaction_id);
create index loan_payments_reverses_payment_id_idx on public.loan_payments (reverses_payment_id);

create function public.check_loan_payment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_loan_household uuid;
  v_loan_currency text;
  v_reversed_loan_id uuid;
  v_reversed_household uuid;
begin
  select household_id, currency_code into v_loan_household, v_loan_currency
  from public.loans where id = new.loan_id;

  if v_loan_household is null or v_loan_household <> new.household_id then
    raise exception 'loan_payments.loan_id must belong to the same household';
  end if;

  if new.currency_code <> v_loan_currency then
    raise exception 'loan_payments.currency_code must match the loan''s currency';
  end if;

  if new.reverses_payment_id is not null then
    select loan_id, household_id into v_reversed_loan_id, v_reversed_household
    from public.loan_payments where id = new.reverses_payment_id;

    if v_reversed_household is null or v_reversed_household <> new.household_id then
      raise exception 'loan_payments.reverses_payment_id must belong to the same household';
    end if;

    if v_reversed_loan_id <> new.loan_id then
      raise exception 'loan_payments.reverses_payment_id must reference a payment on the same loan';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_loan_payment_consistency() is
  'Trigger: enforces loan_payments.loan_id belongs to the same household, currency_code matches the loan''s currency, and a reversed payment (if any) belongs to the same loan and household.';

create trigger check_loan_payment_consistency
  before insert on public.loan_payments
  for each row
  execute function public.check_loan_payment_consistency();

alter table public.loan_payments enable row level security;

create policy "members can view their household's loan payments" on public.loan_payments
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all.
create policy "owners, admins, and editors can record a loan payment" on public.loan_payments
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- No update/delete grant either — see docs/database-plan.md §4.
grant select, insert on public.loan_payments to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. transactions.loan_id — links a disbursement or payment transaction
--    back to the loans row it belongs to, same pattern as
--    transactions.income_source_id (PROMPT 11).
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column loan_id uuid references public.loans (id) on delete set null;

comment on column public.transactions.loan_id is
  'The loans row this disbursement or payment belongs to, if any — null for any other kind. Only valid when kind in (loan_disbursement, loan_payment) — see transactions_loan_id_requires_loan_kind. See PROMPT 21.';

create index transactions_loan_id_idx on public.transactions (loan_id);

alter table public.transactions
  add constraint transactions_loan_id_requires_loan_kind
  check (loan_id is null or kind in ('loan_disbursement', 'loan_payment'));

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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. record_loan_disbursement() — atomically writes the core-ledger
--    transaction (kind = loan_disbursement, so PROMPT 21's "loan
--    disbursement is not ordinary income" holds by construction: no other
--    write path can create a loan_disbursement row) and marks the loan
--    disbursed. One-time: rejects a loan that's already been disbursed.
-- ---------------------------------------------------------------------------

create function public.record_loan_disbursement(
  p_household_id uuid,
  p_loan_id uuid,
  p_disbursement_date date,
  p_amount_minor_units bigint,
  p_notes text default null
)
returns public.loans
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_loan public.loans;
  v_transaction public.transactions;
begin
  select * into v_loan from public.loans
  where id = p_loan_id and household_id = p_household_id;

  if v_loan.id is null then
    raise exception 'Loan not found';
  end if;

  if v_loan.disbursed_amount_minor_units is not null then
    raise exception 'This loan has already been disbursed';
  end if;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, loan_id, status, source_type, description
  )
  values (
    p_household_id, 'loan_disbursement', p_amount_minor_units, v_loan.currency_code, p_disbursement_date,
    v_loan.payment_account_id, p_loan_id, 'cleared', 'manual', coalesce(p_notes, 'Loan disbursement')
  )
  returning * into v_transaction;

  update public.loans
  set disbursed_amount_minor_units = p_amount_minor_units,
      disbursed_date = p_disbursement_date,
      disbursement_transaction_id = v_transaction.id,
      status = 'active'
  where id = p_loan_id and household_id = p_household_id
  returning * into v_loan;

  return v_loan;
end;
$$;

comment on function public.record_loan_disbursement(uuid, uuid, date, bigint, text) is
  'Atomically writes a loan''s one-time disbursement transaction (kind = loan_disbursement — never income) and marks the loan active. Rejects a loan that already has a disbursed amount. See PROMPT 21.';

grant execute on function public.record_loan_disbursement(uuid, uuid, date, bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. record_loan_payment() — atomically writes the core-ledger transaction
--    (kind = loan_payment) and the loan_payments row linked to it, then
--    auto-closes the loan once outstanding reaches zero (same
--    schedule-exhaustion-closes-itself convention as investment_sips —
--    PROMPT 17).
-- ---------------------------------------------------------------------------

create function public.record_loan_payment(
  p_household_id uuid,
  p_loan_id uuid,
  p_payment_date date,
  p_principal_component_minor_units bigint,
  p_interest_component_minor_units bigint,
  p_fee_component_minor_units bigint,
  p_penalty_component_minor_units bigint,
  p_overpayment_amount_minor_units bigint default 0,
  p_notes text default null
)
returns public.loan_payments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_loan public.loans;
  v_total bigint;
  v_transaction public.transactions;
  v_payment public.loan_payments;
  v_remaining_outstanding bigint;
begin
  select * into v_loan from public.loans
  where id = p_loan_id and household_id = p_household_id;

  if v_loan.id is null then
    raise exception 'Loan not found';
  end if;

  v_total := p_principal_component_minor_units + p_interest_component_minor_units
    + p_fee_component_minor_units + p_penalty_component_minor_units;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, loan_id, status, source_type, description
  )
  values (
    p_household_id, 'loan_payment', v_total, v_loan.currency_code, p_payment_date,
    v_loan.payment_account_id, p_loan_id, 'cleared', 'manual', coalesce(p_notes, 'Loan payment')
  )
  returning * into v_transaction;

  insert into public.loan_payments (
    household_id, loan_id, payment_date, principal_component_minor_units,
    interest_component_minor_units, fee_component_minor_units, penalty_component_minor_units,
    total_payment_minor_units, overpayment_amount_minor_units, currency_code,
    linked_transaction_id, notes
  )
  values (
    p_household_id, p_loan_id, p_payment_date, p_principal_component_minor_units,
    p_interest_component_minor_units, p_fee_component_minor_units, p_penalty_component_minor_units,
    v_total, p_overpayment_amount_minor_units, v_loan.currency_code,
    v_transaction.id, p_notes
  )
  returning * into v_payment;

  select greatest(
    0,
    coalesce(v_loan.disbursed_amount_minor_units, 0) - coalesce(sum(lp.principal_component_minor_units), 0)
  )
  into v_remaining_outstanding
  from public.loan_payments lp
  where lp.loan_id = p_loan_id
    and lp.reverses_payment_id is null
    and lp.id not in (
      select reverses_payment_id from public.loan_payments
      where loan_id = p_loan_id and reverses_payment_id is not null
    );

  if v_loan.status = 'active' and v_remaining_outstanding = 0 then
    update public.loans set status = 'closed' where id = p_loan_id and household_id = p_household_id;
  end if;

  return v_payment;
end;
$$;

comment on function public.record_loan_payment(uuid, uuid, date, bigint, bigint, bigint, bigint, bigint, text) is
  'Atomically writes one loan payment''s cash-flow transaction (kind = loan_payment) and loan_payments row, then auto-closes the loan once outstanding reaches zero. overpayment_amount_minor_units must already be confirmed by the caller — see src/lib/calculations/loan-outstanding.ts. See PROMPT 21.';

grant execute on function public.record_loan_payment(uuid, uuid, date, bigint, bigint, bigint, bigint, bigint, text) to authenticated, service_role;
