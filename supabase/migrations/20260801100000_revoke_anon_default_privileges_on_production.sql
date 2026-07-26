-- Discovered live during the first production deployment (this project):
-- a fresh Supabase Cloud project grants `anon` SELECT/INSERT/UPDATE/DELETE
-- on every table by default (a platform-level default-privileges setup,
-- entirely separate from anything this repo's migrations explicitly
-- grant — every migration in this repo only ever grants to
-- `authenticated, service_role`, never `anon`). Local's CLI-managed
-- Postgres does not exhibit this default, which is why
-- 20260731100000_revoke_unused_anon_authenticated_privileges.sql (written
-- and verified against local only) didn't already cover it — that
-- migration revoked TRUNCATE/TRIGGER/REFERENCES, the only excess grants
-- observed locally at the time.
--
-- Row Level Security was confirmed still the effective boundary before
-- this migration was written (an anonymous SELECT against `households`
-- returned an empty array, not real data, and an anonymous INSERT was
-- rejected outright) — this is a defense-in-depth hardening closing the
-- gap between what's *possible to attempt* and what RLS *happens to
-- deny*, matching the same "anon holds zero grants, full stop" posture
-- already verified and documented for local/CI in
-- docs/production-supabase.md §4 and §9, not a response to an active
-- exploit.
--
-- `authenticated` is deliberately left untouched here: unlike `anon`
-- (which this app never grants any table privilege to, in any
-- migration), `authenticated` legitimately needs real per-table CRUD —
-- revoking broadly and trying to re-grant each table's exact intended
-- shape from scratch in one migration is exactly the kind of invasive,
-- error-prone change §12 of docs/production-supabase.md's own "migration
-- forward-fix approach" warns against attempting under time pressure.
-- Any excess `authenticated` ceiling-grants (e.g. UPDATE/DELETE on an
-- append-only table that defines no corresponding RLS policy for that
-- command) are covered by RLS's own default-deny-when-no-policy-matches
-- behavior — verified live via the manual isolation test run immediately
-- after this migration, see docs/production-supabase.md.
revoke select, insert, update, delete on all tables in schema public from anon;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;
