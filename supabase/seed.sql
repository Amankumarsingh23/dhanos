-- Local development seed data.
--
-- Runs automatically after migrations on every `supabase db reset` (and
-- every `supabase db start` against a fresh Docker volume) — see
-- docs/local-supabase.md. Local Postgres only, and never run against a
-- linked remote/staging/production project: `supabase db push` (the only
-- command that touches a linked project) never executes this file at all
-- — seeding is exclusively a `db reset`/`db start` concept in the Supabase
-- CLI, so "production must never run seed automatically" (PROMPT 43) holds
-- by construction, not by a runtime guard added on top.
--
-- PROMPT 43 — realistic seed data. Everything below is fictional: no real
-- person, bank, wallet provider, employer, insurer, or account number.
-- "SBI-style"/"PhonePe-style" in the prompt describe a *flavor* (a large
-- nationalized-bank-style savings account; a UPI wallet), not the literal
-- real brand — using an invented name avoids even the appearance of
-- impersonating a real institution while keeping the same everyday feel.
-- Every masked identifier is a fabricated placeholder, never a real
-- account/card/policy number shape traceable to anyone. Every institution
-- website/email uses the `.example` TLD (RFC 2606, reserved for exactly
-- this — never a real, resolvable domain).
--
-- Reset-safe: this file only ever runs against a freshly recreated,
-- empty database (`db reset` drops and recreates it first), so there is
-- no "already seeded" state to guard against — every id below is a fixed
-- literal precisely so re-running `db reset` reproduces byte-identical
-- fixture ids, never a random drift between resets. Every *date*, however,
-- is computed relative to `current_date` at seed time (never a hardcoded
-- calendar date), so the data stays "recent" — last month's closing,
-- this month's salary, a SIP due today — no matter how much later than
-- today someone actually runs `db reset`.

-- Fixture user, inserted directly into auth.users the way Supabase's own
-- local-dev examples do. Login: demo@dhanos.local / password123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'demo@dhanos.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'demo@dhanos.local'),
  'email',
  now(),
  now(),
  now()
);

-- The handle_new_user trigger (see 20260721024731_profiles.sql) already
-- created a profiles row for the demo user with default preferences — just
-- fill in a display name for a nicer local-dev fixture.
update public.profiles
set full_name = 'Rohan Verma'
where id = '11111111-1111-1111-1111-111111111111';

-- Fixture household. The create_owner_membership trigger (see
-- 20260721051051_household_memberships.sql) automatically makes the demo
-- user its owner, and the seed_default_transaction_categories trigger (see
-- 20260721090000_transaction_engine.sql) automatically seeds the default
-- Income/Essential expenses/Lifestyle/Wealth building taxonomy — no
-- separate household_members or transaction_categories insert needed for
-- either.
insert into public.households (id, name, base_currency_code, created_by)
values (
  '22222222-2222-2222-2222-222222222222',
  'Verma Household',
  'INR',
  '11111111-1111-1111-1111-111111111111'
);

