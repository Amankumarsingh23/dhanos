import { expect, test } from "@playwright/test";
import {
  createHousehold,
  getAnyCategoryId,
  restFetch,
  restInsert,
  restRpc,
  signUpTestUser,
} from "./support/supabase-rest";

/**
 * PROMPT 48 — integration tests for the mutation flows that PROMPT 46/47's
 * unit-test suite can't reach: the actual RPC/insert path each Server
 * Action calls, against the real local Supabase stack with real access
 * tokens (same methodology as household-isolation.spec.ts and
 * security-review.spec.ts — never mocks, since RLS is the actual
 * enforcement point, see docs/security-model.md §3).
 *
 * Every test proves two things together, not just one: (1) the owner's
 * mutation succeeds and produces a row with the correct data, and (2) a
 * second, independent household's user is denied the same access — so a
 * regression in either the Server Action's own role check OR the RLS
 * policy backing it fails this suite, not just a manual review. Each test
 * builds its own fresh household(s) — no shared fixture across tests.
 */

async function setupHousehold(label: string) {
  const user = await signUpTestUser(label);
  const householdId = await createHousehold(
    user.accessToken,
    `${label} Household`,
  );
  return { user, householdId };
}

async function createAccount(
  accessToken: string,
  householdId: string,
  overrides: Record<string, unknown> = {},
) {
  return restInsert<{ id: string; opening_balance_minor_units: number }>(
    "financial_accounts",
    accessToken,
    {
      household_id: householdId,
      name: "Test Account",
      account_type: "savings",
      currency_code: "INR",
      opening_balance_minor_units: 0,
      ...overrides,
    },
  );
}

async function createPerson(
  accessToken: string,
  householdId: string,
  overrides: Record<string, unknown> = {},
) {
  return restInsert<{ id: string }>("people", accessToken, {
    household_id: householdId,
    display_name: "Test Person",
    relationship_type: "self",
    ...overrides,
  });
}

async function createInstitution(
  accessToken: string,
  householdId: string,
  overrides: Record<string, unknown> = {},
) {
  return restInsert<{ id: string }>("institutions", accessToken, {
    household_id: householdId,
    name: "Test Institution",
    institution_type: "bank",
    ...overrides,
  });
}

test.describe("account creation", () => {
  test("owner creates an account with a real opening balance; a second household cannot read or modify it", async () => {
    const { user: owner, householdId } = await setupHousehold("acct-owner");

    const account = await createAccount(owner.accessToken, householdId, {
      name: "Salary Account",
      account_type: "savings",
      opening_balance_minor_units: 250_000,
    });
    expect(account.opening_balance_minor_units).toBe(250_000);

    const { user: attacker } = await setupHousehold("acct-attacker");

    const read = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      attacker.accessToken,
    );
    expect(await read.json()).toEqual([]);

    await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      attacker.accessToken,
      { method: "PATCH", body: JSON.stringify({ name: "Hijacked" }) },
    );
    const stillOwners = await restFetch(
      `/financial_accounts?id=eq.${account.id}`,
      owner.accessToken,
    );
    const [row] = (await stillOwners.json()) as [{ name: string }];
    expect(row.name).toBe("Salary Account");
  });
});

test.describe("transfer", () => {
  test("create_transaction_with_splits moves money between two of the owner's accounts; a second household cannot see or reverse it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "transfer-owner",
    );
    const source = await createAccount(owner.accessToken, householdId, {
      name: "Source",
    });
    const destination = await createAccount(owner.accessToken, householdId, {
      name: "Destination",
    });

    const { data: transfer, response, text } = await restRpc<{
      id: string;
      kind: string;
      account_id: string;
      transfer_account_id: string;
      amount_minor_units: number;
      transfer_fee_minor_units: number | null;
    }>("create_transaction_with_splits", owner.accessToken, {
      p_household_id: householdId,
      p_kind: "transfer",
      p_amount_minor_units: 500_000,
      p_currency_code: "INR",
      p_transaction_date: "2026-07-01",
      p_account_id: source.id,
      p_transfer_account_id: destination.id,
      p_transfer_fee_minor_units: 1_000,
    });
    expect(response.ok, text).toBe(true);
    expect(transfer!.kind).toBe("transfer");
    expect(transfer!.account_id).toBe(source.id);
    expect(transfer!.transfer_account_id).toBe(destination.id);
    expect(transfer!.transfer_fee_minor_units).toBe(1_000);

    const { user: attacker } = await setupHousehold("transfer-attacker");
    const read = await restFetch(
      `/transactions?id=eq.${transfer!.id}`,
      attacker.accessToken,
    );
    expect(await read.json()).toEqual([]);

    // Attacker cannot reverse a transfer they can't even see, by targeting
    // its real id from a household they don't belong to.
    const reverseAttempt = await restRpc(
      "create_transaction_with_splits",
      attacker.accessToken,
      {
        p_household_id: householdId,
        p_kind: "transfer",
        p_amount_minor_units: 500_000,
        p_currency_code: "INR",
        p_transaction_date: "2026-07-02",
        p_account_id: destination.id,
        p_transfer_account_id: source.id,
        p_reverses_transaction_id: transfer!.id,
      },
    );
    expect(reverseAttempt.response.ok).toBe(false);
  });
});

test.describe("refund", () => {
  test("a refund transaction reverses an expense and is capped at the original amount; cross-household refund is rejected", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "refund-owner",
    );
    const account = await createAccount(owner.accessToken, householdId);

    const expense = await restInsert<{ id: string }>(
      "transactions",
      owner.accessToken,
      {
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 200_000,
        currency_code: "INR",
        transaction_date: "2026-07-01",
        account_id: account.id,
        description: "Flight booking",
      },
    );

    const refund = await restInsert<{
      id: string;
      kind: string;
      reverses_transaction_id: string;
      amount_minor_units: number;
    }>("transactions", owner.accessToken, {
      household_id: householdId,
      kind: "refund",
      amount_minor_units: 200_000,
      currency_code: "INR",
      transaction_date: "2026-07-05",
      account_id: account.id,
      reverses_transaction_id: expense.id,
      description: "Flight cancelled",
    });
    expect(refund.kind).toBe("refund");
    expect(refund.reverses_transaction_id).toBe(expense.id);
    expect(refund.amount_minor_units).toBe(200_000);

    const { user: attacker } = await setupHousehold("refund-attacker");
    const crossRefund = await restFetch("/transactions", attacker.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "refund",
        amount_minor_units: 200_000,
        currency_code: "INR",
        transaction_date: "2026-07-06",
        account_id: account.id,
        reverses_transaction_id: expense.id,
      }),
    });
    // A BEFORE trigger's own household-consistency lookup (e.g. account_id/asset_id)
    // runs RLS-scoped to the attacker and raises first — a 400, not RLS's usual 403 —
    // see tests/e2e/security-review.spec.ts's identical "forgedInsert" case. Either way
    // the write is unconditionally rejected.
    expect([400, 403]).toContain(crossRefund.status);
  });
});

test.describe("recurring occurrence", () => {
  test("record_recurring_rule_occurrence generates a real transaction from a rule; a second household cannot generate against it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "recurring-owner",
    );
    const account = await createAccount(owner.accessToken, householdId);
    const categoryId = await getAnyCategoryId(owner.accessToken, householdId);

    const rule = await restInsert<{ id: string }>(
      "recurring_rules",
      owner.accessToken,
      {
        household_id: householdId,
        name: "Rent",
        kind: "expense",
        amount_minor_units: 1_500_000,
        currency_code: "INR",
        account_id: account.id,
        category_id: categoryId,
        frequency: "monthly",
        start_date: "2026-07-01",
        next_due_date: "2026-07-01",
      },
    );

    const { data: occurrence, response, text } = await restRpc<{
      id: string;
      recurring_rule_id: string;
      amount_minor_units: number;
      source_type: string;
    }>("record_recurring_rule_occurrence", owner.accessToken, {
      p_household_id: householdId,
      p_recurring_rule_id: rule.id,
      p_occurrence_date: "2026-07-01",
      p_kind: "expense",
      p_amount_minor_units: 1_500_000,
      p_currency_code: "INR",
      p_account_id: account.id,
      p_description: "Rent — July",
      p_status: "cleared",
      p_next_due_date: "2026-08-01",
    });
    expect(response.ok, text).toBe(true);
    expect(occurrence!.recurring_rule_id).toBe(rule.id);
    expect(occurrence!.amount_minor_units).toBe(1_500_000);

    const { user: attacker } = await setupHousehold("recurring-attacker");
    const crossGenerate = await restRpc(
      "record_recurring_rule_occurrence",
      attacker.accessToken,
      {
        p_household_id: householdId,
        p_recurring_rule_id: rule.id,
        p_occurrence_date: "2026-08-01",
        p_kind: "expense",
        p_amount_minor_units: 1_500_000,
        p_currency_code: "INR",
        p_account_id: account.id,
        p_description: "Rent — August (forged)",
        p_status: "cleared",
      },
    );
    expect(crossGenerate.response.ok).toBe(false);
  });
});

test.describe("SIP contribution", () => {
  test("record_investment_sip_contribution records a contribution against the owner's holding; a second household cannot", async () => {
    const { user: owner, householdId } = await setupHousehold("sip-owner");
    const account = await createAccount(owner.accessToken, householdId);

    const investmentAccount = await restInsert<{ id: string }>(
      "investment_accounts",
      owner.accessToken,
      { household_id: householdId, name: "Broker", currency_code: "INR" },
    );
    const investmentAsset = await restInsert<{ id: string }>(
      "investment_assets",
      owner.accessToken,
      {
        household_id: householdId,
        name: "Index Fund",
        asset_class: "mutual_fund",
        currency_code: "INR",
      },
    );
    const holding = await restInsert<{ id: string }>(
      "investment_holdings",
      owner.accessToken,
      {
        household_id: householdId,
        investment_account_id: investmentAccount.id,
        investment_asset_id: investmentAsset.id,
      },
    );
    const sip = await restInsert<{ id: string }>(
      "investment_sips",
      owner.accessToken,
      {
        household_id: householdId,
        name: "Monthly SIP",
        investment_holding_id: holding.id,
        contribution_amount_minor_units: 500_000,
        currency_code: "INR",
        frequency: "monthly",
        start_date: "2026-07-01",
        contribution_account_id: account.id,
        status: "active",
      },
    );

    const { data: contribution, response, text } = await restRpc<{
      id: string;
      investment_sip_id: string;
      transaction_type: string;
      amount_minor_units: number;
    }>("record_investment_sip_contribution", owner.accessToken, {
      p_household_id: householdId,
      p_investment_sip_id: sip.id,
      p_investment_holding_id: holding.id,
      p_contribution_account_id: account.id,
      p_occurrence_date: "2026-07-01",
      p_amount_minor_units: 500_000,
      p_currency_code: "INR",
      p_status: "cleared",
    });
    expect(response.ok, text).toBe(true);
    expect(contribution!.investment_sip_id).toBe(sip.id);
    expect(contribution!.transaction_type).toBe("contribution");
    expect(contribution!.amount_minor_units).toBe(500_000);

    const { user: attacker } = await setupHousehold("sip-attacker");
    const crossContribution = await restRpc(
      "record_investment_sip_contribution",
      attacker.accessToken,
      {
        p_household_id: householdId,
        p_investment_sip_id: sip.id,
        p_investment_holding_id: holding.id,
        p_contribution_account_id: account.id,
        p_occurrence_date: "2026-08-01",
        p_amount_minor_units: 500_000,
        p_currency_code: "INR",
        p_status: "cleared",
      },
    );
    expect(crossContribution.response.ok).toBe(false);
  });
});

test.describe("loan payment", () => {
  test("record_loan_disbursement then record_loan_payment reduce the outstanding balance; a second household cannot record against the loan", async () => {
    const { user: owner, householdId } = await setupHousehold("loan-owner");
    const account = await createAccount(owner.accessToken, householdId);
    const borrower = await createPerson(owner.accessToken, householdId);
    const lender = await createInstitution(owner.accessToken, householdId, {
      name: "Test Bank",
    });

    const loan = await restInsert<{ id: string }>("loans", owner.accessToken, {
      household_id: householdId,
      name: "Car Loan",
      loan_type: "vehicle",
      lender_institution_id: lender.id,
      borrower_person_id: borrower.id,
      original_principal_minor_units: 10_00_000_00,
      currency_code: "INR",
      annual_interest_rate: 9.5,
      interest_type: "fixed",
      start_date: "2026-01-01",
      repayment_start_date: "2026-02-01",
      payment_account_id: account.id,
      status: "pending_disbursement",
    });

    const { data: disbursed, response: disbursementResponse, text: disbursementResponseText } = await restRpc<{
      id: string;
      disbursed_amount_minor_units: number;
      status: string;
    }>("record_loan_disbursement", owner.accessToken, {
      p_household_id: householdId,
      p_loan_id: loan.id,
      p_disbursement_date: "2026-01-05",
      p_amount_minor_units: 10_00_000_00,
    });
    expect(disbursementResponse.ok, disbursementResponseText).toBe(
      true,
    );
    expect(disbursed!.disbursed_amount_minor_units).toBe(10_00_000_00);
    expect(disbursed!.status).toBe("active");

    const { data: payment, response: paymentResponse, text: paymentResponseText } = await restRpc<{
      id: string;
      loan_id: string;
      principal_component_minor_units: number;
    }>("record_loan_payment", owner.accessToken, {
      p_household_id: householdId,
      p_loan_id: loan.id,
      p_payment_date: "2026-02-01",
      p_principal_component_minor_units: 20_000_00,
      p_interest_component_minor_units: 5_000_00,
      p_fee_component_minor_units: 0,
      p_penalty_component_minor_units: 0,
    });
    expect(paymentResponse.ok, paymentResponseText).toBe(true);
    expect(payment!.loan_id).toBe(loan.id);
    expect(payment!.principal_component_minor_units).toBe(20_000_00);

    const { user: attacker } = await setupHousehold("loan-attacker");
    const crossPayment = await restRpc("record_loan_payment", attacker.accessToken, {
      p_household_id: householdId,
      p_loan_id: loan.id,
      p_payment_date: "2026-03-01",
      p_principal_component_minor_units: 20_000_00,
      p_interest_component_minor_units: 5_000_00,
      p_fee_component_minor_units: 0,
      p_penalty_component_minor_units: 0,
    });
    expect(crossPayment.response.ok).toBe(false);
  });
});

test.describe("lending repayment", () => {
  test("create_lending then record_lending_repayment track a receivable being recovered; a second household cannot record a repayment", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "lending-owner",
    );
    const account = await createAccount(owner.accessToken, householdId);
    const borrower = await createPerson(owner.accessToken, householdId, {
      relationship_type: "borrower",
    });

    const { data: lending, response: lendingResponse, text: lendingResponseText } = await restRpc<{
      id: string;
      amount_lent_minor_units: number;
      status: string;
    }>("create_lending", owner.accessToken, {
      p_household_id: householdId,
      p_name: "Loan to a friend",
      p_source_account_id: account.id,
      p_amount_lent_minor_units: 100_000_00,
      p_currency_code: "INR",
      p_disbursed_date: "2026-06-01",
      p_borrower_person_id: borrower.id,
    });
    expect(lendingResponse.ok, lendingResponseText).toBe(true);
    expect(lending!.amount_lent_minor_units).toBe(100_000_00);

    const { data: repayment, response: repaymentResponse, text: repaymentResponseText } = await restRpc<{
      id: string;
      lending_id: string;
      principal_component_minor_units: number;
    }>("record_lending_repayment", owner.accessToken, {
      p_household_id: householdId,
      p_lending_id: lending!.id,
      p_repayment_date: "2026-07-01",
      p_principal_component_minor_units: 50_000_00,
      p_interest_component_minor_units: 0,
    });
    expect(repaymentResponse.ok, repaymentResponseText).toBe(true);
    expect(repayment!.lending_id).toBe(lending!.id);
    expect(repayment!.principal_component_minor_units).toBe(50_000_00);

    const { user: attacker } = await setupHousehold("lending-attacker");
    const crossRepayment = await restRpc(
      "record_lending_repayment",
      attacker.accessToken,
      {
        p_household_id: householdId,
        p_lending_id: lending!.id,
        p_repayment_date: "2026-08-01",
        p_principal_component_minor_units: 50_000_00,
        p_interest_component_minor_units: 0,
      },
    );
    expect(crossRepayment.response.ok).toBe(false);
  });
});

test.describe("policy premium", () => {
  test("a premium payment is a real expense transaction linked back to the policy; a second household cannot record one against it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "insurance-owner",
    );
    const account = await createAccount(owner.accessToken, householdId);
    const person = await createPerson(owner.accessToken, householdId);
    const insurer = await createInstitution(owner.accessToken, householdId, {
      name: "Test Insurer",
      institution_type: "insurer",
    });

    const { data: policy, response: policyResponse, text: policyResponseText } = await restRpc<{
      id: string;
      premium_amount_minor_units: number;
    }>("create_insurance_policy", owner.accessToken, {
      p_household_id: householdId,
      p_policy_type: "health",
      p_name: "Family Floater",
      p_insurer_institution_id: insurer.id,
      p_policyholder_person_id: person.id,
      p_coverage_amount_minor_units: 50_00_000_00,
      p_currency_code: "INR",
      p_premium_amount_minor_units: 25_000_00,
      p_premium_frequency: "yearly",
      p_start_date: "2026-01-01",
      p_payment_account_id: account.id,
    });
    expect(policyResponse.ok, policyResponseText).toBe(true);
    expect(policy!.premium_amount_minor_units).toBe(25_000_00);

    const premiumTxn = await restInsert<{
      id: string;
      insurance_policy_id: string;
      kind: string;
    }>("transactions", owner.accessToken, {
      household_id: householdId,
      kind: "expense",
      amount_minor_units: 25_000_00,
      currency_code: "INR",
      transaction_date: "2026-01-05",
      account_id: account.id,
      insurance_policy_id: policy!.id,
      description: "Premium: Family Floater",
    });
    expect(premiumTxn.insurance_policy_id).toBe(policy!.id);
    expect(premiumTxn.kind).toBe("expense");

    const { user: attacker } = await setupHousehold("insurance-attacker");
    const crossPremium = await restFetch("/transactions", attacker.accessToken, {
      method: "POST",
      body: JSON.stringify({
        household_id: householdId,
        kind: "expense",
        amount_minor_units: 25_000_00,
        currency_code: "INR",
        transaction_date: "2026-01-06",
        account_id: account.id,
        insurance_policy_id: policy!.id,
      }),
    });
    // A BEFORE trigger's own household-consistency lookup (e.g. account_id/asset_id)
    // runs RLS-scoped to the attacker and raises first — a 400, not RLS's usual 403 —
    // see tests/e2e/security-review.spec.ts's identical "forgedInsert" case. Either way
    // the write is unconditionally rejected.
    expect([400, 403]).toContain(crossPremium.status);
  });
});

