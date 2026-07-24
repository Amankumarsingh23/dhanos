import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  CLAIM_STATUS_LABELS,
  type ClaimStatus,
} from "@/lib/validation/insurance";
import type { InsuranceDashboardData } from "./dashboard-queries";

type InsuranceDashboardProps = {
  data: InsuranceDashboardData;
};

export function InsuranceDashboard({ data }: InsuranceDashboardProps) {
  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: data.currencyCode });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Active policies"
          amount={String(data.activePolicyCount)}
          caption="In your base currency"
          href="/app/insurance"
        />
        <SummaryCard
          title="Total annual premium"
          amount={money(data.totalAnnualPremiumMinorUnits)}
          caption="Active policies, normalized to yearly"
        />
        <SummaryCard
          title="Upcoming renewals"
          amount={String(data.upcomingRenewals.length)}
          caption="Within 30 days"
        />
        <SummaryCard
          title="Expired policies"
          amount={String(data.expiredPolicies.length)}
          caption="Status marked expired"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Upcoming renewals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingRenewals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing due for renewal in the next 30 days.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {data.upcomingRenewals.map((policy) => (
                  <li
                    key={policy.id}
                    className="flex items-center justify-between py-2"
                  >
                    <Link
                      href={`/app/insurance/${policy.id}`}
                      className="font-medium hover:underline"
                    >
                      {policy.name}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      Due{" "}
                      {formatDisplayDate(
                        policy.renewal_date ?? policy.expiry_date ?? "",
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Expired policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.expiredPolicies.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No policies currently marked expired.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {data.expiredPolicies.map((policy) => (
                  <li
                    key={policy.id}
                    className="flex items-center justify-between py-2"
                  >
                    <Link
                      href={`/app/insurance/${policy.id}`}
                      className="font-medium hover:underline"
                    >
                      {policy.name}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      Expired{" "}
                      {policy.expiry_date
                        ? formatDisplayDate(policy.expiry_date)
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            People without recorded health coverage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertDescription>
              This means no active health policy is tracked for them in DhanOS —
              it is not proof that they are actually uninsured. They may be
              covered by a policy that simply hasn&rsquo;t been added here yet,
              or by an employer/group policy outside this app.
            </AlertDescription>
          </Alert>
          {data.peopleWithoutRecordedHealthCoverage.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Every household member has an active health policy tracked here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.peopleWithoutRecordedHealthCoverage.map((person) => (
                <Badge key={person.id} variant="outline">
                  {person.displayName}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Total coverage by person
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.coverageByPerson.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active policies with insured people yet.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {data.coverageByPerson.map((row) => (
                <li
                  key={row.personId}
                  className="flex items-center justify-between py-2"
                >
                  <span>{row.displayName}</span>
                  <span className="font-medium">
                    {money(row.totalCoverageMinorUnits)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Claims missing documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.claimsMissingDocuments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Every claim has at least one supporting document attached.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {data.claimsMissingDocuments.map((claim) => (
                <li
                  key={claim.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    href={`/app/insurance/${claim.policy_id}`}
                    className="font-medium hover:underline"
                  >
                    {claim.policyName} — {claim.insuredPersonName}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {CLAIM_STATUS_LABELS[claim.status as ClaimStatus]} · filed{" "}
                    {formatDisplayDate(claim.claim_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Waiting-period milestones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.waitingPeriodMilestones.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No structured waiting periods added yet — add one from a health
              policy&rsquo;s detail page.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {data.waitingPeriodMilestones.map((milestone) => (
                <li
                  key={milestone.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    href={`/app/insurance/${milestone.policyId}`}
                    className="font-medium hover:underline"
                  >
                    {milestone.policyName} — {milestone.label}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      Ends {formatDisplayDate(milestone.milestoneDate)}
                    </span>
                    {milestone.milestoneStatus === "passed" && (
                      <Badge variant="secondary">Passed</Badge>
                    )}
                    {milestone.milestoneStatus === "upcoming" && (
                      <Badge variant="outline">Coming up</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
