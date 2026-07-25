-- PROMPT 47 performance audit: bulk volume seed data.
-- Creates one dedicated household and populates it at the volumes named in the prompt:
-- thousands of transactions, hundreds of accounts/assets, years of daily staking snapshots,
-- years of SIP contributions, hundreds of valuation snapshots, thousands of activity events.
begin;

do $$
declare
  v_household_id uuid := '99999999-9999-4999-8999-999999999999';
  v_person_id uuid;
  v_category_id uuid;
  v_institution_id uuid;
  v_account_ids uuid[];
  v_investment_account_id uuid;
  v_holding_ids uuid[];
  v_asset_ids uuid[];
  v_sip_holding_ids uuid[];
  v_staking_position_ids uuid[];
  v_acc_id uuid;
  v_holding_id uuid;
  v_i int;
  v_j int;
begin
  -- clean slate if re-run
  delete from households where id = v_household_id;

  insert into households (id, name, base_currency_code, timezone)
  values (v_household_id, 'Perf Audit Household', 'INR', 'Asia/Kolkata');

  insert into people (id, household_id, display_name, relationship_type)
  values (gen_random_uuid(), v_household_id, 'Perf Owner', 'self')
  returning id into v_person_id;

  insert into institutions (id, household_id, name, institution_type)
  values (gen_random_uuid(), v_household_id, 'Perf Bank', 'bank')
  returning id into v_institution_id;

  -- a system-default category already exists per household via seed_default_transaction_categories()
  select id into v_category_id from transaction_categories where household_id = v_household_id limit 1;

  -- 150 financial accounts (hundreds of accounts)
  for v_i in 1..150 loop
    insert into financial_accounts (household_id, name, account_type, institution_id, owner_person_id, currency_code, opening_balance_minor_units)
    values (v_household_id, 'Perf Account ' || v_i, 'savings', v_institution_id, v_person_id, 'INR', 10000000)
    returning id into v_acc_id;
    v_account_ids := array_append(v_account_ids, v_acc_id);
  end loop;

  -- 5000 transactions spread across 3 years and the 150 accounts
  insert into transactions (household_id, kind, amount_minor_units, currency_code, transaction_date, account_id, category_id, counterparty, description, status)
  select
    v_household_id,
    case when g % 5 = 0 then 'income' else 'expense' end,
    (100000 + (g % 500) * 137)::bigint,
    'INR',
    (date '2023-07-25' + ((g * 5) % 1095))::date,
    v_account_ids[1 + (g % array_length(v_account_ids,1))],
    v_category_id,
    'Perf Merchant ' || (g % 200),
    'Perf seed transaction ' || g,
    'cleared'
  from generate_series(1, 5000) as g;

  -- 150 physical assets (hundreds of assets)
  for v_i in 1..150 loop
    insert into assets (household_id, name, asset_group, category, owner_person_id, acquisition_type, acquisition_date, acquisition_value_minor_units, currency_code, liquidity_classification)
    values (v_household_id, 'Perf Asset ' || v_i, 'movable', 'jewellery', v_person_id, 'purchased', date '2020-01-01', 5000000, 'INR', 'illiquid');
  end loop;

  -- investment accounts + holdings (for valuation snapshots, SIPs, staking)
  insert into investment_accounts (household_id, name, institution_id, owner_person_id, currency_code)
  values (v_household_id, 'Perf Investment Account', v_institution_id, v_person_id, 'INR')
  returning id into v_investment_account_id;

  -- 20 investment assets -> 20 holdings, used for valuation snapshots + SIPs
  for v_i in 1..20 loop
    declare
      v_inv_asset_id uuid;
    begin
      insert into investment_assets (household_id, name, asset_class, currency_code)
      values (v_household_id, 'Perf Fund ' || v_i, 'mutual_fund', 'INR')
      returning id into v_inv_asset_id;

      insert into investment_holdings (household_id, investment_account_id, investment_asset_id)
      values (v_household_id, v_investment_account_id, v_inv_asset_id)
      returning id into v_holding_id;

      v_holding_ids := array_append(v_holding_ids, v_holding_id);
    end;
  end loop;

  -- hundreds of valuation snapshots: 15 monthly snapshots x 20 holdings = 300
  insert into investment_valuation_snapshots (household_id, investment_holding_id, as_of_date, value_minor_units, currency_code, source)
  select
    v_household_id,
    h,
    (date '2025-01-01' + (m * 30))::date,
    (1000000 + m * 15000)::bigint,
    'INR',
    'manual'
  from unnest(v_holding_ids) as h
  cross join generate_series(0, 14) as m;

  -- years of SIP contributions: 10 SIPs x 36 monthly contribution transactions = 360
  for v_i in 1..10 loop
    declare
      v_sip_id uuid;
      v_sip_holding uuid := v_holding_ids[1 + (v_i % array_length(v_holding_ids,1))];
    begin
      insert into investment_sips (household_id, name, investment_holding_id, contribution_amount_minor_units, currency_code, frequency, start_date, contribution_account_id, status)
      values (v_household_id, 'Perf SIP ' || v_i, v_sip_holding, 500000, 'INR', 'monthly', date '2023-01-01', v_account_ids[1], 'active')
      returning id into v_sip_id;

      insert into investment_transactions (household_id, investment_holding_id, transaction_type, transaction_date, amount_minor_units, currency_code, quantity, price_per_unit, status, investment_sip_id)
      select
        v_household_id,
        v_sip_holding,
        'contribution',
        (date '2023-01-01' + (m * interval '1 month'))::date,
        500000,
        'INR',
        (5000 + m * 10)::numeric,
        100::numeric,
        'cleared',
        v_sip_id
      from generate_series(0, 35) as m;
    end;
  end loop;

  -- years of daily staking snapshots: 5 positions x ~3 years (1095 days) = 5475
  for v_i in 1..5 loop
    declare
      v_staking_holding_id uuid;
      v_inv_asset_id uuid;
      v_position_id uuid;
    begin
      insert into investment_assets (household_id, name, asset_class, currency_code)
      values (v_household_id, 'Perf Staking Asset ' || v_i, 'staking', 'INR')
      returning id into v_inv_asset_id;

      insert into investment_holdings (household_id, investment_account_id, investment_asset_id)
      values (v_household_id, v_investment_account_id, v_inv_asset_id)
      returning id into v_staking_holding_id;

      insert into staking_positions (household_id, name, investment_holding_id, opening_principal_minor_units, opening_date, currency_code, expected_daily_rate, status)
      values (v_household_id, 'Perf Staking Position ' || v_i, v_staking_holding_id, 10000000, date '2023-01-01', 'INR', 0.0003, 'active')
      returning id into v_position_id;

      insert into staking_daily_snapshots (household_id, staking_position_id, snapshot_date, opening_value_minor_units, reward_minor_units, closing_value_minor_units, currency_code)
      select
        v_household_id,
        v_position_id,
        (date '2023-01-01' + d)::date,
        (10000000 + (d-1) * 3000)::bigint,
        3000::bigint,
        (10000000 + d * 3000)::bigint,
        'INR'
      from generate_series(1, 1095) as d;
    end;
  end loop;

  -- thousands of activity events
  insert into activity_events (household_id, event_type, entity_type, entity_id, metadata)
  select
    v_household_id,
    (array['transaction.created','transaction.updated','account.created','investment.contribution','document.uploaded'])[1 + (g % 5)],
    'transaction',
    v_account_ids[1 + (g % array_length(v_account_ids,1))],
    '{}'::jsonb
  from generate_series(1, 5000) as g;

end $$;

commit;
