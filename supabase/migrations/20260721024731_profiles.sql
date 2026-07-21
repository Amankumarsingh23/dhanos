-- Profiles: one row per auth.users identity, holding display/preference
-- data that isn't part of Supabase Auth itself (see docs/security-model.md
-- §2 and the auth feature phase in docs/implementation-status.md).
--
-- Distinct from households/household_members (tenancy, §3 of
-- database-plan.md): a profile is per-person and exists independently of
-- which household(s) a user belongs to.

create table public.profiles (
  -- Same id as auth.users — a profile is provisioned automatically for
  -- every new user (see handle_new_user trigger below), never created
  -- ad hoc by application code.
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- Path within a private Supabase Storage bucket, not a public URL —
  -- resolve to a short-lived signed URL at read time (see
  -- src/lib/storage/index.ts, docs/security-model.md §5). No avatar
  -- upload UI exists yet; the column is provisioned ahead of it.
  avatar_path text,
  -- IANA timezone name, e.g. "Asia/Kolkata".
  timezone text not null default 'Asia/Kolkata' check (char_length(btrim(timezone)) > 0),
  -- BCP 47 locale tag, e.g. "en-IN".
  locale text not null default 'en-IN' check (char_length(btrim(locale)) > 0),
  -- Initial default is INR per product scope, but this is a per-user
  -- preference, not a hardcoded constant — always configurable.
  default_currency_code text not null default 'INR' check (default_currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users identity: display name, avatar, and locale/currency preferences. Provisioned by handle_new_user, never inserted directly by application code.';

create trigger set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Auto-provisioning
--
-- SECURITY DEFINER + locked-down search_path (same pattern as
-- create_owner_membership in the tenancy migration): bypasses RLS for this
-- one narrowly-scoped insert so every new auth.users row gets a matching
-- profile row, with no chicken-and-egg RLS problem and no window where a
-- signed-in user has no profile.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger: after a new auth.users row is created, provisions its matching profiles row.';

create trigger handle_new_user
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS policies
--
-- Select/update only, scoped to the caller's own row. Deliberately no
-- insert policy: profiles are provisioned exclusively by handle_new_user
-- (SECURITY DEFINER, bypasses RLS) — without an insert policy, no grant
-- below can let application code create a stray profile row out of step
-- with auth.users. No delete policy either: a profile is removed only via
-- the auth.users cascade when the account itself is deleted.
-- ---------------------------------------------------------------------------

create policy "users can view their own profile" on public.profiles
  for select
  using (id = auth.uid());

create policy "users can update their own profile" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
--
-- No insert/delete grants — see the RLS policy note above for why.
-- ---------------------------------------------------------------------------

grant select, update on public.profiles to authenticated, service_role;
