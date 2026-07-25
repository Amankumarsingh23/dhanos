import type { ReactNode } from "react";
import { formatPercentage } from "@/lib/money";
import { InsightCard, InsufficientDataCard } from "./insight-card";
import type { LearningInsightKey } from "./content";
import type { LearningInsights } from "./queries";

type InsightPresentation = {
  title: string;
  render: () => ReactNode;
};

/**
 * One rendering per LearningInsightKey (PROMPT 38's six named
 * personalization sources), shared by the Money Classroom hub (all six) and
 * a topic detail page (just the one relevant key) so the two never drift
 * in wording or formatting.
 */
function presentInsight(
  key: LearningInsightKey,
  insights: LearningInsights,
): InsightPresentation {
  switch (key) {
    case "fixedCommitmentsRatio": {
      const insight = insights.fixedCommitmentsRatio;
      return {
        title: "Fixed commitments (share of income)",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Fixed commitments (share of income)"
              value={formatPercentage(insight.ratio)}
              caption="Active loan EMIs + active recurring expense commitments, ÷ average monthly income (trailing 3 months)."
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Fixed commitments (share of income)"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
    case "emergencyFundCoverage": {
      const insight = insights.emergencyFundCoverage;
      return {
        title: "Emergency-fund coverage",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Emergency-fund coverage"
              value={`${insight.monthsOfCoverage.toFixed(1)} months`}
              caption={`Target: ${insight.coverageTargetMonths} months.`}
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Emergency-fund coverage"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
    case "platformConcentration": {
      const insight = insights.platformConcentration;
      return {
        title: "Concentration on one platform",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Concentration on one platform"
              value={formatPercentage(insight.shareOfPortfolio)}
              caption={`${insight.topPlatformLabel} is the largest platform in the portfolio, by current value.`}
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Concentration on one platform"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
    case "debtToIncomeRatio": {
      const insight = insights.debtToIncomeRatio;
      return {
        title: "Debt-to-income ratio",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Debt-to-income ratio"
              value={formatPercentage(insight.ratio)}
              caption="Active loan EMIs ÷ average monthly income (trailing 3 months)."
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Debt-to-income ratio"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
    case "insuranceRenewalStatus": {
      const insight = insights.insuranceRenewalStatus;
      return {
        title: "Insurance renewal status",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Insurance renewal status"
              value={`${insight.dueSoonCount} of ${insight.activePolicyCount} due soon`}
              caption="Active policies whose renewal/expiry date falls within the next 30 days."
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Insurance renewal status"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
    case "investmentContributionRate": {
      const insight = insights.investmentContributionRate;
      return {
        title: "Investment contribution rate",
        render: () =>
          insight.available ? (
            <InsightCard
              title="Investment contribution rate"
              value={formatPercentage(insight.rate)}
              caption="Investment contributions ÷ average monthly income (trailing 3 months)."
              sourceHrefs={insight.sourceHrefs}
            />
          ) : (
            <InsufficientDataCard
              title="Investment contribution rate"
              reason={insight.reason}
              sourceHrefs={insight.sourceHrefs}
            />
          ),
      };
    }
  }
}

const ALL_INSIGHT_KEYS: readonly LearningInsightKey[] = [
  "fixedCommitmentsRatio",
  "emergencyFundCoverage",
  "platformConcentration",
  "debtToIncomeRatio",
  "insuranceRenewalStatus",
  "investmentContributionRate",
];

/** All six personalized insights, grid-laid-out — the Money Classroom hub's top panel. */
export function LearningInsightsPanel({
  insights,
}: {
  insights: LearningInsights;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ALL_INSIGHT_KEYS.map((key) => (
        <div key={key}>{presentInsight(key, insights).render()}</div>
      ))}
    </div>
  );
}

/** Just the one insight relevant to a topic — rendered inline on a topic detail page. */
export function LearningInsightSingle({
  insightKey,
  insights,
}: {
  insightKey: LearningInsightKey;
  insights: LearningInsights;
}) {
  return <>{presentInsight(insightKey, insights).render()}</>;
}
