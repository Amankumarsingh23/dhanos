# DhanOS — Shared Financial Data Architecture

Status: **implemented (shared layer only)**. This document specifies the standard mutation and query patterns every financial feature module (accounts, transactions, recurring rules, and everything still planned in [database-plan.md](./database-plan.md) §3) must build on. It complements [architecture.md](./architecture.md) §5 (data flow) and [security-model.md](./security-model.md) §3 (authorization) rather than replacing them. No feature module has been wired up to this layer yet — see [implementation-status.md](./implementation-status.md).

## 1. The mutation process

Every financial mutation (a Server Action that writes household data) must go through these eight steps, in order:

1. **Resolve authenticated user.**
2. **Resolve household authorization** — re-check the *submitted* `household_id` against the database and the caller's role, never trust it because it was submitted (see [security-model.md](./security-model.md) §6, IDOR).
3. **Validate input** against an explicit zod schema (allow-listed fields only — never spread a raw client payload into an insert/update; see §6, mass assignment).
4. **Normalize money** — convert user-facing decimal input to integer minor units via [src/lib/money](../src/lib/money) before it touches a query; never pass a decimal/float amount to Supabase.
5. **Perform atomic writes where required** — see §1.1 below.
6. **Create an activity event** — a row in `activity_events` describing what happened (see [database-plan.md](./database-plan.md) §3, "Operations").
7. **Revalidate affected pages** — `revalidatePath` for every Server Component route the write could have changed.
8. **Return a typed safe result** — an `ActionResult<T>`, never a thrown error and never a raw database error message (see §4).

### 1.1 Atomic writes

A single-table write (including a bulk multi-row insert to one table, e.g. several `transaction_splits` in one request) is already atomic under PostgREST — one HTTP request is one SQL statement/transaction. A write that must span **more than one table** (e.g. inserting a `transaction` together with its initial `transaction_splits`, or a `financial_account` together with its opening `account_balance_snapshot`) is **not** atomic across two separate REST calls — a failure between them leaves a partial write. Such a mutation must go through a `SECURITY INVOKER` Postgres RPC function (the same pattern as `get_or_create_household()`, see `supabase/migrations/20260721051051_household_memberships.sql`) that performs both inserts in one `plpgsql` transaction, still running as the calling user so RLS applies exactly as it would to a direct client write.

### 1.2 `runHouseholdMutation`

[src/lib/mutations/index.ts](../src/lib/mutations/index.ts) implements steps 1, 2, 3, 6, 7, and 8 generically:

```ts
const result = await runHouseholdMutation({
  householdId,
  allowedRoles: ["owner", "admin", "editor"],
  schema: createExpenseSchema,
  input: rawFormInput,
  run: async ({ supabase, householdId, input }) => {
    // step 4: input.amount is already integer minor units (validated by
    // the schema using amountMinorUnitsSchema, or parsed upstream with
    // parseDecimalToMinorUnits) — normalize/derive anything else here.
    // step 5: a single insert, or an RPC call for a multi-table write.
    const { data, error } = await supabase
      .from("transactions")
      .insert({ ...input, household_id: householdId })
      .select()
      .single();
    if (error) throw mapSupabaseError(error);
    return data;
  },
  activityEvent: ({ output }) => ({
    householdId,
    eventType: "transaction.created",
    entityType: "transaction",
    entityId: output.id,
  }),
  revalidatePaths: ["/app/expenses", "/app/dashboard"],
});
```

`run` receives `{ user, membership, supabase, householdId, input }` — the already-authorized user/membership, a request-scoped Supabase client, and the already-validated, typed input. Its return value becomes `ActionResult.data` on success. `activityEvent` is optional and receives `{ input, output }`; return `null` to skip logging that particular call. Every path — a validation failure, a `requireHouseholdRole` rejection, or anything `run`/`activityEvent` throws — is converted through `toUserMessage()` before it reaches the returned `ActionResult`, so a raw `PostgrestError`/driver message can never leak to the client (see §4).

## 2. The query contract

Every list query against a household-scoped table must be:

