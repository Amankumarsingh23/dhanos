-- record_account_balance_correction: the auditable mechanism behind a
-- manual balance correction on the Accounts screen (see PROMPT 9, "Balance
-- rules" — "Do not let manual balance edits silently destroy history. A
-- manual correction must create: balance snapshot; adjustment transaction;
-- or another auditable correction mechanism.").
--
-- A correction always inserts a new account_balance_snapshots row
-- (source = 'reconciliation') — append-only, never an update of a past
-- snapshot (docs/money-calculation-rules.md §3). When the corrected figure
-- differs from what the ledger already implies, it also inserts a single
-- transactions row with kind = 'adjustment' carrying the (possibly
-- negative) difference, so the ledger and the confirmed balance never
-- silently diverge — the correction is traceable, not a rewrite.
--
-- SECURITY INVOKER (the default — stated explicitly): both inserts run as
-- the calling user, so the normal household-role RLS policies on
-- account_balance_snapshots and transactions apply exactly as if the
-- client had issued each insert directly. PostgREST cannot span a
-- client-visible transaction across two separate REST calls
-- (docs/data-access-patterns.md step 5), so this RPC is what makes the
-- snapshot + adjustment pair atomic: either both are written, or neither
-- is.

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

  insert into public.account_balance_snapshots
    (household_id, account_id, as_of_date, balance_minor_units, currency_code, source, notes)
  values
    (p_household_id, p_account_id, p_as_of_date, p_confirmed_balance_minor_units, v_currency_code, 'reconciliation', p_notes)
  returning id into v_snapshot_id;

  v_difference := p_confirmed_balance_minor_units - p_prior_calculated_balance_minor_units;

  if v_difference <> 0 then
    insert into public.transactions
      (household_id, kind, amount_minor_units, currency_code, transaction_date, account_id, description, status, source_type)
    values
      (p_household_id, 'adjustment', v_difference, v_currency_code, p_as_of_date, p_account_id,
       coalesce(p_notes, 'Balance correction'), 'cleared', 'manual')
    returning id into v_adjustment_id;
  end if;

  return query select v_snapshot_id, v_adjustment_id;
end;
$$;

comment on function public.record_account_balance_correction(uuid, uuid, date, bigint, bigint, text) is
  'Atomically records a manual balance correction: always a new account_balance_snapshots row (source = reconciliation), plus a kind = adjustment transaction carrying the signed difference when the confirmed figure differs from the ledger-derived one. See docs/money-calculation-rules.md §2-3.';

grant execute on function public.record_account_balance_correction(uuid, uuid, date, bigint, bigint, text) to authenticated, service_role;
