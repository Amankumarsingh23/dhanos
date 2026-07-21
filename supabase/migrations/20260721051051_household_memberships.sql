-- Expands the tenancy foundation (see 20260721021743_tenancy_households.sql)
-- into the fuller household model: a richer role set, membership status
-- (so a future invitation flow has somewhere to land), household-level
-- timezone/financial-month settings, and an idempotent creation path that
-- can't produce duplicate households on a client retry.
--
-- `household_members` is renamed to `household_memberships` — "membership"
-- better matches the row's actual meaning (a status-bearing relationship
-- between a user and a household, not the person themselves) now that
-- `status` exists alongside `role`.

-- ---------------------------------------------------------------------------
-- households: new columns
-- ---------------------------------------------------------------------------

alter table public.households
  add column timezone text not null default 'Asia/Kolkata' check (char_length(btrim(timezone)) > 0),
  -- The day of the (calendar) month a household's "financial month" starts
  -- on — e.g. 25 for a household whose income lands on the 25th. Capped at
  -- 28 so every calendar month actually has that day, avoiding "day 30 of
  -- February" ambiguity. 1 (the default) means calendar months.
  add column financial_month_start_day smallint not null default 1
    check (financial_month_start_day between 1 and 28);

comment on column public.households.timezone is
  'Default timezone for household-level reporting (net worth, monthly closing). Individual members may have their own display timezone — see public.profiles.timezone.';
comment on column public.households.financial_month_start_day is
  'Day of the month the household''s financial month starts on; 1 = calendar month (the default).';

-- ---------------------------------------------------------------------------
-- household_members -> household_memberships
-- ---------------------------------------------------------------------------

alter table public.household_members rename to household_memberships;
alter index household_members_household_id_idx rename to household_memberships_household_id_idx;
alter index household_members_user_id_idx rename to household_memberships_user_id_idx;

-- Old role set was ('owner', 'member', 'viewer'). 'member' is renamed to
-- 'editor' (unchanged permissions, clearer name now that 'admin' exists
-- alongside it) before the constraint is replaced.
update public.household_memberships set role = 'editor' where role = 'member';

alter table public.household_memberships drop constraint household_members_role_check;
alter table public.household_memberships add constraint household_memberships_role_check
  check (role in ('owner', 'admin', 'editor', 'viewer'));

alter table public.household_memberships
  add column status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  -- Distinct from created_at: created_at is when the row was written;
  -- joined_at is when membership actually took effect (relevant once an
  -- 'invited' row can later transition to 'active' on acceptance — no
  -- invitation flow exists yet, so today the two are always equal).
  add column joined_at timestamptz not null default now();

comment on table public.household_memberships is
  'Maps an auth.users identity to a household with a role (owner/admin/editor/viewer) and a status (active/invited/suspended). See docs/security-model.md §3.';
comment on column public.household_memberships.status is
  'active: has access. invited: not yet accepted (no invitation flow exists yet — reserved for one). suspended: access revoked without removing history.';
comment on column public.household_memberships.joined_at is
  'When membership took effect, distinct from created_at (when the row was written) — matters once invited rows can be accepted later.';

