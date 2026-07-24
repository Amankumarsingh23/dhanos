import { AlertCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { StaleDataIndicator } from "@/components/shared/stale-data-indicator";
import { formatMoney } from "@/lib/money";
import { INVESTMENT_ASSET_CLASS_LABELS } from "@/lib/validation/investments";
import type { PortfolioHoldingRow } from "./queries";

const LIQUIDITY_LABELS: Record<PortfolioHoldingRow["liquidity"], string> = {
  liquid: "Liquid",
  semi_liquid: "Semi-liquid",
  illiquid: "Illiquid",
};

const RISK_LABELS: Record<PortfolioHoldingRow["risk"], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

/**
 * Read-only holdings table — every core per-holding metric from PROMPT
 * 18, plus a visible flag for a missing or stale valuation (acceptance
 * criterion: "missing valuations are shown as stale or incomplete", never
 * silently treated as zero/current). Liquidity/risk badges are a simple
 * descriptive default, not advice — see
 * src/lib/calculations/portfolio-performance.ts's classification comment.
 */
export function HoldingsTable({
  holdings,
}: {
  holdings: readonly PortfolioHoldingRow[];
}) {
  if (holdings.length === 0) {
    return (
      <EmptyState
        title="No holdings yet"
        description="Holdings appear here once an investment_holdings row exists (e.g. from setting up a SIP) and has recorded activity."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Holding</th>
            <th className="px-4 py-2.5 font-medium">Platform</th>
            <th className="px-4 py-2.5 font-medium">Contributed</th>
            <th className="px-4 py-2.5 font-medium">Current value</th>
            <th className="px-4 py-2.5 font-medium">Realized</th>
            <th className="px-4 py-2.5 font-medium">Unrealized</th>
            <th className="px-4 py-2.5 font-medium">Income</th>
            <th className="px-4 py-2.5 font-medium">Fees</th>
            <th className="px-4 py-2.5 font-medium">Liquidity / risk</th>
            <th className="px-4 py-2.5 font-medium">Valuation</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {holdings.map((holding) => (
            <tr key={holding.investmentHoldingId}>
              <td className="px-4 py-2.5 font-medium">
                {holding.assetName}
                <span className="text-muted-foreground block text-xs font-normal">
                  {INVESTMENT_ASSET_CLASS_LABELS[holding.assetClass]}
                </span>
              </td>
              <td className="px-4 py-2.5">{holding.platformName}</td>
              <td className="px-4 py-2.5">
                <SensitiveAmount
                  value={money(
                    holding.costBasis.totalContributedMinorUnits,
                    holding.currencyCode,
                  )}
                />
              </td>
              <td className="px-4 py-2.5">
                {holding.hasValuation ? (
                  <SensitiveAmount
                    value={money(
                      holding.currentValueMinorUnits ?? 0,
                      holding.currencyCode,
                    )}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <SensitiveAmount
                  value={money(
                    holding.costBasis.realizedGainLossMinorUnits,
                    holding.currencyCode,
                  )}
                />
              </td>
              <td className="px-4 py-2.5">
                {holding.unrealizedGainLossMinorUnits !== null ? (
                  <SensitiveAmount
                    value={money(
                      holding.unrealizedGainLossMinorUnits,
                      holding.currencyCode,
                    )}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <SensitiveAmount
                  value={money(
                    holding.costBasis.incomeReceivedMinorUnits,
                    holding.currencyCode,
                  )}
                />
              </td>
              <td className="px-4 py-2.5">
                <SensitiveAmount
                  value={money(
                    holding.costBasis.totalFeesMinorUnits,
                    holding.currencyCode,
                  )}
                />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">
                    {LIQUIDITY_LABELS[holding.liquidity]}
                  </Badge>
                  <Badge variant="outline">{RISK_LABELS[holding.risk]}</Badge>
                </div>
              </td>
              <td className="px-4 py-2.5">
                {holding.hasValuation && holding.latestValuationDate ? (
                  <StaleDataIndicator
                    asOf={holding.latestValuationDate}
                    staleAfterHours={45 * 24}
                  />
                ) : (
                  <Badge variant="destructive">
                    <AlertCircleIcon />
                    No valuation
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