- **Household scoped** — `.eq("household_id", householdId)` (or [`scopeToHousehold`](../src/lib/queries/pagination.ts)) before any other filter. RLS is the actual enforcement point; this is the redundant application-layer scoping [security-model.md](./security-model.md) §3 calls for, so an accidentally-unscoped query fails fast with an obviously-wrong result rather than silently relying on RLS alone.
- **Paginated** — every list query goes through [`parsePagination`](../src/lib/queries/pagination.ts) → [`toOverfetchRange`](../src/lib/queries/pagination.ts) (a `.range()` call), never an unbounded `.select()`. `MAX_PAGE_SIZE` (100) is a hard ceiling a caller cannot exceed.
- **Deterministically ordered** — [`applyDeterministicOrder`](../src/lib/queries/pagination.ts) orders by the caller's chosen column *plus* a stable tiebreaker (`id` by default). A single non-unique sort column (e.g. `transaction_date` alone, where multiple transactions share a date) can otherwise return rows in a different relative order across pages, silently duplicating or skipping a row at the page boundary.
- **Free of unbounded transaction loads** — a direct consequence of the two rules above: no query path may fetch "every transaction for this household" with no range at all. Dashboard aggregates (totals, sums) belong in a dedicated aggregate query/view (or a Postgres function), not a full unbounded row fetch reduced client-side.
- **Free of unnecessary columns** — list queries `.select()` an explicit column list, never `select("*")`; a masked account identifier or a document's storage path, for instance, should not ride along on a query that only needs a display name.
- **Free of cross-user caching** — no household query result is ever cached (`unstable_cache`, a Next.js `fetch` cache directive, a shared in-memory/module-level cache) keyed on anything less specific than the household id *and* verified membership; Server Components reading Supabase directly under RLS is the default and default-correct path (see [architecture.md](./architecture.md) §5) — do not introduce a cache layer for a financial query without first checking it cannot be shared across two different households' requests.
- **Explicit about archived records** — [`applyArchivedFilter`](../src/lib/queries/pagination.ts) makes "include archived/closed/inactive rows or not" a parameter every list query call site must pass, rather than an implicit default that's easy to get wrong in either direction (silently hiding a closed account from a historical report, or silently surfacing it in an active-accounts picker).

## 3. Money and date utilities

See [src/lib/money](../src/lib/money) and [src/lib/dates](../src/lib/dates) (both fully unit-tested — see their `*.test.ts` files) for:

- **Money**: `createMoney`, `addMoney`/`subtractMoney` (currency-mismatch rejection built in — see [money-calculation-rules.md](./money-calculation-rules.md) §1), `parseDecimalToMinorUnits` (user decimal input → minor units, strict format rejection), `formatMoney`/`formatPercentage` (display only, never fed back into a calculation), `calculateRatio` (returns 0 rather than NaN/Infinity for a zero denominator), `allocateMoney` (largest-remainder split across weighted shares, always reconciling exactly to the total — see `transaction_splits`' own DB-level version of this same invariant in `supabase/migrations/20260721060007_transaction_splits.sql`).
- **Dates**: `toIsoDateString` (storage) and its semantic aliases `toTransactionDateString`/`toDueDateString`/`toValuationDateString`; `toMonthKey` (timezone-aware `YYYY-MM`, since a household's financial month is computed in *its* timezone, not UTC or the server's); `resolveTimeZone`/`DEFAULT_TIMEZONE`; `createStatementPeriod`. [src/lib/validation/primitives.ts](../src/lib/validation/primitives.ts) has the matching branded zod schemas (`transactionDateSchema`, `dueDateSchema`, `valuationDateSchema`, `monthKeySchema`) for validating these same strings coming back in as input — branded so a valuation date can't be passed where a due date is expected without the compiler objecting, even though both are plain `YYYY-MM-DD` strings at runtime.

## 4. No raw database errors

`toUserMessage()` ([src/lib/errors/app-error.ts](../src/lib/errors/app-error.ts)) is the backstop: any thrown value that isn't an `AppError` becomes the generic "Something went wrong. Please try again." — so even a feature author who forgets to call `mapSupabaseError()` on a Postgrest error inside `run` cannot leak a raw constraint-violation or driver message through `runHouseholdMutation`. Feature code should still call `mapSupabaseError()` itself for *specific* safe messages (e.g. "not found" vs. a generic failure) — the backstop exists for what's missed, not as a substitute for it. See [src/lib/mutations/index.test.ts](../src/lib/mutations/index.test.ts) for the test proving a raw constraint-violation message never reaches the returned `ActionResult`.

## 5. What's not yet built

This document specifies the shared layer only. No feature module (accounts, transactions, recurring rules, etc.) has been wired up to `runHouseholdMutation`/the query helpers yet — that begins once a concrete module (see [implementation-status.md](./implementation-status.md) §3, "Core ledger") is built against the schema from [financial-domain-model.md](./financial-domain-model.md).