-- At most one household a user owns — the constraint "Create household and
-- owner membership atomically" and "Prevent duplicate household creation on
-- retry" lean on: get_or_create_household() below treats hitting this as
-- "the household already exists," not an error, making retries idempotent.
-- Does not limit how many households a user can belong to as admin/editor/
-- viewer, so future non-owner multi-household membership stays possible.
create unique index household_memberships_one_owner_per_user
  on public.household_memberships (user_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- RLS helper functions — updated for the renamed table and to exclude
-- non-active memberships (an invited-but-not-accepted or suspended row
-- must not grant access).
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.household_memberships
    where household_id = target_household_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.household_role(target_household_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.household_memberships
  where household_id = target_household_id
    and user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.create_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    insert into public.household_memberships (household_id, user_id, role, status)
    values (new.id, new.created_by, 'owner', 'active');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_or_create_household: the onboarding entry point.
--
-- SECURITY INVOKER (the default — stated explicitly): runs as the calling
-- user, so the normal "authenticated users can create a household" RLS
-- policy below applies to its insert exactly as if the client had done it
-- directly. Idempotent by construction: a PL/pgSQL block with an EXCEPTION
-- clause runs inside an implicit savepoint, so if the household insert's
-- own create_owner_membership trigger collides with
-- household_memberships_one_owner_per_user (this user already owns a
-- household), the entire insert — the new household row included — rolls
-- back to before the statement, and the caller's existing household is
-- returned instead. Retrying this call (client timeout, double-click,
-- network retry) can therefore never create a second household.
-- ---------------------------------------------------------------------------

create function public.get_or_create_household(
  p_name text,
  p_base_currency_code text,
  p_timezone text,
  p_financial_month_start_day smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_household_id uuid;
begin
  -- Generated up front rather than captured via `returning ... into`: a
  -- RETURNING clause is subject to the table's SELECT policy
  -- (is_household_member(id)), which this row only satisfies once
  -- create_owner_membership's cascading insert has fired — RETURNING
  -- evaluates against a snapshot that doesn't yet see that same-statement
  -- trigger effect, so it fails RLS even though the insert itself succeeds.
  -- Knowing the id up front sidesteps needing RETURNING at all.
  v_household_id := gen_random_uuid();

  insert into public.households (id, name, base_currency_code, timezone, financial_month_start_day, created_by)
  values (v_household_id, p_name, p_base_currency_code, p_timezone, p_financial_month_start_day, auth.uid());

  return v_household_id;
exception
  when unique_violation then
    select household_id into v_household_id
    from public.household_memberships
    where user_id = auth.uid()
      and role = 'owner'
    limit 1;

    if v_household_id is null then
      raise;
    end if;

    return v_household_id;
end;
$$;

comment on function public.get_or_create_household(text, text, text, smallint) is
  'Onboarding entry point: creates a household owned by the caller, or returns their existing one if they already own one. Idempotent — safe to retry.';

-- ---------------------------------------------------------------------------
-- RLS policies — households
--
-- "owners can update their household" becomes "owners and admins can" —
-- "only authorized roles can update settings" means owner and admin (see
-- canManageHousehold in src/lib/households/permissions.ts); editor/viewer
-- cannot change household settings.
-- ---------------------------------------------------------------------------

drop policy "owners can update their household" on public.households;
create policy "owners and admins can update their household" on public.households
  for update
  using (public.household_role(id) in ('owner', 'admin'))
  with check (public.household_role(id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- RLS policies — household_memberships
--
-- Insert/update/delete widen from owner-only to owner-or-admin. Critically,
-- this check runs against the household_id *submitted in the row being
-- written*, not merely "is the caller a member of some household" — so a
-- user who is admin of household A cannot use that to write a membership
-- row for unrelated household B (see docs/security-model.md §6, IDOR).
-- Users still cannot add themselves to an arbitrary household: the insert
-- check requires the *inserter* to already be owner/admin of the target
-- household_id, which nobody is for a household they don't belong to yet.
-- ---------------------------------------------------------------------------

drop policy "owners can add household members" on public.household_memberships;
create policy "owners and admins can add household members" on public.household_memberships
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin'));

drop policy "owners can update household members" on public.household_memberships;
create policy "owners and admins can update household members" on public.household_memberships
  for update
  using (public.household_role(household_id) in ('owner', 'admin'))
  with check (public.household_role(household_id) in ('owner', 'admin'));

drop policy "owners can remove household members" on public.household_memberships;
create policy "owners and admins can remove household members" on public.household_memberships
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- net_worth_snapshots: 'member' renamed to 'editor' in the role set above.
-- ---------------------------------------------------------------------------

drop policy "owners and members can record a net worth snapshot" on public.net_worth_snapshots;
create policy "owners, admins, and editors can record a net worth snapshot" on public.net_worth_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.get_or_create_household(text, text, text, smallint) to authenticated;
