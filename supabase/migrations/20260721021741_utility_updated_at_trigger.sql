-- Reusable trigger utility: keeps `updated_at` current on every row update.
--
-- Usage on any mutable table (skip on append-only/historical tables, which
-- deliberately have no `updated_at` — see docs/money-calculation-rules.md §3):
--
--   create trigger set_updated_at
--     before update on public.<table_name>
--     for each row
--     execute function public.set_updated_at();
--
-- Immutable migrations: once a migration has been applied to any shared
-- environment (staging/prod), it is never edited — a correction is a new
-- migration. See docs/local-supabase.md "Production migration rules".

-- pgcrypto backs gen_random_uuid()/crypt() used by primary key defaults and
-- local seed fixtures. Usually already enabled by the Supabase platform
-- bootstrap — declared explicitly here so this migration doesn't depend on
-- that assumption.
create extension if not exists pgcrypto with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger utility: sets NEW.updated_at = now() on every UPDATE. Attach to any mutable table with an updated_at column.';
