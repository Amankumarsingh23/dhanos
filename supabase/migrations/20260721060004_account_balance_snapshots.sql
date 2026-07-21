-- account_balance_snapshots: append-only, dated balance record per
-- account — the concrete enforcement of "a transaction is not the same as
-- an account balance" (docs/money-calculation-rules.md §2). A financial
-- account's *current* balance is read as its latest snapshot (or computed
-- from the ledger since the last one), never a mutable column on
-- financial_accounts itself.

create table public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.financial_accounts (id) on delete cascade,
  as_of_date date not null,
  balance_minor_units bigint not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- How the figure was produced — a manual entry, a reconciliation against
  -- a statement, or a system-computed rollup from the ledger. Distinct
  -- from transactions.source_type's vocabulary since the concepts differ.
  source text not null default 'manual' check (
    source in ('manual', 'reconciliation', 'system_calculated')
  ),
  notes text,
  created_at timestamptz not null default now(),
  unique (account_id, as_of_date)
);

comment on table public.account_balance_snapshots is
  'Append-only, dated balance per account. Never updated in place — see docs/money-calculation-rules.md §2-3.';

create index account_balance_snapshots_household_id_idx on public.account_balance_snapshots (household_id);
create index account_balance_snapshots_account_id_idx on public.account_balance_snapshots (account_id);

-- account_id must belong to the same household as the snapshot row.
create function public.check_account_balance_snapshot_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.financial_accounts
    where id = new.account_id and household_id = new.household_id
  ) then
    raise exception 'account_balance_snapshots.account_id must belong to the same household';
  end if;
  return new;
end;
$$;

comment on function public.check_account_balance_snapshot_household() is
  'Trigger: rejects an account_balance_snapshots row whose account_id belongs to a different household.';

create trigger check_account_balance_snapshot_household
  before insert on public.account_balance_snapshots
  for each row
  execute function public.check_account_balance_snapshot_household();

alter table public.account_balance_snapshots enable row level security;

create policy "members can view their household's account balance snapshots" on public.account_balance_snapshots
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all — a correction
-- is a new snapshot for a later as_of_date (docs/money-calculation-rules.md §3).
create policy "owners, admins, and editors can record a balance snapshot" on public.account_balance_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- No update/delete grant either — see docs/database-plan.md §4.
grant select, insert on public.account_balance_snapshots to authenticated, service_role;
