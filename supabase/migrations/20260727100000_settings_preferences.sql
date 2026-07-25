-- Settings and privacy controls (PROMPT 40).
--
-- 1. profiles: five new personal preference columns backing the Settings
--    page's Privacy section. All boolean/nullable-integer, all
--    display/behavior toggles only — none of them touch a stored financial
--    value (see docs/money-calculation-rules.md §1).
-- 2. households: two new default-goal-assumption columns, editable by
--    owner/admin only (same RLS as every other household column — see
--    supabase/migrations/20260721051051_household_memberships.sql's "owners
--    and admins can update their household"). These only ever prefill a
--    *new* goal's own annual_inflation_rate/annual_expected_return fields
--    (src/features/goals/goal-dialog.tsx) — an already-created goal's
--    stored assumption is never retroactively changed by editing this
--    household default, the same "never rewrite a stored assumption"
--    reasoning goals.annual_inflation_rate itself already followed (PROMPT
--    30: "never assume investment returns are guaranteed").
-- 3. A private 'avatars' Storage bucket + RLS, keyed on the user's own id
--    as the path's first segment (never household-scoped — an avatar is
--    personal, not shared financial data) — same "private bucket + signed
--    URL only" convention as the 'documents' bucket (see
--    supabase/migrations/20260721120000_expense_management.sql).

alter table public.profiles
  add column privacy_default_concealed boolean not null default false,
  add column privacy_conceal_dashboard_on_launch boolean not null default false,
  add column privacy_screenshot_sensitive_mode boolean not null default false,
  add column privacy_inactivity_timeout_minutes integer
    check (privacy_inactivity_timeout_minutes is null or privacy_inactivity_timeout_minutes > 0),
  add column notifications_include_amounts boolean not null default true;

comment on column public.profiles.privacy_default_concealed is
  'Whether a brand-new session (no privacy cookie yet — e.g. first visit on a new device) should start with balances concealed. Distinct from the live "hide balances" toggle (src/components/shared/privacy-provider.tsx), which is the actual per-session state once set.';
comment on column public.profiles.privacy_conceal_dashboard_on_launch is
  'Forces the dashboard specifically to render concealed on first load of a session, regardless of the privacy cookie''s last value — extra caution for the single highest-density-of-numbers page. The user can still reveal it via the normal toggle for the rest of that session.';
comment on column public.profiles.privacy_screenshot_sensitive_mode is
  'When true, the app blurs its content whenever the browser tab loses focus/visibility (Page Visibility API) — a shoulder-surfing/screen-recording deterrent. This is honestly NOT OS-level screenshot prevention (no web API can do that); the UI must never claim otherwise.';
comment on column public.profiles.privacy_inactivity_timeout_minutes is
  'PLACEHOLDER (PROMPT 40): persisted but not yet enforced anywhere — no session-timeout/auto-logout mechanism exists yet. Null means "off". Settings UI must say so plainly rather than implying it already works.';
comment on column public.profiles.notifications_include_amounts is
  'Whether a future notification (email/push — no send path exists yet) may include a real amount versus a redacted placeholder. Stored ahead of that infrastructure existing, same "provision the column, no such generator exists yet" convention as staking_daily_snapshots.manually_confirmed.';

alter table public.households
  add column default_goal_annual_inflation_rate numeric not null default 0.06
    check (default_goal_annual_inflation_rate > -1 and default_goal_annual_inflation_rate <= 10),
  add column default_goal_annual_expected_return numeric not null default 0
    check (default_goal_annual_expected_return > -1 and default_goal_annual_expected_return <= 10);

comment on column public.households.default_goal_annual_inflation_rate is
  'Prefills a new goal''s own annual_inflation_rate (goals table) — editable per household in Settings. Never retroactively changes an already-created goal''s stored assumption.';
comment on column public.households.default_goal_annual_expected_return is
  'Prefills a new goal''s own annual_expected_return — same "prefill only, never retroactive" rule as default_goal_annual_inflation_rate.';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

create policy "users can view their own avatar" on storage.objects
  for select
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

create policy "users can upload their own avatar" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

create policy "users can update their own avatar" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

create policy "users can delete their own avatar" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );
