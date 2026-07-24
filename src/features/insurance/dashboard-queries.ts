import type { createClient } from "@/lib/supabase/server";
import { toIsoDateString } from "@/lib/dates";
import {
  isRenewalDueSoon,
  isWaitingPeriodMilestoneUpcoming,
  isWaitingPeriodPassed,
} from "@/lib/calculations/insurance";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import { listPeople } from "@/features/people/queries";
import { listAllClaims, type InsuranceClaimRow } from "./claims-queries";
import {
  listAllWaitingPeriods,
  listPolicies,
  type InsurancePolicyRow,
  type WaitingPeriodRow,
} from "./queries";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PersonCoverageOption = { id: string; displayName: string };

export type CoverageByPerson = {
  personId: string;
  displayName: string;
  totalCoverageMinorUnits: number;
};

export type WaitingPeriodMilestone = WaitingPeriodRow & {
  policyId: string;
  policyName: string;
  milestoneStatus: "passed" | "upcoming" | "later";
};

export type InsuranceDashboardData = {
  currencyCode: string;
  asOfDate: string;
  activePolicyCount: number;
  totalAnnualPremiumMinorUnits: number;
  upcomingRenewals: InsurancePolicyRow[];
  expiredPolicies: InsurancePolicyRow[];
  peopleWithoutRecordedHealthCoverage: PersonCoverageOption[];
  coverageByPerson: CoverageByPerson[];
  claimsMissingDocuments: InsuranceClaimRow[];
  waitingPeriodMilestones: WaitingPeriodMilestone[];
};

/**
 * The combined fetch behind the insurance dashboard (PROMPT 26) — every
 * figure here is either a plain count/filter over the household's own
 * insurance_policies/insurance_claims/insurance_policy_waiting_periods rows,
 * or a purely advisory computation over stored dates (renewal timing,
 * waiting-period milestones — see src/lib/calculations/insurance.ts). None
 * of it overwrites or infers a policy's own `status`.
 *
 * **"Without recorded coverage" must not claim the person is definitely
 * uninsured outside DhanOS"** (PROMPT 26 acceptance criterion) —
 * `peopleWithoutRecordedHealthCoverage` is deliberately named and
 * disclaimed (see the dashboard UI) as "no *active health policy tracked
 * in this household* insures them," never "uninsured."
 */
export async function getInsuranceDashboardData(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<InsuranceDashboardData> {
  const [allPoliciesPage, peoplePage, allClaims, allWaitingPeriods] =
    await Promise.all([
      listPolicies(supabase, householdId, {}, { pageSize: MAX_PAGE_SIZE }),
      listPeople(supabase, householdId, {}, { pageSize: MAX_PAGE_SIZE }),
      listAllClaims(supabase, householdId),
      listAllWaitingPeriods(supabase, householdId),
    ]);

  const inCurrency = allPoliciesPage.rows.filter(
    (policy) => policy.currency_code === currencyCode,
  );
  const activePolicies = inCurrency.filter(
    (policy) => policy.status === "active",
  );

  const totalAnnualPremiumMinorUnits = activePolicies.reduce(
    (sum, policy) => sum + policy.annualPremiumMinorUnits,
    0,
  );

  const upcomingRenewals = activePolicies
    .filter((policy) =>
      isRenewalDueSoon(
        { renewalOrExpiryDate: policy.renewal_date ?? policy.expiry_date },
        asOfDate,
      ),
    )
    .sort((a, b) => {
      const aDate = a.renewal_date ?? a.expiry_date ?? "";
      const bDate = b.renewal_date ?? b.expiry_date ?? "";
      return aDate.localeCompare(bDate);
    });

  const expiredPolicies = inCurrency.filter(
    (policy) => policy.status === "expired",
  );

  const healthCoveredPersonIds = new Set(
    activePolicies
      .filter((policy) => policy.policy_type === "health")
      .flatMap((policy) => policy.insuredPeople.map((person) => person.id)),
  );
  const peopleWithoutRecordedHealthCoverage: PersonCoverageOption[] =
    peoplePage.rows
      .filter((person) => !healthCoveredPersonIds.has(person.id))
      .map((person) => ({ id: person.id, displayName: person.display_name }));

  const coverageByPersonMap = new Map<
    string,
    { displayName: string; totalCoverageMinorUnits: number }
  >();
  for (const policy of activePolicies) {
    for (const person of policy.insuredPeople) {
      const existing = coverageByPersonMap.get(person.id) ?? {
        displayName: person.displayName,
        totalCoverageMinorUnits: 0,
      };
      existing.totalCoverageMinorUnits += policy.coverage_amount_minor_units;
      coverageByPersonMap.set(person.id, existing);
    }
  }
  const coverageByPerson: CoverageByPerson[] = [
    ...coverageByPersonMap.entries(),
  ]
    .map(([personId, value]) => ({ personId, ...value }))
    .sort((a, b) => b.totalCoverageMinorUnits - a.totalCoverageMinorUnits);

  const claimsMissingDocuments = allClaims.filter(
    (claim) => claim.documentCount === 0,
  );

  const waitingPeriodMilestones: WaitingPeriodMilestone[] = allWaitingPeriods
    .map((waitingPeriod) => ({
      ...waitingPeriod,
      milestoneStatus: isWaitingPeriodPassed(
        waitingPeriod.milestoneDate,
        asOfDate,
      )
        ? ("passed" as const)
        : isWaitingPeriodMilestoneUpcoming(
              waitingPeriod.milestoneDate,
              asOfDate,
            )
          ? ("upcoming" as const)
          : ("later" as const),
    }))
    .sort((a, b) => a.milestoneDate.localeCompare(b.milestoneDate));

  return {
    currencyCode,
    asOfDate,
    activePolicyCount: activePolicies.length,
    totalAnnualPremiumMinorUnits,
    upcomingRenewals,
    expiredPolicies,
    peopleWithoutRecordedHealthCoverage,
    coverageByPerson,
    claimsMissingDocuments,
    waitingPeriodMilestones,
  };
}
