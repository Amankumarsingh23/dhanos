-- Global search (PROMPT 39): trigram indexes backing partial-name ILIKE
-- search across every searchable entity, so "Partial names work" and
-- "Search remains performant with seed volume" hold at the database layer,
-- not just in application code. No new table and no RLS change — search
-- is read-only and runs as plain household-scoped SELECTs (the same RLS
-- policies each entity's own list/detail page already relies on), so
-- "Another household never appears" and "Permissions matching direct
-- pages" are satisfied by construction, the same way every other query in
-- this app is (see docs/data-access-patterns.md §2).
--
-- pg_trgm's GIN opclass (gin_trgm_ops) accelerates `ILIKE '%term%'` on the
-- indexed column directly — the same operator src/features/*/queries.ts's
-- existing "search by name" filters already use (`.ilike("name", ...)`),
-- so no query-shape change was needed anywhere else in the codebase to
-- benefit from these indexes.
--
-- Deliberately excludes any binary document content (PROMPT 39: "no
-- binary-document content indexing yet") — `documents` is indexed on its
-- own display_name/original_filename metadata columns only, never the
-- stored file bytes.

create extension if not exists pg_trgm with schema extensions;

-- Accounts
create index financial_accounts_name_trgm_idx
  on public.financial_accounts using gin (name gin_trgm_ops);
create index financial_accounts_masked_identifier_trgm_idx
  on public.financial_accounts using gin (masked_identifier gin_trgm_ops);

-- Transactions
create index transactions_description_trgm_idx
  on public.transactions using gin (description gin_trgm_ops);
create index transactions_counterparty_trgm_idx
  on public.transactions using gin (counterparty gin_trgm_ops);

-- Categories
create index transaction_categories_name_trgm_idx
  on public.transaction_categories using gin (name gin_trgm_ops);

-- People
create index people_display_name_trgm_idx
  on public.people using gin (display_name gin_trgm_ops);

-- Institutions
create index institutions_name_trgm_idx
  on public.institutions using gin (name gin_trgm_ops);

-- Investments (assets — the searchable "what is it" identity behind a holding)
create index investment_assets_name_trgm_idx
  on public.investment_assets using gin (name gin_trgm_ops);
create index investment_assets_symbol_trgm_idx
  on public.investment_assets using gin (symbol_or_identifier gin_trgm_ops);

-- SIPs
create index investment_sips_name_trgm_idx
  on public.investment_sips using gin (name gin_trgm_ops);
create index investment_sips_provider_trgm_idx
  on public.investment_sips using gin (provider gin_trgm_ops);

-- Staking positions
create index staking_positions_name_trgm_idx
  on public.staking_positions using gin (name gin_trgm_ops);

-- Loans
create index loans_name_trgm_idx
  on public.loans using gin (name gin_trgm_ops);

-- Borrowers (lending / receivables)
create index lendings_name_trgm_idx
  on public.lendings using gin (name gin_trgm_ops);

-- Insurance policies — masked_policy_number stays exactly as entered
-- (already-masked, e.g. "XXXX-4821") in both the index and any search
-- result; no unmasked policy number exists anywhere in this schema to leak.
create index insurance_policies_name_trgm_idx
  on public.insurance_policies using gin (name gin_trgm_ops);
create index insurance_policies_masked_policy_number_trgm_idx
  on public.insurance_policies using gin (masked_policy_number gin_trgm_ops);

-- Assets
create index assets_name_trgm_idx
  on public.assets using gin (name gin_trgm_ops);

-- Liabilities
create index liabilities_name_trgm_idx
  on public.liabilities using gin (name gin_trgm_ops);

-- Goals
create index goals_name_trgm_idx
  on public.goals using gin (name gin_trgm_ops);

-- Documents — metadata only (filename/display name), never the stored
-- file content, per PROMPT 39's explicit scope limit.
create index documents_display_name_trgm_idx
  on public.documents using gin (display_name gin_trgm_ops);
create index documents_original_filename_trgm_idx
  on public.documents using gin (original_filename gin_trgm_ops);

-- Decisions (financial decision journal)
create index decision_journal_entries_title_trgm_idx
  on public.decision_journal_entries using gin (title gin_trgm_ops);
