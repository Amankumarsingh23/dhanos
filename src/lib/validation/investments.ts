import { z } from "zod";

/**
 * Shared vocabulary for the investment domain (PROMPT 16's tables) —
 * split out from any one feature's validation file since asset_class is
 * referenced both when creating an investment_assets row directly and
 * (PROMPT 17) when creating a new asset inline from the SIP dialog.
 */

export const investmentAssetClassSchema = z.enum([
  "mutual_fund",
  "stock",
  "etf",
  "bond",
  "fixed_deposit",
  "recurring_deposit",
  "gold",
  "digital_gold",
  "ppf",
  "epf",
  "nps",
  "crypto",
  "staking",
  "private_business",
  "private_lending",
  "real_estate",
  "other",
]);
export type InvestmentAssetClass = z.infer<typeof investmentAssetClassSchema>;

export const INVESTMENT_ASSET_CLASS_LABELS: Record<
  InvestmentAssetClass,
  string
> = {
  mutual_fund: "Mutual fund",
  stock: "Stock",
  etf: "ETF",
  bond: "Bond",
  fixed_deposit: "Fixed deposit",
  recurring_deposit: "Recurring deposit",
  gold: "Gold",
  digital_gold: "Digital gold",
  ppf: "PPF",
  epf: "EPF",
  nps: "NPS",
  crypto: "Crypto",
  staking: "Staking",
  private_business: "Private business",
  private_lending: "Private lending",
  real_estate: "Real estate investment",
  other: "Other",
};
