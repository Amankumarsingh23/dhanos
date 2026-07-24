-- PROMPT 13 — Transfers and reconciliation. Two independent pieces:
--
--   1. Transfers grow a fee and explicit cross-currency support.
--      `transactions.transfer_fee_minor_units` is an extra debit against the
--      *source* side only (money that leaves the source account but never
--      arrives anywhere — a wire/exchange fee), so it never touches
--      income/expense reporting (still just a transfer-kind row).
--      `transfer_destination_amount_minor_units` + `exchange_rate` are
--      required together whenever the source and destination accounts'
--      currencies differ, and forbidden when they match — both are always
--      user-supplied (see check_transaction_consistency below); this app
--      never looks up or invents a market rate. `reverses_transaction_id`
--      is extended to also allow a `kind = 'transfer'` row reversing
--      another `kind = 'transfer'` row (previously only refund-reverses-
--      expense was allowed), so "reversing a transfer" is a first-class,
--      traceable action rather than an ad hoc new transfer with no link
--      back to what it undoes.
--   2. Reconciliation grows an explicit `calculated_balance_minor_units`
--      (the ledger-derived figure at the moment of reconciliation) and a
--      generated `difference_minor_units` column on
--      `account_balance_snapshots`, plus `adjustment_transaction_id` for
--      direct traceability to the adjustment transaction a reconciliation
--      created (if any) — see PROMPT 13 acceptance criteria
--      "Reconciliation differences are visible" and "Adjustment history is
--      retained." Previously the difference was computed transiently
--      inside record_account_balance_correction() only to decide whether
--      to write an adjustment transaction, and then discarded — never
--      persisted anywhere a later read could see it.

-- ---------------------------------------------------------------------------
-- 1a. transactions: transfer fee + explicit cross-currency columns
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column transfer_fee_minor_units bigint,
  add column transfer_destination_amount_minor_units bigint,
  add column exchange_rate numeric(20, 10);

comment on column public.transactions.transfer_fee_minor_units is
  'An extra debit against the source account only, for kind = transfer — money that leaves but never arrives anywhere (e.g. a wire fee). Never counted as an expense; still just part of one transfer row. Null for every other kind.';
comment on column public.transactions.transfer_destination_amount_minor_units is
  'The amount actually credited to transfer_account_id, in its own currency — required together with exchange_rate whenever the source and destination accounts'' currencies differ, forbidden (must be null) when they match. Always user-supplied; this app never looks up or invents an exchange rate. See PROMPT 13.';
comment on column public.transactions.exchange_rate is
  'The source-to-destination exchange rate the user entered for a cross-currency transfer (source amount * exchange_rate ~= transfer_destination_amount_minor_units) — informational/audit metadata, never computed or fetched by the app. Required together with transfer_destination_amount_minor_units; null otherwise.';

alter table public.transactions
  add constraint transactions_transfer_fee_requires_transfer_kind
  check (transfer_fee_minor_units is null or kind = 'transfer'),
  add constraint transactions_transfer_fee_non_negative
  check (transfer_fee_minor_units is null or transfer_fee_minor_units >= 0),
  add constraint transactions_transfer_fx_requires_transfer_kind
  check (transfer_destination_amount_minor_units is null or kind = 'transfer'),
  add constraint transactions_transfer_fx_paired
  check ((transfer_destination_amount_minor_units is null) = (exchange_rate is null)),
  add constraint transactions_transfer_fx_positive
  check (transfer_destination_amount_minor_units is null or transfer_destination_amount_minor_units > 0),
  add constraint transactions_exchange_rate_positive
  check (exchange_rate is null or exchange_rate > 0);

-- ---------------------------------------------------------------------------
-- 1b. transactions_refund_shape -> transactions_reversal_shape: a transfer
-- may now also set reverses_transaction_id (optionally — most transfers
-- reverse nothing), while a refund's requirement to always set it is
-- unchanged, and every other kind still must leave it null.
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint transactions_refund_shape;

alter table public.transactions
  add constraint transactions_reversal_shape check (
    (kind = 'refund' and reverses_transaction_id is not null)
    or (kind = 'transfer')
    or (kind not in ('refund', 'transfer') and reverses_transaction_id is null)
  );

comment on column public.transactions.reverses_transaction_id is
  'For kind = refund: the expense it reverses (required). For kind = transfer: the transfer it reverses, if this row is a reversal (optional — most transfers reverse nothing). Null for every other kind. Household- and kind-matched by trigger.';

