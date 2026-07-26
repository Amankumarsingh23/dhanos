-- Found live: 20260721070000_institutions_contact_fields.sql's
-- support_email check constraint allows NULL but not an empty string —
-- `support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'`
-- rejects `''`, which is exactly what an untouched optional form field
-- submits (react-hook-form/HTML forms send `""`, never `null`/`undefined`,
-- for a blank text input). The app layer had the identical bug in
-- src/lib/validation/institutions.ts (fixed alongside this migration) —
-- both layers validate the same rule independently by design (defense in
-- depth), so both needed the same fix: treat an empty string the same as
-- absent, not as "provided but invalid".
--
-- This migration was already applied to production before the bug was
-- found (see docs/production-supabase.md's "never edit an already-applied
-- migration" rule) — a corrective migration, not an edit to the original.
alter table public.institutions
  drop constraint institutions_support_email_check;

alter table public.institutions
  add constraint institutions_support_email_check check (
    support_email is null
    or support_email = ''
    or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );
