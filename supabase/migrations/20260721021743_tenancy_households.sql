-- Tenancy foundation: households and household_members.
--
-- Household is the tenant boundary all financial data hangs off (see
-- docs/financial-domain-model.md §1, docs/security-model.md §3). Every
-- future household-scoped table follows the same pattern established here:
-- uuid pk, household_id fk (indexed, on delete cascade), RLS enabled from
-- creation, no table readable without a household membership check.

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  -- Default/base currency for household-level rollups (net worth, reports).
  -- Individual accounts may still hold other currencies — see
  -- docs/money-calculation-rules.md §1.
  base_currency_code text not null default 'INR' check (base_currency_code ~ '^[A-Z]{3}$'),
  -- Nullable + ON DELETE SET NULL: if the creating user's auth account is
  -- later deleted, the household and its data persist for any remaining
  -- members — only the "created by" attribution is lost.
  created_by uuid references auth.users (id) on delete set null,
  -- Archival, not deletion: a household is never hard-deleted while it may
  -- still have financial history hanging off it (see
  -- docs/money-calculation-rules.md §3). Optional per the "deleted_at"
  -- convention.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.households is
  'The tenant/workspace boundary. All household-scoped tables reference this via household_id.';

create index households_created_by_idx on public.households (created_by);

create trigger set_updated_at
  before update on public.households
  for each row
  execute function public.set_updated_at();

alter table public.households enable row level security;

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'viewer')),
  -- Date-only concept — not a timestamp. Optional; useful for future
  -- emergency-fund/insurance planning features.
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id)
);

comment on table public.household_members is
  'Maps an auth.users identity to a household with a role (owner/member/viewer). See docs/security-model.md §3.';

create index household_members_household_id_idx on public.household_members (household_id);
create index household_members_user_id_idx on public.household_members (user_id);

create trigger set_updated_at
  before update on public.household_members
  for each row
  execute function public.set_updated_at();

alter table public.household_members enable row level security;

-- ---------------------------------------------------------------------------
-- RLS helper functions
--
-- SECURITY DEFINER + a locked-down search_path: these run with the
-- function owner's privileges (bypassing RLS on their internal query
-- against household_members), which is what avoids infinite recursion when
-- household_members' own policies call is_household_member(). This is the
-- standard, documented pattern for self-referential RLS checks.
-- ---------------------------------------------------------------------------

create function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

comment on function public.is_household_member(uuid) is
  'True if the current user (auth.uid()) belongs to the given household. Used by RLS policies across every household-scoped table.';

create function public.household_role(target_household_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.household_members
  where household_id = target_household_id
    and user_id = auth.uid();
$$;

comment on function public.household_role(uuid) is
  'Returns the current user''s role in the given household, or null if not a member.';

-- Bootstraps the first membership row (as owner) when a household is
-- created, so household creation doesn't hit a chicken-and-egg problem with
-- the household_members insert policy below (which requires an existing
-- owner). SECURITY DEFINER bypasses RLS for this one, narrowly-scoped insert.
create function public.create_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    insert into public.household_members (household_id, user_id, role)
    values (new.id, new.created_by, 'owner');
  end if;
  return new;
end;
$$;

comment on function public.create_owner_membership() is
  'Trigger: after a household is created, makes its creator the owner member.';

create trigger create_owner_membership
  after insert on public.households
  for each row
  execute function public.create_owner_membership();

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

create policy "members can view their household" on public.households
  for select
  using (public.is_household_member(id));

create policy "authenticated users can create a household" on public.households
  for insert
  with check (created_by = auth.uid());

create policy "owners can update their household" on public.households
  for update
  using (public.household_role(id) = 'owner')
  with check (public.household_role(id) = 'owner');

-- No delete policy: households are archived via deleted_at, never hard-deleted.

create policy "members can view their household's members" on public.household_members
  for select
  using (public.is_household_member(household_id));

create policy "owners can add household members" on public.household_members
  for insert
  with check (public.household_role(household_id) = 'owner');

create policy "owners can update household members" on public.household_members
  for update
  using (public.household_role(household_id) = 'owner')
  with check (public.household_role(household_id) = 'owner');

create policy "owners can remove household members" on public.household_members
  for delete
  using (public.household_role(household_id) = 'owner');

create policy "members can remove themselves" on public.household_members
  for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
--
-- Table-level grants are the ceiling; RLS policies above narrow it further
-- per row. Nothing is granted to `anon` — these tables require a session.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.households to authenticated, service_role;
grant select, insert, update, delete on public.household_members to authenticated, service_role;

grant execute on function public.is_household_member(uuid) to authenticated, service_role;
grant execute on function public.household_role(uuid) to authenticated, service_role;