-- ---------------------------------------------------------------------------
-- 1c. check_transaction_consistency(): loosen the transfer same-currency
-- requirement into "same currency, or explicit converted amount + rate,"
-- and extend the reverses_transaction_id check for transfer-reverses-
-- transfer.
-- ---------------------------------------------------------------------------

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

    if new.currency_code = v_transfer_currency then
      -- Same-currency transfer: no converted amount/rate to store — one
      -- amount unambiguously applies to both sides.
      if new.transfer_destination_amount_minor_units is not null or new.exchange_rate is not null then
        raise exception 'transfer_destination_amount_minor_units/exchange_rate must be null for a same-currency transfer';
      end if;
    else
      -- Cross-currency transfer: PROMPT 13 requires an explicit converted
      -- amount and exchange rate — never invented or looked up here.
      if new.transfer_destination_amount_minor_units is null or new.exchange_rate is null then
        raise exception 'a transfer between different currencies requires an explicit transfer_destination_amount_minor_units and exchange_rate';
      end if;
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

    if new.kind = 'refund' and v_reversed_kind <> 'expense' then
      raise exception 'a refund''s reverses_transaction_id must reference a kind = expense transaction';
    end if;

    if new.kind = 'transfer' and v_reversed_kind <> 'transfer' then
      raise exception 'a transfer''s reverses_transaction_id must reference a kind = transfer transaction';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_transaction_consistency() is
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/reversed-transaction references, and PROMPT 13''s explicit-conversion rule for cross-currency transfers. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 1d. create_transaction_with_splits / update_transaction_with_splits:
-- add the three transfer-only columns. Dropped and recreated (not CREATE
-- OR REPLACE) since appended parameters change the argument-type
-- signature — see PROMPT 12's migration for the same reasoning.
-- ---------------------------------------------------------------------------

drop function if exists public.create_transaction_with_splits(
  uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean
);
drop function if exists public.update_transaction_with_splits(
  uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean
);

create function public.create_transaction_with_splits(
  p_household_id uuid,
  p_kind text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_transaction_date date,
  p_account_id uuid,
  p_transfer_account_id uuid default null,
  p_category_id uuid default null,
  p_counterparty text default null,
  p_description text default null,
  p_status text default 'cleared',
  p_source_type text default 'manual',
  p_recurring_rule_id uuid default null,
  p_related_person_id uuid default null,
  p_reverses_transaction_id uuid default null,
  p_splits jsonb default null,
  p_is_planned boolean default true,
  p_transfer_fee_minor_units bigint default null,
  p_transfer_destination_amount_minor_units bigint default null,
  p_exchange_rate numeric default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
  v_split jsonb;
begin
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, transfer_account_id, category_id, counterparty, description,
    status, source_type, recurring_rule_id, related_person_id, reverses_transaction_id,
    is_planned, transfer_fee_minor_units, transfer_destination_amount_minor_units, exchange_rate
  )
  values (
    p_household_id, p_kind, p_amount_minor_units, p_currency_code, p_transaction_date,
    p_account_id, p_transfer_account_id, p_category_id, p_counterparty, p_description,
    p_status, p_source_type, p_recurring_rule_id, p_related_person_id, p_reverses_transaction_id,
    p_is_planned, p_transfer_fee_minor_units, p_transfer_destination_amount_minor_units, p_exchange_rate
  )
  returning * into v_transaction;

  if p_splits is not null then
    for v_split in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.transaction_splits (household_id, transaction_id, category_id, amount_minor_units, notes)
      values (
        p_household_id,
        v_transaction.id,
        (v_split ->> 'category_id')::uuid,
        (v_split ->> 'amount_minor_units')::bigint,
        v_split ->> 'notes'
      );
    end loop;
  end if;

  return v_transaction;
end;
$$;

comment on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean, bigint, bigint, numeric) is
  'Atomically creates a transaction and (optionally) its transaction_splits. SECURITY INVOKER: runs under the caller''s session, so the normal transactions/transaction_splits RLS policies apply exactly as if the client had issued each insert directly.';

create function public.update_transaction_with_splits(
  p_household_id uuid,
  p_transaction_id uuid,
  p_kind text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_transaction_date date,
  p_account_id uuid,
  p_transfer_account_id uuid default null,
  p_category_id uuid default null,
  p_counterparty text default null,
  p_description text default null,
  p_status text default 'cleared',
  p_source_type text default 'manual',
  p_recurring_rule_id uuid default null,
  p_related_person_id uuid default null,
  p_reverses_transaction_id uuid default null,
  p_splits jsonb default null,
  p_is_planned boolean default true,
  p_transfer_fee_minor_units bigint default null,
  p_transfer_destination_amount_minor_units bigint default null,
  p_exchange_rate numeric default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
  v_split jsonb;
begin
  update public.transactions set
    kind = p_kind,
    amount_minor_units = p_amount_minor_units,
    currency_code = p_currency_code,
    transaction_date = p_transaction_date,
    account_id = p_account_id,
    transfer_account_id = p_transfer_account_id,
    category_id = p_category_id,
    counterparty = p_counterparty,
    description = p_description,
    status = p_status,
    source_type = p_source_type,
    recurring_rule_id = p_recurring_rule_id,
    related_person_id = p_related_person_id,
    reverses_transaction_id = p_reverses_transaction_id,
    is_planned = p_is_planned,
    transfer_fee_minor_units = p_transfer_fee_minor_units,
    transfer_destination_amount_minor_units = p_transfer_destination_amount_minor_units,
    exchange_rate = p_exchange_rate
  where id = p_transaction_id and household_id = p_household_id
  returning * into v_transaction;

  if v_transaction.id is null then
    raise exception 'Transaction not found';
  end if;

  if p_splits is not null then
    delete from public.transaction_splits
    where transaction_id = v_transaction.id and household_id = p_household_id;

    for v_split in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.transaction_splits (household_id, transaction_id, category_id, amount_minor_units, notes)
      values (
        p_household_id,
        v_transaction.id,
        (v_split ->> 'category_id')::uuid,
        (v_split ->> 'amount_minor_units')::bigint,
        v_split ->> 'notes'
      );
    end loop;
  end if;

  return v_transaction;
end;
$$;

comment on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean, bigint, bigint, numeric) is
  'Atomically updates a transaction and replaces its transaction_splits (when p_splits is provided). SECURITY INVOKER, household-scoped.';

