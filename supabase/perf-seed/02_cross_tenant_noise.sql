-- Cross-tenant noise: inflates the transactions table to realistic multi-household
-- SaaS scale so the query planner's index-vs-seqscan choice is meaningful, not
-- trivially fast either way on a tiny table.
begin;

do $$
declare
  v_h uuid;
  v_acc uuid;
  v_i int;
begin
  for v_i in 1..60 loop
    v_h := gen_random_uuid();
    insert into households (id, name, base_currency_code, timezone)
    values (v_h, 'Noise Household ' || v_i, 'INR', 'Asia/Kolkata');

    insert into financial_accounts (household_id, name, account_type, currency_code)
    values (v_h, 'Noise Account', 'savings', 'INR')
    returning id into v_acc;

    insert into transactions (household_id, kind, amount_minor_units, currency_code, transaction_date, account_id, status)
    select
      v_h,
      case when g % 5 = 0 then 'income' else 'expense' end,
      (100000 + (g % 500) * 137)::bigint,
      'INR',
      (date '2023-07-25' + (g % 1095))::date,
      v_acc,
      'cleared'
    from generate_series(1, 2000) as g;
  end loop;
end $$;

commit;