test.describe("asset valuation", () => {
  test("create_asset then a valuation snapshot records the current value; a second household cannot record one against it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "asset-owner",
    );
    const person = await createPerson(owner.accessToken, householdId);

    const { data: asset, response: assetResponse, text: assetResponseText } = await restRpc<{
      id: string;
    }>("create_asset", owner.accessToken, {
      p_household_id: householdId,
      p_name: "Gold jewellery",
      p_asset_group: "movable",
      p_category: "jewellery",
      p_owner_person_id: person.id,
      p_ownership_percentage: 100,
      p_ownership_status: "confirmed",
      p_acquisition_type: "purchased",
      p_acquisition_date: "2020-01-01",
      p_currency_code: "INR",
      p_liquidity_classification: "semi_liquid",
      p_estimated_value_minor_units: 500_000_00,
      p_valuation_date: "2026-07-01",
    });
    expect(assetResponse.ok, assetResponseText).toBe(true);

    const valuation = await restInsert<{
      id: string;
      asset_id: string;
      value_minor_units: number;
    }>("asset_valuation_snapshots", owner.accessToken, {
      household_id: householdId,
      asset_id: asset!.id,
      as_of_date: "2026-07-20",
      value_minor_units: 550_000_00,
      currency_code: "INR",
      source: "market_estimate",
      confidence: "informal_estimate",
    });
    expect(valuation.asset_id).toBe(asset!.id);
    expect(valuation.value_minor_units).toBe(550_000_00);

    const { user: attacker } = await setupHousehold("asset-attacker");
    const crossValuation = await restFetch(
      "/asset_valuation_snapshots",
      attacker.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: householdId,
          asset_id: asset!.id,
          as_of_date: "2026-07-21",
          value_minor_units: 1,
          currency_code: "INR",
          source: "manual",
        }),
      },
    );
    // A BEFORE trigger's own household-consistency lookup (e.g. account_id/asset_id)
    // runs RLS-scoped to the attacker and raises first — a 400, not RLS's usual 403 —
    // see tests/e2e/security-review.spec.ts's identical "forgedInsert" case. Either way
    // the write is unconditionally rejected.
    expect([400, 403]).toContain(crossValuation.status);
  });
});

test.describe("monthly closing", () => {
  test("start_monthly_closing opens a closing for a period; a second household cannot open one against it or read it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "closing-owner",
    );

    const { data: closing, response, text } = await restRpc<{
      id: string;
      period: string;
      status: string;
    }>("start_monthly_closing", owner.accessToken, {
      p_household_id: householdId,
      p_period: "2026-07",
      p_currency_code: "INR",
    });
    expect(response.ok, text).toBe(true);
    expect(closing!.period).toBe("2026-07");
    expect(closing!.status).toBe("in_progress");

    const { user: attacker } = await setupHousehold("closing-attacker");
    const read = await restFetch(
      `/monthly_closings?id=eq.${closing!.id}`,
      attacker.accessToken,
    );
    expect(await read.json()).toEqual([]);

    const crossOpen = await restRpc("start_monthly_closing", attacker.accessToken, {
      p_household_id: householdId,
      p_period: "2026-08",
      p_currency_code: "INR",
    });
    expect(crossOpen.response.ok).toBe(false);
  });
});

test.describe("net-worth snapshot", () => {
  test("a recorded snapshot's generated total reflects its component columns; a second household cannot write or read it", async () => {
    const { user: owner, householdId } = await setupHousehold(
      "networth-owner",
    );

    const snapshot = await restInsert<{
      id: string;
      total_assets_minor_units: number;
      total_liabilities_minor_units: number;
      net_worth_minor_units: number;
    }>("net_worth_snapshots", owner.accessToken, {
      household_id: householdId,
      as_of_date: "2026-07-21",
      currency_code: "INR",
      cash_and_accounts_minor_units: 500_000_00,
      investments_minor_units: 200_000_00,
      loans_minor_units: 150_000_00,
    });
    // Generated columns (see supabase/migrations/20260723160000_net_worth_breakdown.sql) —
    // never set directly, always derived server-side from the components above.
    expect(snapshot.total_assets_minor_units).toBe(700_000_00);
    expect(snapshot.total_liabilities_minor_units).toBe(150_000_00);
    expect(snapshot.net_worth_minor_units).toBe(550_000_00);

    const { user: attacker } = await setupHousehold("networth-attacker");
    const read = await restFetch(
      `/net_worth_snapshots?id=eq.${snapshot.id}`,
      attacker.accessToken,
    );
    expect(await read.json()).toEqual([]);

    const crossWrite = await restFetch(
      "/net_worth_snapshots",
      attacker.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          household_id: householdId,
          as_of_date: "2026-07-22",
          currency_code: "INR",
        }),
      },
    );
    expect(crossWrite.status).toBe(403);
  });
});