-- ---------------------------------------------------------------------------
-- Everything below is one household's worth of realistic fixture data
-- (PROMPT 43's "example profile"): Rohan Verma, a salaried professional in
-- his mid-20s, who interned for three months before joining full-time,
-- banks with one nationalized-style bank and one UPI wallet, runs a small
-- daily digital-gold SIP and a monthly mutual-fund SIP, holds a staking
-- position, is repaying an education loan, lent money to a friend, holds
-- two insurance policies (a detailed health policy and a term life
-- policy), inherited a plot of family land still going through mutation,
-- owns a laptop and a two-wheeler, is building an emergency fund, and is
-- saving toward a house and his sister's wedding.
--
-- One large DO block, not many small ones: every later section reads an
-- id a `returning ... into` from an earlier section already captured in a
-- local variable, and PL/pgSQL variables don't survive across separate
-- statements the way a temp table would — this keeps every cross-
-- reference a plain variable read, never a re-query by name.
-- ---------------------------------------------------------------------------

do $$
declare
  v_household_id uuid := '22222222-2222-2222-2222-222222222222';
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';

  -- People
  v_self_id uuid;
  v_sister_id uuid;
  v_mother_id uuid;
  v_friend_id uuid;

  -- Institutions
  v_bank_id uuid;
  v_wallet_provider_id uuid;
  v_gold_platform_inst_id uuid;
  v_mf_platform_inst_id uuid;
  v_staking_platform_inst_id uuid;
  v_edu_lender_id uuid;
  v_health_insurer_id uuid;
  v_life_insurer_id uuid;
  v_employer_id uuid;
  v_internship_employer_id uuid;
  v_college_id uuid;

  -- Accounts
  v_savings_id uuid;
  v_wallet_id uuid;
  v_cash_id uuid;

  -- Categories (looked up from the auto-seeded default taxonomy)
  v_cat_salary uuid;
  v_cat_internship uuid;
  v_cat_housing uuid;
  v_cat_groceries uuid;
  v_cat_utilities uuid;
  v_cat_transport uuid;
  v_cat_healthcare uuid;
  v_cat_insurance uuid;
  v_cat_debt_payment uuid;
  v_cat_eating_out uuid;
  v_cat_subscriptions uuid;
  v_cat_gadgets uuid;

  -- Income sources
  v_income_salary_id uuid;
  v_income_internship_id uuid;

  -- Investments
  v_inv_account_gold_id uuid;
  v_inv_account_mf_id uuid;
  v_inv_account_staking_id uuid;
  v_asset_gold_id uuid;
  v_asset_mf_id uuid;
  v_asset_eth_id uuid;
  v_holding_gold_id uuid;
  v_holding_mf_id uuid;
  v_holding_staking_id uuid;
  v_sip_gold_id uuid;
  v_sip_mf_id uuid;
  v_staking_position_id uuid;

  -- Debt
  v_loan_id uuid;
  v_lending_id uuid;
  v_liability_id uuid;

  -- Insurance
  v_health_policy_id uuid;
  v_life_policy_id uuid;

  -- Assets
  v_asset_land_id uuid;
  v_asset_laptop_id uuid;
  v_asset_vehicle_id uuid;

  -- Goals
  v_goal_house_id uuid;
  v_goal_sister_marriage_id uuid;

  -- Monthly closing
  v_closing_id uuid;

  -- Recurring rules, decisions (referenced later by money_drains/reminders)
  v_recurring_subscription_id uuid;
  v_decision_goal_review_id uuid;

  -- Loop/scratch variables
  v_m int;
  v_d int;
  v_month_start date;
  v_txn_id uuid;
  v_disbursement_txn_id uuid;
  v_nav numeric;
  v_qty numeric;
  v_running_value bigint;
  v_reward bigint;
  v_contribution bigint;
  v_closing_value bigint;
  v_snapshot_date date;
begin

  -- =========================================================================
  -- People
  -- =========================================================================
  insert into public.people (household_id, display_name, relationship_type, user_id, birth_date)
  values (v_household_id, 'Rohan Verma', 'self', v_user_id, current_date - interval '26 years')
  returning id into v_self_id;

  insert into public.people (household_id, display_name, relationship_type, birth_date)
  values (v_household_id, 'Ananya Verma', 'sibling', current_date - interval '22 years')
  returning id into v_sister_id;

  insert into public.people (household_id, display_name, relationship_type, birth_date)
  values (v_household_id, 'Sunita Verma', 'parent', current_date - interval '54 years')
  returning id into v_mother_id;

  insert into public.people (household_id, display_name, relationship_type, notes)
  values (v_household_id, 'Karan Mehta', 'borrower', 'College friend, borrowed for a medical emergency.')
  returning id into v_friend_id;

  -- =========================================================================
  -- Institutions (fictional; see file header — no real brand or account
  -- number appears anywhere below)
  -- =========================================================================
  insert into public.institutions (household_id, name, institution_type, website, support_phone, support_email)
  values (v_household_id, 'Vishwas National Bank', 'bank', 'https://www.vishwasnationalbank.example', '1800-XXX-1000', 'support@vishwasnationalbank.example')
  returning id into v_bank_id;

  insert into public.institutions (household_id, name, institution_type, website, support_email)
  values (v_household_id, 'SwiftPay Wallet', 'wallet', 'https://www.swiftpay.example', 'help@swiftpay.example')
  returning id into v_wallet_provider_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Bharat Digital Gold', 'investment_platform', 'https://www.bharatdigitalgold.example')
  returning id into v_gold_platform_inst_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Nova Growth Mutual Fund', 'investment_platform', 'https://www.novagrowthmf.example')
  returning id into v_mf_platform_inst_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'CoinStake Exchange', 'staking_platform', 'https://www.coinstake.example')
  returning id into v_staking_platform_inst_id;

  insert into public.institutions (household_id, name, institution_type, website, support_phone)
  values (v_household_id, 'Vidya Education Finance', 'lender', 'https://www.vidyaeducationfinance.example', '1800-XXX-2000')
  returning id into v_edu_lender_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Suraksha Health Assurance', 'insurer', 'https://www.surakshahealth.example')
  returning id into v_health_insurer_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Suraksha Life Assurance', 'insurer', 'https://www.surakshalife.example')
  returning id into v_life_insurer_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Nimbus Tech Solutions', 'employer', 'https://www.nimbustech.example')
  returning id into v_employer_id;

  insert into public.institutions (household_id, name, institution_type, website)
  values (v_household_id, 'Bright Future Analytics', 'employer', 'https://www.brightfutureanalytics.example')
  returning id into v_internship_employer_id;

  insert into public.institutions (household_id, name, institution_type)
  values (v_household_id, 'Rashtriya Institute of Technology', 'other')
  returning id into v_college_id;

  -- =========================================================================
  -- Financial accounts
  -- =========================================================================
  insert into public.financial_accounts (
    household_id, name, account_type, institution_id, owner_person_id,
    masked_identifier, currency_code, opening_balance_minor_units, opened_date
  ) values (
    v_household_id, 'Primary Savings', 'savings', v_bank_id, v_self_id,
    'XXXXXX4821', 'INR', 1500000, current_date - interval '20 months'
  )
  returning id into v_savings_id;

  insert into public.financial_accounts (
    household_id, name, account_type, institution_id, owner_person_id,
    masked_identifier, currency_code, opening_balance_minor_units, opened_date
  ) values (
    v_household_id, 'SwiftPay Wallet', 'wallet', v_wallet_provider_id, v_self_id,
    '90XXXXXX10', 'INR', 50000, current_date - interval '12 months'
  )
  returning id into v_wallet_id;

  insert into public.financial_accounts (
    household_id, name, account_type, owner_person_id,
    currency_code, opening_balance_minor_units, opened_date
  ) values (
    v_household_id, 'Cash in hand', 'cash', v_self_id,
    'INR', 100000, current_date - interval '20 months'
  )
  returning id into v_cash_id;

  -- =========================================================================
  -- Category lookups (auto-seeded by seed_default_transaction_categories())
  -- =========================================================================
  select id into v_cat_salary from public.transaction_categories where household_id = v_household_id and name = 'Salary';
  select id into v_cat_internship from public.transaction_categories where household_id = v_household_id and name = 'Internship';
  select id into v_cat_housing from public.transaction_categories where household_id = v_household_id and name = 'Housing';
  select id into v_cat_groceries from public.transaction_categories where household_id = v_household_id and name = 'Groceries';
  select id into v_cat_utilities from public.transaction_categories where household_id = v_household_id and name = 'Utilities';
  select id into v_cat_transport from public.transaction_categories where household_id = v_household_id and name = 'Transport';
  select id into v_cat_healthcare from public.transaction_categories where household_id = v_household_id and name = 'Healthcare';
  select id into v_cat_insurance from public.transaction_categories where household_id = v_household_id and name = 'Insurance';
  select id into v_cat_debt_payment from public.transaction_categories where household_id = v_household_id and name = 'Debt payment';
  select id into v_cat_eating_out from public.transaction_categories where household_id = v_household_id and name = 'Eating out';
  select id into v_cat_subscriptions from public.transaction_categories where household_id = v_household_id and name = 'Subscriptions';
  select id into v_cat_gadgets from public.transaction_categories where household_id = v_household_id and name = 'Gadgets';

  -- =========================================================================
  -- Income sources (declared expectations — never themselves income, see
  -- PROMPT 11)
  -- =========================================================================
  insert into public.income_sources (
    household_id, name, source_type, institution_id, person_id,
    expected_amount_minor_units, currency_code, frequency, expected_day_of_month,
    receiving_account_id, category_id, start_date, end_date, is_active
  ) values (
    v_household_id, 'Bright Future Analytics Internship', 'internship', v_internship_employer_id, v_self_id,
    1500000, 'INR', 'monthly', 1,
    v_savings_id, v_cat_internship, current_date - interval '12 months', current_date - interval '9 months', false
  )
  returning id into v_income_internship_id;

  insert into public.income_sources (
    household_id, name, source_type, institution_id, person_id,
    expected_amount_minor_units, currency_code, frequency, expected_day_of_month,
    receiving_account_id, category_id, start_date, is_active
  ) values (
    v_household_id, 'Nimbus Tech Solutions Salary', 'salary', v_employer_id, v_self_id,
    6500000, 'INR', 'monthly', 1,
    v_savings_id, v_cat_salary, current_date - interval '9 months', true
  )
  returning id into v_income_salary_id;

  -- =========================================================================
  -- Investments: accounts, assets, holdings
  -- =========================================================================
  insert into public.investment_accounts (household_id, name, institution_id, owner_person_id, currency_code, opened_date)
  values (v_household_id, 'Bharat Digital Gold Wallet', v_gold_platform_inst_id, v_self_id, 'INR', current_date - interval '32 days')
  returning id into v_inv_account_gold_id;

  insert into public.investment_accounts (household_id, name, institution_id, owner_person_id, currency_code, opened_date)
  values (v_household_id, 'Nova Growth Mutual Fund Folio', v_mf_platform_inst_id, v_self_id, 'INR', current_date - interval '8 months')
  returning id into v_inv_account_mf_id;

  insert into public.investment_accounts (household_id, name, institution_id, owner_person_id, currency_code, opened_date)
  values (v_household_id, 'CoinStake Exchange Wallet', v_staking_platform_inst_id, v_self_id, 'INR', current_date - interval '16 days')
  returning id into v_inv_account_staking_id;

  insert into public.investment_assets (household_id, name, asset_class, symbol_or_identifier, currency_code)
  values (v_household_id, 'SafeGold 24K Digital Gold', 'digital_gold', 'DGOLD', 'INR')
  returning id into v_asset_gold_id;

  insert into public.investment_assets (household_id, name, asset_class, symbol_or_identifier, currency_code)
  values (v_household_id, 'Nova Balanced Advantage Fund - Direct Growth', 'mutual_fund', 'NOVA-BAF-DG', 'INR')
  returning id into v_asset_mf_id;

  insert into public.investment_assets (household_id, name, asset_class, symbol_or_identifier, currency_code)
  values (v_household_id, 'Ethereum (ETH) — staked', 'crypto', 'ETH', 'INR')
  returning id into v_asset_eth_id;

  insert into public.investment_holdings (household_id, investment_account_id, investment_asset_id, opened_date)
  values (v_household_id, v_inv_account_gold_id, v_asset_gold_id, current_date - interval '30 days')
  returning id into v_holding_gold_id;

  insert into public.investment_holdings (household_id, investment_account_id, investment_asset_id, opened_date)
  values (v_household_id, v_inv_account_mf_id, v_asset_mf_id, current_date - interval '8 months')
  returning id into v_holding_mf_id;

  insert into public.investment_holdings (household_id, investment_account_id, investment_asset_id, opened_date)
  values (v_household_id, v_inv_account_staking_id, v_asset_eth_id, current_date - interval '14 days')
  returning id into v_holding_staking_id;

  -- =========================================================================
  -- SIPs — ₹20 daily digital gold, ₹100 monthly mutual fund
  -- =========================================================================
  insert into public.investment_sips (
    household_id, name, investment_holding_id, provider, contribution_amount_minor_units,
    currency_code, frequency, start_date, contribution_account_id, next_due_date,
    last_contribution_date, status
  ) values (
    v_household_id, 'Daily Digital Gold SIP', v_holding_gold_id, 'Bharat Digital Gold', 2000,
    'INR', 'daily', current_date - interval '30 days', v_savings_id, current_date,
    current_date - interval '1 day', 'active'
  )
  returning id into v_sip_gold_id;

  insert into public.investment_sips (
    household_id, name, investment_holding_id, provider, contribution_amount_minor_units,
    currency_code, frequency, start_date, contribution_account_id, next_due_date,
    last_contribution_date, status
  ) values (
    v_household_id, 'Nova Balanced Advantage Monthly SIP', v_holding_mf_id, 'Nova Mutual Fund AMC', 10000,
    'INR', 'monthly', current_date - interval '8 months', v_savings_id,
    (date_trunc('month', current_date) + interval '1 month')::date,
    date_trunc('month', current_date)::date, 'active'
  )
  returning id into v_sip_mf_id;

  -- =========================================================================
  -- Staking position
  -- =========================================================================
  insert into public.staking_positions (
    household_id, name, investment_holding_id, opening_principal_minor_units, opening_date,
    currency_code, expected_daily_rate, lock_in_end_date, fee_notes, risk_notes, status
  ) values (
    v_household_id, 'ETH Staking Position', v_holding_staking_id, 800000, current_date - interval '14 days',
    'INR', 0.0004, current_date + interval '2 months',
    '0.1% platform fee on rewards.', 'Slashing and platform-counterparty risk exist; rewards are not guaranteed.', 'active'
  )
  returning id into v_staking_position_id;

  -- =========================================================================
  -- Education loan
  -- =========================================================================
  insert into public.loans (
    household_id, name, loan_type, lender_institution_id, borrower_person_id,
    original_principal_minor_units, disbursed_amount_minor_units, disbursed_date,
    currency_code, annual_interest_rate, interest_type, emi_amount_minor_units,
    start_date, repayment_start_date, maturity_date, payment_account_id, status,
    educational_institution_id, course, study_start_date, study_end_date,
    moratorium, interest_subsidy
  ) values (
    v_household_id, 'B.Tech Education Loan', 'education', v_edu_lender_id, v_self_id,
    30000000, 30000000, date_trunc('month', current_date) - interval '12 months',
    'INR', 0.085, 'fixed', 450000,
    date_trunc('month', current_date) - interval '12 months',
    date_trunc('month', current_date) - interval '12 months',
    current_date + interval '3 years', v_savings_id, 'active',
    v_college_id, 'B.Tech Computer Science', current_date - interval '4 years', current_date - interval '17 months',
    false, false
  )
  returning id into v_loan_id;

  -- =========================================================================
  -- Money lent to a friend
  -- =========================================================================
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    counterparty, description, status, related_person_id, created_by
  ) values (
    v_household_id, 'lending_disbursement', 2000000, 'INR', current_date - interval '5 months', v_savings_id,
    'Karan Mehta', 'Lent to Karan for a medical emergency', 'cleared', v_friend_id, v_user_id
  )
  returning id into v_disbursement_txn_id;

  insert into public.lendings (
    household_id, name, borrower_person_id, source_account_id, amount_lent_minor_units,
    currency_code, disbursed_date, disbursement_transaction_id, purpose, charges_interest,
    repayment_schedule_type, installment_amount_minor_units, installment_frequency,
    risk_level, status
  ) values (
    v_household_id, 'Loan to Karan (medical emergency)', v_friend_id, v_savings_id, 2000000,
    'INR', current_date - interval '5 months', v_disbursement_txn_id, 'Medical emergency help', false,
    'installments', 500000, 'monthly',
    'low', 'partially_repaid'
  )
  returning id into v_lending_id;

  -- Two repayments so far (last two months)
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    counterparty, description, status, related_person_id, created_by
  ) values (
    v_household_id, 'lending_repayment', 500000, 'INR', current_date - interval '2 months', v_savings_id,
    'Karan Mehta', 'Repayment from Karan', 'cleared', v_friend_id, v_user_id
  )
  returning id into v_txn_id;

  insert into public.lending_repayments (
    household_id, lending_id, repayment_date, principal_component_minor_units,
    total_repayment_minor_units, currency_code, linked_transaction_id, created_by
  ) values (
    v_household_id, v_lending_id, current_date - interval '2 months', 500000,
    500000, 'INR', v_txn_id, v_user_id
  );

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    counterparty, description, status, related_person_id, created_by
  ) values (
    v_household_id, 'lending_repayment', 500000, 'INR', current_date - interval '1 months', v_savings_id,
    'Karan Mehta', 'Repayment from Karan', 'cleared', v_friend_id, v_user_id
  )
  returning id into v_txn_id;

  insert into public.lending_repayments (
    household_id, lending_id, repayment_date, principal_component_minor_units,
    total_repayment_minor_units, currency_code, linked_transaction_id, created_by
  ) values (
    v_household_id, v_lending_id, current_date - interval '1 months', 500000,
    500000, 'INR', v_txn_id, v_user_id
  );

  -- =========================================================================
  -- Liability — a general obligation, so /app/liabilities has something to
  -- show too (not itself in PROMPT 43's named list, but a "major module").
  -- =========================================================================
  insert into public.liabilities (
    household_id, name, liability_source, category, amount_minor_units, currency_code,
    start_date, due_date, documentation_status, certainty, payment_account_id, status
  ) values (
    v_household_id, 'Pending society maintenance dues', 'general_obligation', 'pending_bill', 350000, 'INR',
    current_date - interval '2 months', current_date + interval '15 days', 'written_note', 'confirmed', v_savings_id, 'active'
  )
  returning id into v_liability_id;

  -- =========================================================================
  -- Insurance — a detailed health policy ("health-insurance planning
  -- record") and a separate active term life policy ("one active policy")
  -- =========================================================================
  insert into public.insurance_policies (
    household_id, policy_type, name, insurer_institution_id, policyholder_person_id, nominee_person_id,
    masked_policy_number, coverage_amount_minor_units, currency_code, premium_amount_minor_units,
    premium_frequency, start_date, renewal_date, payment_account_id, status,
    agent_name, agent_contact, support_contact, claim_contact,
    deductible_minor_units, co_pay_percentage, room_rent_restriction, pre_existing_conditions_declared,
    waiting_periods, network_hospital_notes, cashless_availability, restoration_benefit,
    no_claim_bonus, opd_cover, consumables_cover, pre_hospitalization_days
  ) values (
    v_household_id, 'health', 'Family Health Shield', v_health_insurer_id, v_self_id, v_mother_id,
    'HLTH-XXXX-9021', 50000000, 'INR', 150000,
    'monthly', current_date - interval '10 months', current_date + interval '2 months', v_savings_id, 'active',
    'Priya Nair', '+91-98XXXXXX45', '1800-XXX-3000', '1800-XXX-3001',
    1000000, 0.10, 'Single private room, up to Rs 5,000/day', 'None declared',
    '30-day initial waiting period; 2-year waiting period for named pre-existing conditions per policy schedule',
    'Cashless available at 4,500+ network hospitals nationwide', true, true,
    '10% sum-insured increase per claim-free year, up to 50%', false, false, 30
  )
  returning id into v_health_policy_id;

  insert into public.insurance_policies (
    household_id, policy_type, name, insurer_institution_id, policyholder_person_id, nominee_person_id,
    masked_policy_number, coverage_amount_minor_units, currency_code, premium_amount_minor_units,
    premium_frequency, start_date, renewal_date, payment_account_id, status
  ) values (
    v_household_id, 'term', 'Term Life Cover', v_life_insurer_id, v_self_id, v_mother_id,
    'TERM-XXXX-3387', 500000000, 'INR', 800000,
    'yearly', current_date - interval '8 months', current_date + interval '4 months', v_savings_id, 'active'
  )
  returning id into v_life_policy_id;

  -- Health premium: monthly for the last 10 months
  for v_m in 0..9 loop
    v_month_start := (date_trunc('month', current_date) - (v_m || ' months')::interval)::date;
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, insurance_policy_id, created_by
    ) values (
      v_household_id, 'expense', 150000, 'INR', v_month_start + 4, v_savings_id,
      v_cat_insurance, 'Suraksha Health Assurance', 'Health insurance premium', 'cleared', v_health_policy_id, v_user_id
    );
  end loop;

  -- Life premium: one annual payment, 8 months ago
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    category_id, counterparty, description, status, insurance_policy_id, created_by
  ) values (
    v_household_id, 'expense', 800000, 'INR', current_date - interval '8 months', v_savings_id,
    v_cat_insurance, 'Suraksha Life Assurance', 'Term life insurance premium', 'cleared', v_life_policy_id, v_user_id
  );

  -- =========================================================================
  -- Assets — inherited land (pending ownership documentation), laptop,
  -- vehicle
  -- =========================================================================
  insert into public.assets (
    household_id, name, asset_group, category, owner_person_id, ownership_percentage, ownership_status,
    acquisition_type, acquisition_date, acquisition_value_minor_units, currency_code, location,
    liquidity_classification, include_in_net_worth, property_type, location_precise, land_area, area_unit,
    ownership_share_notes, title_status, mutation_status, original_owner, legal_heir_notes,
    rental_status, occupancy, encumbrance_status, dispute_status, notes, created_by
  ) values (
    v_household_id, 'Ancestral Plot, Nashik', 'immovable', 'land', v_self_id, 50, 'documentation_incomplete',
    'inherited', current_date - interval '2 years', null, 'INR', 'Outskirts of Nashik, Maharashtra',
    'illiquid', true, 'plot', 'Survey No. 214/2, near Trimbak Road, Nashik', 2, 'acre',
    'Shared 50/50 with mother pending a formal partition deed.', 'pending_verification', 'pending', 'Family ancestral property',
    'Mutation and heir documentation in process with the local revenue office.',
    'vacant', 'family_occupied', 'none', 'none', 'Inherited jointly with Sunita Verma; not yet mutated in either name.', v_user_id
  )
  returning id into v_asset_land_id;

  insert into public.asset_valuation_snapshots (household_id, asset_id, as_of_date, value_minor_units, currency_code, source, confidence)
  values (v_household_id, v_asset_land_id, current_date - interval '1 month', 150000000, 'INR', 'market_estimate', 'unverified');

  insert into public.assets (
    household_id, name, asset_group, category, owner_person_id, acquisition_type, acquisition_date,
    acquisition_value_minor_units, currency_code, liquidity_classification, include_in_net_worth, notes, created_by
  ) values (
    v_household_id, 'Work Laptop', 'movable', 'laptop', v_self_id, 'purchased', current_date - interval '10 months',
    6500000, 'INR', 'semi_liquid', true, '14-inch ultrabook, purchased for work-from-home setup.', v_user_id
  )
  returning id into v_asset_laptop_id;

  insert into public.asset_valuation_snapshots (household_id, asset_id, as_of_date, value_minor_units, currency_code, source, confidence)
  values (v_household_id, v_asset_laptop_id, current_date - interval '1 month', 4500000, 'INR', 'manual', 'unverified');

  insert into public.assets (
    household_id, name, asset_group, category, owner_person_id, acquisition_type, acquisition_date,
    acquisition_value_minor_units, currency_code, liquidity_classification, include_in_net_worth, notes, created_by
  ) values (
    v_household_id, 'Two-Wheeler Scooter', 'movable', 'vehicle', v_self_id, 'purchased', current_date - interval '7 months',
    9500000, 'INR', 'semi_liquid', true, 'Daily commute vehicle, purchased outright (no vehicle loan).', v_user_id
  )
  returning id into v_asset_vehicle_id;

  insert into public.asset_valuation_snapshots (household_id, asset_id, as_of_date, value_minor_units, currency_code, source, confidence)
  values (v_household_id, v_asset_vehicle_id, current_date - interval '1 month', 8000000, 'INR', 'manual', 'unverified');

  -- =========================================================================
  -- Goals — house and sister's marriage, deliberately sharing the mutual
  -- fund holding across both at a combined 110% allocation, so the "an
  -- over-allocated source is a visible fact, never a silent double-count"
  -- acceptance criterion (PROMPT 30) has something real to show.
  -- =========================================================================
  insert into public.goals (
    household_id, name, goal_type, target_amount_minor_units, currency_code, target_date,
    manual_current_saved_amount_minor_units, priority, flexibility, status, created_by
  ) values (
    v_household_id, 'Own House', 'home_purchase', 400000000, 'INR', current_date + interval '5 years',
    5000000, 'high', 'somewhat_flexible', 'active', v_user_id
  )
  returning id into v_goal_house_id;

  insert into public.goals (
    household_id, name, goal_type, target_amount_minor_units, currency_code, target_date,
    manual_current_saved_amount_minor_units, priority, flexibility, status, created_by
  ) values (
    v_household_id, 'Ananya''s Marriage', 'sister_marriage', 80000000, 'INR', current_date + interval '2 years',
    7500000, 'high', 'fixed', 'active', v_user_id
  )
  returning id into v_goal_sister_marriage_id;

  insert into public.goal_responsible_people (household_id, goal_id, person_id)
  values (v_household_id, v_goal_house_id, v_self_id);

  insert into public.goal_responsible_people (household_id, goal_id, person_id)
  values
    (v_household_id, v_goal_sister_marriage_id, v_self_id),
    (v_household_id, v_goal_sister_marriage_id, v_mother_id);

  insert into public.goal_funding_sources (household_id, goal_id, source_type, account_id, allocation_percentage)
  values (v_household_id, v_goal_house_id, 'account', v_savings_id, 20);

  insert into public.goal_funding_sources (household_id, goal_id, source_type, investment_holding_id, allocation_percentage)
  values
    (v_household_id, v_goal_house_id, 'investment_holding', v_holding_mf_id, 60),
    (v_household_id, v_goal_sister_marriage_id, 'investment_holding', v_holding_mf_id, 50);

  -- =========================================================================
  -- Emergency fund plan (singleton per household — see PROMPT 31)
  -- =========================================================================
  insert into public.emergency_fund_plans (household_id, coverage_target_months, dependants_count, notes)
  values (v_household_id, 6, 1, 'Target based on essential monthly expenses; mother partially dependent.');

  -- =========================================================================
  -- 12 months of income + routine monthly expenses + EMI payments — the
  -- bulk of "generate enough transactions for charts and pagination."
  -- =========================================================================
  for v_m in 0..11 loop
    v_month_start := (date_trunc('month', current_date) - (v_m || ' months')::interval)::date;

    -- Income: internship for the oldest 3 months, salary for the other 9.
    if v_m >= 9 then
      insert into public.transactions (
        household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
        category_id, counterparty, description, status, income_source_id, created_by
      ) values (
        v_household_id, 'income', 1500000, 'INR', v_month_start, v_savings_id,
        v_cat_internship, 'Bright Future Analytics', 'Internship stipend', 'cleared', v_income_internship_id, v_user_id
      );
    else
      insert into public.transactions (
        household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
        category_id, counterparty, description, status, income_source_id, created_by
      ) values (
        v_household_id, 'income', 6500000, 'INR', v_month_start, v_savings_id,
        v_cat_salary, 'Nimbus Tech Solutions', 'Monthly salary', 'cleared', v_income_salary_id, v_user_id
      );
    end if;

    -- Housing (rent) — the current month's is left 'planned' (a rent that
    -- hasn't actually been paid yet), every earlier month is 'cleared'.
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values (
      v_household_id, 'expense', 1200000, 'INR', v_month_start + 2, v_savings_id,
      v_cat_housing, 'Shree Ganesh Properties', 'Monthly rent', case when v_m = 0 then 'planned' else 'cleared' end, true, v_user_id
    );

    -- Groceries — two a month, via the wallet.
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values
      (v_household_id, 'expense', 160000, 'INR', v_month_start + 7, v_wallet_id, v_cat_groceries, 'FreshMart Grocers', 'Groceries', 'cleared', false, v_user_id),
      (v_household_id, 'expense', 140000, 'INR', v_month_start + 21, v_wallet_id, v_cat_groceries, 'FreshMart Grocers', 'Groceries', 'cleared', false, v_user_id);

    -- Utilities
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values (
      v_household_id, 'expense', 180000, 'INR', v_month_start + 9, v_savings_id,
      v_cat_utilities, 'City Power & Water', 'Electricity and water', 'cleared', false, v_user_id
    );

    -- Transport
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values (
      v_household_id, 'expense', 120000, 'INR', v_month_start + 11, v_wallet_id,
      v_cat_transport, 'Metro Card Recharge', 'Commute top-up', 'cleared', false, v_user_id
    );

    -- Eating out — two a month, via the wallet.
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values
      (v_household_id, 'expense', 45000, 'INR', v_month_start + 14, v_wallet_id, v_cat_eating_out, 'Spice Route Diner', 'Dinner out', 'cleared', false, v_user_id),
      (v_household_id, 'expense', 55000, 'INR', v_month_start + 26, v_wallet_id, v_cat_eating_out, 'Cafe Bloom', 'Weekend brunch', 'cleared', false, v_user_id);

    -- Subscriptions
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, is_planned, created_by
    ) values (
      v_household_id, 'expense', 50000, 'INR', v_month_start + 4, v_wallet_id,
      v_cat_subscriptions, 'StreamPlus', 'Streaming subscription', 'cleared', false, v_user_id
    );

    -- EMI payment (education loan) — every month.
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      category_id, counterparty, description, status, loan_id, created_by
    ) values (
      v_household_id, 'loan_payment', 450000, 'INR', v_month_start + 27, v_savings_id,
      v_cat_debt_payment, 'Vidya Education Finance', 'Education loan EMI', 'cleared', v_loan_id, v_user_id
    )
    returning id into v_txn_id;

    insert into public.loan_payments (
      household_id, loan_id, payment_date, principal_component_minor_units, interest_component_minor_units,
      total_payment_minor_units, currency_code, linked_transaction_id, created_by
    ) values (
      v_household_id, v_loan_id, v_month_start + 27, 380000, 70000,
      450000, 'INR', v_txn_id, v_user_id
    );
  end loop;

  -- One-off Gadgets and Healthcare expenses so those categories aren't
  -- empty, without cluttering every single month.
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    category_id, counterparty, description, status, created_by
  ) values
    (v_household_id, 'expense', 220000, 'INR', (current_date - interval '6 months')::date + 10, v_savings_id, v_cat_gadgets, 'TechBazaar', 'Phone accessories', 'cleared', v_user_id),
    (v_household_id, 'expense', 120000, 'INR', (current_date - interval '8 months')::date + 8, v_savings_id, v_cat_healthcare, 'CityCare Clinic', 'Doctor visit', 'cleared', v_user_id),
    (v_household_id, 'expense', 120000, 'INR', (current_date - interval '3 months')::date + 8, v_savings_id, v_cat_healthcare, 'CityCare Clinic', 'Doctor visit', 'cleared', v_user_id);

  -- A cancelled transaction (tests the "show cancelled" filter) and an
  -- upcoming planned one further out (tests the planned/upcoming view).
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    category_id, counterparty, description, status, created_by
  ) values
    (v_household_id, 'expense', 80000, 'INR', (current_date - interval '3 months')::date + 5, v_wallet_id, v_cat_groceries, 'FreshMart Grocers', 'Duplicate entry, cancelled', 'cancelled', v_user_id),
    (v_household_id, 'expense', 50000, 'INR', current_date + interval '10 days', v_wallet_id, v_cat_subscriptions, 'StreamPlus', 'Upcoming renewal', 'planned', v_user_id);

  -- =========================================================================
  -- Digital gold SIP contributions — one per day for the last 30 days.
  -- =========================================================================
  for v_d in 1..30 loop
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      counterparty, description, status, created_by
    ) values (
      v_household_id, 'investment_contribution', 2000, 'INR', current_date - (31 - v_d), v_savings_id,
      'Bharat Digital Gold', 'Daily digital gold SIP', 'cleared', v_user_id
    )
    returning id into v_txn_id;

    insert into public.investment_transactions (
      household_id, investment_holding_id, transaction_type, transaction_date, amount_minor_units,
      currency_code, linked_transaction_id, description, created_by
    ) values (
      v_household_id, v_holding_gold_id, 'contribution', current_date - (31 - v_d), 2000,
      'INR', v_txn_id, 'Daily digital gold SIP', v_user_id
    );
  end loop;

  -- =========================================================================
  -- Mutual fund SIP contributions — one per month for the last 8 months,
  -- with a slowly rising NAV so quantity/price_per_unit are exercised too.
  -- =========================================================================
  for v_m in 0..7 loop
    v_month_start := date_trunc('month', current_date) - (v_m || ' months')::interval;
    v_nav := (case v_m
      when 7 then 45.00 when 6 then 45.80 when 5 then 44.90 when 4 then 46.20
      when 3 then 47.00 when 2 then 46.50 when 1 then 47.80 else 48.10 end);
    v_qty := round(100.0 / v_nav, 4);

    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
      counterparty, description, status, created_by
    ) values (
      v_household_id, 'investment_contribution', 10000, 'INR', v_month_start, v_savings_id,
      'Nova Growth Mutual Fund', 'Monthly mutual fund SIP', 'cleared', v_user_id
    )
    returning id into v_txn_id;

    insert into public.investment_transactions (
      household_id, investment_holding_id, transaction_type, transaction_date, amount_minor_units,
      currency_code, quantity, price_per_unit, linked_transaction_id, description, created_by
    ) values (
      v_household_id, v_holding_mf_id, 'contribution', v_month_start, 10000,
      'INR', v_qty, v_nav, v_txn_id, 'Monthly mutual fund SIP', v_user_id
    );
  end loop;

  insert into public.investment_valuation_snapshots (household_id, investment_holding_id, as_of_date, value_minor_units, currency_code, price_per_unit, source)
  values (v_household_id, v_holding_mf_id, current_date, 84000, 'INR', 48.10, 'calculated');

  insert into public.investment_valuation_snapshots (household_id, investment_holding_id, as_of_date, value_minor_units, currency_code, source)
  values (v_household_id, v_holding_gold_id, current_date, 62000, 'INR', 'calculated');

  -- =========================================================================
  -- Staking daily snapshots — full history since opening (14 days), one
  -- small top-up a week in, balancing the append-only equation exactly.
  -- =========================================================================
  v_running_value := 800000;
  for v_d in reverse 13..0 loop
    v_snapshot_date := current_date - v_d;
    v_contribution := case when v_d = 7 then 50000 else 0 end;
    v_reward := round(v_running_value * 0.0004);
    v_closing_value := v_running_value + v_contribution + v_reward;

    insert into public.staking_daily_snapshots (
      household_id, staking_position_id, snapshot_date, opening_value_minor_units,
      contribution_minor_units, reward_minor_units, closing_value_minor_units, currency_code, created_by
    ) values (
      v_household_id, v_staking_position_id, v_snapshot_date, v_running_value,
      v_contribution, v_reward, v_closing_value, 'INR', v_user_id
    );

    v_running_value := v_closing_value;
  end loop;

  -- =========================================================================
  -- Account balance snapshots (illustrative round figures, not a penny-
  -- exact reconciliation of every transaction above — this is fixture data
  -- for exercising the UI, not an audited ledger).
  -- =========================================================================
  insert into public.account_balance_snapshots (household_id, account_id, as_of_date, balance_minor_units, currency_code, source, notes)
  values (v_household_id, v_savings_id, current_date - interval '2 months', 4900000, 'INR', 'reconciliation', 'Reconciled against bank statement.');

  insert into public.account_balance_snapshots (household_id, account_id, as_of_date, balance_minor_units, currency_code, source, notes)
  values (v_household_id, v_wallet_id, current_date - interval '1 months', 150000, 'INR', 'reconciliation', 'Reconciled against wallet statement.');

  -- =========================================================================
  -- Net worth snapshots — a 7-point trend (6 month-end snapshots plus
  -- today), showing loans paying down, receivables following the lending
  -- lifecycle, and investments accelerating once the gold SIP and staking
  -- position begin.
  -- =========================================================================
  insert into public.net_worth_snapshots (
    household_id, as_of_date, currency_code,
    cash_and_accounts_minor_units, investments_minor_units, movable_assets_minor_units, property_minor_units, receivables_minor_units,
    loans_minor_units, other_liabilities_minor_units,
    completeness_percentage, valuation_dependent_item_count, missing_valuation_count
  ) values
    (v_household_id, (date_trunc('month', current_date) - interval '5 months' - interval '1 day')::date, 'INR',
      3800000, 25000, 12500000, 150000000, 0, 27800000, 0, 100, 6, 0),
    (v_household_id, (date_trunc('month', current_date) - interval '4 months' - interval '1 day')::date, 'INR',
      4100000, 35000, 12400000, 150000000, 2000000, 27400000, 0, 100, 6, 0),
    (v_household_id, (date_trunc('month', current_date) - interval '3 months' - interval '1 day')::date, 'INR',
      4400000, 48000, 12350000, 150000000, 2000000, 27000000, 0, 100, 6, 0),
    (v_household_id, (date_trunc('month', current_date) - interval '2 months' - interval '1 day')::date, 'INR',
      4700000, 62000, 12300000, 150000000, 2000000, 26600000, 0, 100, 6, 0),
    (v_household_id, (date_trunc('month', current_date) - interval '1 months' - interval '1 day')::date, 'INR',
      5000000, 75000, 12250000, 150000000, 1500000, 26200000, 350000, 100, 6, 0),
    (v_household_id, (date_trunc('month', current_date) - interval '1 day')::date, 'INR',
      5300000, 120000, 12200000, 150000000, 1000000, 25800000, 350000, 100, 6, 0),
    (v_household_id, current_date, 'INR',
      5700000, 970000, 12150000, 150000000, 1000000, 25400000, 350000, 100, 6, 0);

  -- =========================================================================
  -- Monthly closing — last month, completed, linked to that month's
  -- net-worth snapshot, with all 12 review items checked off.
  -- =========================================================================
  select id into v_closing_id
  from public.net_worth_snapshots
  where household_id = v_household_id
    and as_of_date = (date_trunc('month', current_date) - interval '1 months' - interval '1 day')::date;

  insert into public.monthly_closings (
    household_id, period, currency_code, status, started_at, started_by, completed_at, completed_by,
    income_total_minor_units, expense_total_minor_units, investment_contribution_minor_units, debt_payment_minor_units,
    net_worth_snapshot_id, reconciliation_status, unresolved_items_count, report_version
  ) values (
    v_household_id,
    to_char(date_trunc('month', current_date) - interval '1 month', 'YYYY-MM'),
    'INR', 'closed',
    (date_trunc('month', current_date))::timestamptz - interval '2 days',
    v_user_id,
    (date_trunc('month', current_date))::timestamptz - interval '1 days',
    v_user_id,
    6500000, 2100000, 10000, 450000,
    v_closing_id, 'clean', 0, 1
  )
  returning id into v_closing_id;

  insert into public.monthly_closing_review_items (household_id, monthly_closing_id, item_type, is_reviewed, reviewed_at, reviewed_by)
  select v_household_id, v_closing_id, item_type, true, (date_trunc('month', current_date))::timestamptz - interval '1 days', v_user_id
  from unnest(array[
    'account_balances', 'income', 'expenses', 'transfers', 'sip_contributions',
    'investment_valuations', 'loan_balances', 'lending_repayments',
    'insurance_premiums', 'asset_changes', 'goals', 'unusual_transactions'
  ]) as item_type;

  -- =========================================================================
  -- Internal transfers — wallet top-ups from savings, so /app/transfers has
  -- real 'transfer'-kind transactions to list (a nav module PROMPT 43's
  -- named list doesn't call out by name, but "every major module can be
  -- tested" covers).
  -- =========================================================================
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date, account_id,
    transfer_account_id, description, status, created_by
  ) values
    (v_household_id, 'transfer', 300000, 'INR', current_date - interval '35 days', v_savings_id, v_wallet_id, 'Wallet top-up', 'cleared', v_user_id),
    (v_household_id, 'transfer', 250000, 'INR', current_date - interval '5 days', v_savings_id, v_wallet_id, 'Wallet top-up', 'cleared', v_user_id);

  -- =========================================================================
  -- Recurring rules — rent (auto-generates planned transactions), a
  -- subscription (reminder-only), and the wallet top-up transfer above.
  -- =========================================================================
  insert into public.recurring_rules (
    household_id, name, kind, amount_minor_units, currency_code, account_id, category_id,
    counterparty, frequency, start_date, next_due_date, last_generated_date,
    status, auto_create_mode, reminder_lead_days
  ) values (
    v_household_id, 'Monthly Rent', 'expense', 1200000, 'INR', v_savings_id, v_cat_housing,
    'Shree Ganesh Properties', 'monthly', current_date - interval '12 months',
    (date_trunc('month', current_date) + interval '2 days')::date,
    (date_trunc('month', current_date) - interval '1 month' + interval '2 days')::date,
    'active', 'planned_transaction', 3
  );

  insert into public.recurring_rules (
    household_id, name, kind, amount_minor_units, currency_code, account_id, category_id,
    counterparty, frequency, start_date, next_due_date, last_generated_date,
    status, auto_create_mode, reminder_lead_days
  ) values (
    v_household_id, 'StreamPlus Subscription', 'expense', 50000, 'INR', v_wallet_id, v_cat_subscriptions,
    'StreamPlus', 'monthly', current_date - interval '12 months',
    (date_trunc('month', current_date) + interval '1 month' + interval '4 days')::date,
    (date_trunc('month', current_date) + interval '4 days')::date,
    'active', 'reminder_only', 3
  )
  returning id into v_recurring_subscription_id;

  insert into public.recurring_rules (
    household_id, name, kind, amount_minor_units, currency_code, account_id, transfer_account_id,
    frequency, start_date, next_due_date, last_generated_date, status, auto_create_mode, reminder_lead_days
  ) values (
    v_household_id, 'Wallet Top-up', 'transfer', 300000, 'INR', v_savings_id, v_wallet_id,
    'monthly', current_date - interval '12 months', current_date + interval '25 days',
    current_date - interval '5 days', 'active', 'reminder_only', 2
  );

  -- =========================================================================
  -- Money drains — /app/money-drains. One linked to the subscription's
  -- recurring rule (stays connected to real transactions, never a
  -- duplicate cost history), one linked to the vehicle asset, one
  -- standalone.
  -- =========================================================================
  insert into public.money_drains (
    household_id, item, drain_type, cost_frequency, cost_amount_minor_units, currency_code,
    usage_frequency, is_essential, next_renewal_date, linked_account_id, linked_recurring_rule_id, status, notes, created_by
  ) values (
    v_household_id, 'StreamPlus Subscription', 'subscription', 'monthly', 50000, 'INR',
    'weekly', false, (date_trunc('month', current_date) + interval '1 month' + interval '4 days')::date,
    v_wallet_id, v_recurring_subscription_id, 'active', 'Rarely watched more than once a week; candidate to cancel.', v_user_id
  );

  insert into public.money_drains (
    household_id, item, drain_type, cost_frequency, cost_amount_minor_units, currency_code,
    current_value_minor_units, usage_frequency, is_essential, linked_asset_id, status, notes, created_by
  ) values (
    v_household_id, 'Two-Wheeler Scooter', 'vehicle', 'monthly', 250000, 'INR',
    8000000, 'daily', true, v_asset_vehicle_id, 'active', 'Fuel and servicing estimate; essential for daily commute.', v_user_id
  );

  insert into public.money_drains (
    household_id, item, drain_type, cost_frequency, cost_amount_minor_units, currency_code,
    usage_frequency, is_essential, status, cancellation_terms, notes, created_by
  ) values (
    v_household_id, 'Neighborhood Gym Membership', 'membership', 'monthly', 180000, 'INR',
    'rarely', false, 'active', '30-day notice required to cancel.', 'Visited twice in the last three months.', v_user_id
  );

  -- =========================================================================
  -- Decision journal — /app/decisions. Two closed decisions and one
  -- still under review, the last one wired to a 'decision_review' reminder
  -- below via its review_date.
  -- =========================================================================
  insert into public.decision_journal_entries (
    household_id, title, decision_date, entity_type, entity_id, context, choice, rationale,
    expected_result, status, created_by
  ) values (
    v_household_id, 'Financed college via an education loan instead of family savings',
    current_date - interval '12 months', 'loan', v_loan_id,
    'Needed to fund the final year of a B.Tech program.',
    'Took an education loan from Vidya Education Finance rather than drawing down family savings.',
    'Preserved family liquidity; the loan''s fixed rate was reasonable against the opportunity cost of draining savings.',
    'Manageable EMI once salaried, paid alongside routine expenses.', 'decided', v_user_id
  );

  insert into public.decision_journal_entries (
    household_id, title, decision_date, entity_type, entity_id, context, choice, rationale,
    expected_result, status, created_by
  ) values (
    v_household_id, 'Started a monthly mutual-fund SIP instead of a lump sum',
    current_date - interval '8 months', 'investment_sip', v_sip_mf_id,
    'Had a small lump sum available shortly after starting the salaried job.',
    'Committed to a recurring monthly SIP into the Nova Balanced Advantage Fund rather than investing the lump sum at once.',
    'Rupee-cost averaging reduces timing risk given market volatility and an early, still-thin cash buffer.',
    'Steadier accumulated units over time versus a single lump-sum entry point.', 'decided', v_user_id
  );

  insert into public.decision_journal_entries (
    household_id, title, decision_date, entity_type, entity_id, context, choice, alternatives, rationale,
    risks, review_date, status, created_by
  ) values (
    v_household_id, 'Whether to increase the house goal''s monthly SIP allocation',
    current_date - interval '1 month', 'goal', v_goal_house_id,
    'House goal is running behind its straight-line target pace.',
    'Keep the current mutual fund SIP allocation unchanged for now and reassess after the next salary review.',
    'Increase the MF SIP amount immediately; or redirect emergency-fund contributions temporarily.',
    'Emergency fund is not yet fully funded, so committing more to the house goal now would leave too thin a buffer.',
    'House target date may slip if income does not rise as expected.',
    current_date + interval '2 months', 'under_review', v_user_id
  )
  returning id into v_decision_goal_review_id;

  -- =========================================================================
  -- Reminders — /app/reminders. A spread of entity types and statuses
  -- (mostly pending, one completed) across every reminder_type this
  -- household's fixtures can legitimately support.
  -- =========================================================================
  insert into public.reminders (household_id, reminder_type, entity_type, entity_id, due_date, status, notes)
  values
    (v_household_id, 'sip_due', 'investment_sip', v_sip_mf_id, (date_trunc('month', current_date) + interval '1 month')::date, 'pending', 'Monthly mutual fund SIP due.'),
    (v_household_id, 'emi_due', 'loan', v_loan_id, (date_trunc('month', current_date) + interval '1 month' + interval '27 days')::date, 'pending', 'Education loan EMI due.'),
    (v_household_id, 'insurance_premium', 'insurance_policy', v_health_policy_id, (date_trunc('month', current_date) + interval '1 month' + interval '4 days')::date, 'pending', 'Health insurance premium due.'),
    (v_household_id, 'policy_renewal', 'insurance_policy', v_life_policy_id, current_date + interval '4 months', 'pending', 'Term life policy renewal.'),
    (v_household_id, 'goal_review', 'goal', v_goal_house_id, current_date + interval '1 month', 'pending', 'Quarterly review of house goal progress.'),
    (v_household_id, 'lending_repayment', 'lending', v_lending_id, (date_trunc('month', current_date) + interval '1 month')::date, 'pending', 'Next installment from Karan due.'),
    (v_household_id, 'monthly_closing', 'household', v_household_id, (date_trunc('month', current_date) + interval '1 month')::date, 'pending', 'Close out last month''s books.'),
    (v_household_id, 'decision_review', 'decision_journal_entry', v_decision_goal_review_id, current_date + interval '2 months', 'pending', 'Revisit the house goal SIP allocation decision.');

  insert into public.reminders (household_id, reminder_type, entity_type, entity_id, due_date, status, notes, completed_at, completed_by)
  values (
    v_household_id, 'expected_income', 'income_source', v_income_salary_id, date_trunc('month', current_date)::date,
    'completed', 'Salary credited on time.', (date_trunc('month', current_date))::timestamptz + interval '1 day', v_user_id
  );

  -- =========================================================================
  -- Documents vault — /app/documents. Metadata rows only, spanning several
  -- categories and linked (loosely, per PROMPT 34 — never trigger-
  -- verified) to the entities above; no bytes are written to the storage
  -- bucket, so list/detail metadata is fully exercised but a download
  -- would 404, which is expected for fixture-only rows.
  -- =========================================================================
  insert into public.documents (
    household_id, uploaded_by, original_filename, display_name, mime_type, size_bytes,
    storage_path, category, entity_type, entity_id, document_date, notes
  ) values
    (v_household_id, v_user_id, 'vnb_statement_last_month.pdf', 'Vishwas National Bank Statement',
      'application/pdf', 245000, v_household_id::text || '/financial_account/' || v_savings_id::text || '/vnb-statement.pdf',
      'bank_statement', 'financial_account', v_savings_id, (date_trunc('month', current_date) - interval '1 month')::date, 'Monthly statement for reconciliation.'),
    (v_household_id, v_user_id, 'nimbus_payslip.pdf', 'Nimbus Tech Solutions Payslip',
      'application/pdf', 180000, v_household_id::text || '/income_source/' || v_income_salary_id::text || '/payslip.pdf',
      'salary_slip', 'income_source', v_income_salary_id, date_trunc('month', current_date)::date, null),
    (v_household_id, v_user_id, 'education_loan_agreement.pdf', 'B.Tech Education Loan Agreement',
      'application/pdf', 520000, v_household_id::text || '/loan/' || v_loan_id::text || '/agreement.pdf',
      'education_loan_document', 'loan', v_loan_id, current_date - interval '12 months', 'Signed loan agreement copy.'),
    (v_household_id, v_user_id, 'family_health_shield_policy.pdf', 'Family Health Shield Policy Document',
      'application/pdf', 410000, v_household_id::text || '/insurance_policy/' || v_health_policy_id::text || '/policy.pdf',
      'insurance_policy', 'insurance_policy', v_health_policy_id, current_date - interval '10 months', null),
    (v_household_id, v_user_id, 'health_premium_receipt.pdf', 'Latest Health Premium Receipt',
      'application/pdf', 95000, v_household_id::text || '/insurance_policy/' || v_health_policy_id::text || '/premium-receipt.pdf',
      'premium_receipt', 'insurance_policy', v_health_policy_id, date_trunc('month', current_date)::date, null),
    (v_household_id, v_user_id, 'nashik_plot_papers.pdf', 'Ancestral Plot Ownership Papers (Pending Mutation)',
      'application/pdf', 890000, v_household_id::text || '/asset/' || v_asset_land_id::text || '/property-papers.pdf',
      'property_paper', 'asset', v_asset_land_id, current_date - interval '2 years', 'Mutation still in process at the local revenue office.'),
    (v_household_id, v_user_id, 'karan_lending_note.pdf', 'Lending Agreement — Karan Mehta',
      'application/pdf', 60000, v_household_id::text || '/lending/' || v_lending_id::text || '/agreement.pdf',
      'lending_agreement', 'lending', v_lending_id, current_date - interval '5 months', 'Informal written note, not notarized.'),
    (v_household_id, v_user_id, 'rohan_pan_card.pdf', 'PAN Card',
      'application/pdf', 30000, v_household_id::text || '/general/' || v_household_id::text || '/pan-card.pdf',
      'identity_document', null, null, null, null);

  -- =========================================================================
  -- Calculator scenarios — /app/calculators. Saved scenarios so the
  -- "recent scenarios" view has something to show.
  -- =========================================================================
  insert into public.calculator_scenarios (household_id, calculator_type, name, inputs, outputs, linked_account_id, notes, created_by)
  values (
    v_household_id, 'emi', 'Two-Wheeler Loan EMI Check',
    jsonb_build_object('principal_minor_units', 9500000, 'annual_interest_rate', 0.095, 'tenure_months', 24),
    jsonb_build_object('emi_minor_units', 435000, 'total_interest_minor_units', 940000),
    v_savings_id, 'Checked before buying outright instead — decided against taking the loan.', v_user_id
  );

  insert into public.calculator_scenarios (household_id, calculator_type, name, inputs, outputs, linked_account_id, notes, created_by)
  values (
    v_household_id, 'sip_projection', 'Raise Mutual Fund SIP to ₹5,000/month',
    jsonb_build_object('monthly_contribution_minor_units', 500000, 'annual_return_rate', 0.11, 'tenure_years', 5),
    jsonb_build_object('projected_value_minor_units', 40200000, 'total_contribution_minor_units', 30000000),
    v_savings_id, 'Under consideration for the next salary review.', v_user_id
  );

  insert into public.calculator_scenarios (household_id, calculator_type, name, inputs, outputs, notes, created_by)
  values (
    v_household_id, 'goal_funding', 'House Goal Funding Gap',
    jsonb_build_object('target_amount_minor_units', 400000000, 'current_saved_minor_units', 5000000, 'target_date', to_char(current_date + interval '5 years', 'YYYY-MM-DD')),
    jsonb_build_object('required_monthly_contribution_minor_units', 620000),
    'Baseline before deciding whether to increase the SIP allocation.', v_user_id
  );

end $$;
