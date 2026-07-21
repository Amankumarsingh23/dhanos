-- Institutions: replaces the single free-text support_info column with
-- structured contact fields (support_phone, support_email), adds
-- platform_name (the app/portal name, when it differs from the
-- institution's own name — e.g. institution "HDFC Bank", platform_name
-- "HDFC MobileBanking"), and adds is_archived so an institution can be
-- archived rather than deleted once it may have linked accounts/loans/
-- policies/investments (see PROMPT 8, "linked-account count").
--
-- No production data exists yet (local dev only — see
-- docs/local-supabase.md), so this drops support_info outright rather than
-- attempting a lossy free-text-to-structured-fields migration.

alter table public.institutions
  drop column support_info;

alter table public.institutions
  add column platform_name text,
  add column support_phone text,
  add column support_email text check (
    support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  add column is_archived boolean not null default false;

comment on column public.institutions.platform_name is
  'The app/portal name a household actually uses day-to-day, when distinct from the institution''s own name (e.g. institution "HDFC Bank", platform_name "HDFC MobileBanking"). Nullable — most institutions don''t need this distinction.';
comment on column public.institutions.support_phone is
  'Free-text as entered (formatting varies by country) — normalized only at the application layer for duplicate detection, never rewritten here.';
comment on column public.institutions.support_email is
  'Loosely validated (not full RFC 5322) — good enough to catch typos without rejecting valid addresses the regex doesn''t anticipate.';
comment on column public.institutions.is_archived is
  'Archived, not deleted — an institution with linked accounts/loans/policies/investments must remain referenceable by its historical data. See docs/database-plan.md §1, "Soft delete".';

create index institutions_is_archived_idx on public.institutions (household_id, is_archived);
