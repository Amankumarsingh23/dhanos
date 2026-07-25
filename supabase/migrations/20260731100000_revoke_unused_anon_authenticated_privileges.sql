-- PROMPT 53 — production readiness: least-privilege cleanup, following up
-- on docs/security-review.md §4 Finding #7 ("`anon` Postgres role holds
-- TRUNCATE/TRIGGER/REFERENCES grants on every public table — Supabase's
-- own default schema-bootstrapping grant, not something introduced by
-- application code. Not reachable through the product's actual API
-- surface — PostgREST never translates an HTTP request into TRUNCATE,
-- TRIGGER, or REFERENCES — but broader than least-privilege.
-- Recommendation: REVOKE ... low priority given it's not reachable today,
-- but cheap to do."). Re-auditing live for PROMPT 53 found `authenticated`
-- (the role every real signed-in user's request runs as) carries the
-- exact same three unused grants on every table — a larger blast radius
-- than the `anon`-only finding originally called out, so this revokes
-- from both roles.
--
-- Every actual read/write this app performs goes through explicit
-- per-table `grant select/insert/update/delete` statements in each
-- table's own migration (see e.g. institutions.sql) — TRUNCATE/TRIGGER/
-- REFERENCES are never among them, and PostgREST has no HTTP verb that
-- issues any of the three, so this has zero functional impact on the
-- running application; it only removes standing capability nothing ever
-- exercises.
--
-- The ALTER DEFAULT PRIVILEGES statement prevents a *future* table
-- (created by the `postgres` role, same as every migration in this repo)
-- from silently reintroducing the same three grants — without it, this
-- migration would only be a one-time cleanup rather than a durable
-- posture change.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
