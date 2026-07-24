-- recurring_rules.related_person_id: which household member this
-- recurring commitment is attributed to (e.g. "Mom's insurance premium"),
-- mirroring transactions.related_person_id and every other financial
-- template in this app (income_sources.person_id, transactions itself).
-- Nullable — a household-level commitment need not name one person.

alter table public.recurring_rules
  add column related_person_id uuid references public.people (id) on delete set null;

comment on column public.recurring_rules.related_person_id is
  'The person this recurring commitment is attributed to, if any — copied onto each generated occurrence''s transactions.related_person_id. Nullable.';

create index recurring_rules_related_person_id_idx on public.recurring_rules (related_person_id);

create or replace function public.check_recurring_rule_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_transfer_household uuid;
  v_transfer_currency text;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'recurring_rules.account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'recurring_rules.currency_code must match account_id''s currency';
  end if;

  if new.transfer_account_id is not null then
    select household_id, currency_code into v_transfer_household, v_transfer_currency
    from public.financial_accounts where id = new.transfer_account_id;

    if v_transfer_household is null or v_transfer_household <> new.household_id then
      raise exception 'recurring_rules.transfer_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_transfer_currency then
      raise exception 'recurring_rules.currency_code must match transfer_account_id''s currency (v1: same-currency transfers only)';
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'recurring_rules.category_id must belong to the same household';
  end if;

  if new.related_person_id is not null and not exists (
    select 1 from public.people
    where id = new.related_person_id and household_id = new.household_id
  ) then
    raise exception 'recurring_rules.related_person_id must belong to the same household';
  end if;

  return new;
end;
$$;
