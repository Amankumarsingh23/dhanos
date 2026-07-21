-- Local development seed data.
--
-- Runs automatically after migrations on every `supabase db reset` (see
-- docs/local-supabase.md). Local Postgres only — never run against a
-- linked remote/staging/production project.

-- Fixture user, inserted directly into auth.users the way Supabase's own
-- local-dev examples do. Login: demo@dhanos.local / password123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'demo@dhanos.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'demo@dhanos.local'),
  'email',
  now(),
  now(),
  now()
);

-- The handle_new_user trigger (see 20260721024731_profiles.sql) already
-- created a profiles row for the demo user with default preferences — just
-- fill in a display name for a nicer local-dev fixture.
update public.profiles
set full_name = 'Demo User'
where id = '11111111-1111-1111-1111-111111111111';

-- Fixture household. The create_owner_membership trigger (see
-- 20260721021743_tenancy_households.sql) automatically makes the demo user
-- its owner — no separate household_members insert needed.
insert into public.households (id, name, base_currency_code, created_by)
values (
  '22222222-2222-2222-2222-222222222222',
  'Demo Household',
  'INR',
  '11111111-1111-1111-1111-111111111111'
);

-- A starting net worth snapshot so a freshly reset database has something
-- to look at (e.g. from the dashboard placeholder once it reads real data).
insert into public.net_worth_snapshots (
  household_id, as_of_date, total_assets_minor_units, total_liabilities_minor_units, currency_code
) values (
  '22222222-2222-2222-2222-222222222222',
  current_date,
  50000000, -- ₹5,00,000.00 in paise
  10000000, -- ₹1,00,000.00 in paise
  'INR'
);