grant execute on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean, bigint, bigint, numeric) to authenticated, service_role;
grant execute on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean, bigint, bigint, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2a. account_balance_snapshots: calculated balance + generated difference
-- + adjustment linkage
-- ---------------------------------------------------------------------------

alter table public.account_balance_snapshots
  add column calculated_balance_minor_units bigint,
  add column difference_minor_units bigint
    generated always as (balance_minor_units - calculated_balance_minor_units) stored,
  add column adjustment_transaction_id uuid references public.transactions (id) on delete set null;

comment on column public.account_balance_snapshots.calculated_balance_minor_units is
  'What the ledger implied this account''s balance was at the moment of reconciliation (see getCalculatedAccountBalance) — null for a plain manual snapshot with no ledger comparison. Never recomputed after the fact; this is a point-in-time record.';
comment on column public.account_balance_snapshots.difference_minor_units is
  'balance_minor_units (confirmed) minus calculated_balance_minor_units — generated, so it can never drift from the two source values. Null whenever calculated_balance_minor_units is null. PROMPT 13 acceptance criterion "Reconciliation differences are visible."';
comment on column public.account_balance_snapshots.adjustment_transaction_id is
  'The kind = adjustment transaction this reconciliation created, if the confirmed balance differed from the calculated one — null when there was no difference. PROMPT 13 acceptance criterion "Adjustment history is retained."';

create index account_balance_snapshots_adjustment_transaction_id_idx on public.account_balance_snapshots (adjustment_transaction_id);

-- ---------------------------------------------------------------------------
-- 2b. record_account_balance_correction: populate the two new columns.
-- Reordered to insert the adjustment transaction first (when there's a
-- difference) so its id is available for the snapshot row — the snapshot
-- table has no update policy (append-only), so the link must be written
-- at insert time, not patched in afterward.
-- ---------------------------------------------------------------------------

drop function if exists public.record_account_balance_correction(uuid, uuid, date, bigint, bigint, text);

create function public.record_account_balance_correction(
  p_household_id uuid,
  p_account_id uuid,
  p_as_of_date date,
  p_confirmed_balance_minor_units bigint,
  p_prior_calculated_balance_minor_units bigint,
  p_notes text default null
)
returns table (
  snapshot_id uuid,
  adjustment_transaction_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_currency_code text;
  v_snapshot_id uuid;
  v_adjustment_id uuid;
  v_difference bigint;
begin
  select currency_code into v_currency_code
  from public.financial_accounts
  where id = p_account_id and household_id = p_household_id;

  if v_currency_code is null then
    raise exception 'financial_accounts.id must belong to the same household';
  end if;

  v_difference := p_confirmed_balance_minor_units - p_prior_calculated_balance_minor_units;

  if v_difference <> 0 then
    insert into public.transactions
      (household_id, kind, amount_minor_units, currency_code, transaction_date, account_id, description, status, source_type)
    values
      (p_household_id, 'adjustment', v_difference, v_currency_code, p_as_of_date, p_account_id,
       coalesce(p_notes, 'Balance correction'), 'cleared', 'manual')
    returning id into v_adjustment_id;
  end if;

  insert into public.account_balance_snapshots
    (household_id, account_id, as_of_date, balance_minor_units, currency_code, source, notes,
     calculated_balance_minor_units, adjustment_transaction_id)
  values
    (p_household_id, p_account_id, p_as_of_date, p_confirmed_balance_minor_units, v_currency_code, 'reconciliation', p_notes,
     p_prior_calculated_balance_minor_units, v_adjustment_id)
  returning id into v_snapshot_id;

  return query select v_snapshot_id, v_adjustment_id;
end;
$$;

comment on function public.record_account_balance_correction(uuid, uuid, date, bigint, bigint, text) is
  'Atomically records a manual balance correction: a new account_balance_snapshots row (source = reconciliation, carrying both the confirmed and calculated balance so the difference is never lost), plus a kind = adjustment transaction carrying the signed difference when the confirmed figure differs from the ledger-derived one. See docs/money-calculation-rules.md §2-3 and PROMPT 13.';

grant execute on function public.record_account_balance_correction(uuid, uuid, date, bigint, bigint, text) to authenticated, service_role;
