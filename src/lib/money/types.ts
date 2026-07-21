/**
 * A money value is always the pair (amount, currency) — never a bare number.
 * See docs/money-calculation-rules.md §1.
 *
 * `amountMinorUnits` is a plain integer, not a `bigint`. Postgres stores the
 * authoritative value as `bigint` for headroom, but at the application layer
 * a `number` is used deliberately: personal-finance amounts never approach
 * `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991 minor units), and plain
 * integers serialize cleanly across Server Component/JSON boundaries where
 * `bigint` does not.
 */
export type Money = {
  readonly amountMinorUnits: number;
  readonly currencyCode: string;
};
