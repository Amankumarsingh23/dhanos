# DhanOS — Observability

Status: **implemented**. Production diagnostics (PROMPT 50): server error logging, a client error boundary, request correlation IDs, environment/release identifiers, a safe health route, and dedicated logging for upload/import/calculation/authorization/scheduled-reminder failures. Complements [security-model.md](./security-model.md) (attack surface) and [privacy-model.md](./privacy-model.md) (data governance) rather than replacing either — this document is about *operating* the app once it's live, not about what data it collects or how it's protected at rest.

## 1. Where the code lives

Everything is under [src/lib/observability/](../src/lib/observability/):

| File | Purpose |
|---|---|
| `environment.ts` | `getEnvironment()` / `getRelease()` — see §4 |
| `constants.ts` | `REQUEST_ID_HEADER`, deliberately import-free (no `next/headers`) so `src/lib/supabase/middleware.ts` can use it from the Edge runtime — see §3 |
| `request-id.ts` | `getRequestId()` — reads the correlation ID for the current request |
| `logger.ts` | `logError()` / `logEvent()` / `redact()` — the structured logger every other piece writes through |
| `report-action-error.ts` | `reportActionError()` — the Server Action catch-block helper (see §2) |
| `client-error-report.ts` | The zod schema bounding what the client error boundary is allowed to report |
| `actions.ts` | `reportClientErrorAction()` — the Server Action the client error boundary calls |

Plus: `src/app/error.tsx` / `src/app/global-error.tsx` (§5), `src/app/api/health/route.ts` (§6).

## 2. Server error logging

Every Server Action in this app returns an `ActionResult` rather than throwing across the client/server boundary (see [data-access-patterns.md](./data-access-patterns.md) §1.2/§4) — a caught error is converted to a safe user-facing string via `toUserMessage()`. Logging is wired into that exact same choke point:

- **`runHouseholdMutation`** (`src/lib/mutations/index.ts`) — the standard 8-step mutation pipeline nearly every feature module builds on — logs any error its `run`/`activityEvent`/authorization step throws before converting it, via `reportActionError(error, options.actionName ?? "household_mutation", { householdId })`.
- **The ~20 remaining Server Actions with their own manual `try/catch`** (a shape used when there's no single request schema to validate, or a multi-step flow — e.g. `imports.commit_batch`'s chunked writes, `reminders.sync`'s regeneration, the household export actions) call `reportActionError(error, "<action>", context)` directly in place of the old bare `toUserMessage(error)`.

`reportActionError` (`src/lib/observability/report-action-error.ts`) is a drop-in: it logs via `logError()` and returns the exact same safe string `toUserMessage()` always produced, so no calling code's user-facing behavior changed — only that every failure now also produces a structured log line.

**Finding a deliberate test error**: throw anything (`throw new Error("test")`) inside a Server Action's `run`, hit the action from the running app, and grep the process's stdout/stderr (or your log aggregator) for the action's event name (e.g. `"event":"documents.upload"`) or the `requestId` value returned in the `x-request-id` response header for that request (see §3) — the log line has both, plus the full error name/message and a timestamp.

### Severity

`logError()` derives a level from the error itself (`src/lib/observability/logger.ts`):

| Error | Level | Why |
|---|---|---|
| `ValidationError` / `NotFoundError` / `ConflictError`-shaped / `RateLimitError` | `info` | Expected, routine user-facing rejections — not a bug, not alert-worthy |
| `PermissionDeniedError` | `warn` | "Authorization failure monitoring" (see §7) — worth watching for a pattern, not every single one a page |
| Anything else (an unmapped `AppError`, or a raw thrown bug) | `error` | Unexpected — this is what a deliberate test error, a calculation bug, or a real outage looks like |

### What's logged, structurally

`LogContext` (`logger.ts`) is a flat `Record<string, string | number | boolean | null | undefined>` — never a nested object or array. That shape is deliberate: a caller can only pass individually-named primitive fields (IDs, counts, codes), which makes it structurally awkward to accidentally forward a whole financial record, a raw Supabase row, or free text a user typed. Every call site in this codebase only ever passes IDs (`householdId`, `transactionId`, `attachmentId`, ...) — never a description, note, filename, or amount.

For the error itself, only `error.name`/`error.message` (and, if present, `cause.name`/`cause.message`) are logged — never the full arbitrary `cause` object. An `AppError`'s `.message` is already the same safe string shown in the UI (see `src/lib/errors/app-error.ts`); `cause` is the underlying driver error (e.g. a `PostgrestError` from `mapSupabaseError`), useful server-side for debugging but never rendered to a user. Both strings are passed through `redact()` first (see §8) as a defense-in-depth backstop, in case an underlying driver error happens to echo back a value it shouldn't.

## 3. Request correlation ID

`src/lib/supabase/middleware.ts` (`updateSession`, run on every request via `src/proxy.ts`) generates a fresh `crypto.randomUUID()` per request — never derived from anything client-supplied, so it can't be spoofed into logs — and:

- Sets it as a request header (`x-request-id`) on the request Next.js hands to the rest of the app, so `getRequestId()` (`src/lib/observability/request-id.ts`, via `next/headers`'s `headers()`) can read it from any Server Component, Server Action, or Route Handler downstream in the same request.
- Sets it as a response header on every response the middleware returns (including redirects), so a caller — a browser dev tools Network tab, an API client, a support ticket — has a concrete ID to correlate with a log line.

Every `logError()`/`logEvent()` call includes this ID automatically. If middleware didn't run for some reason (e.g. a unit test calling a Server Action directly), `getRequestId()` falls back to a fresh random ID rather than failing — every log line still gets *a* stable ID.

## 4. Environment and release identifiers

`src/lib/observability/environment.ts`:

- **`getEnvironment()`** returns `"production" | "preview" | "development" | "test"`. Prefers Vercel's own `VERCEL_ENV` (set automatically on every Vercel deploy — no config needed there, and it's exactly `production`/`preview`/`development`); falls back to an explicit `APP_ENV` env var for any other host (see `.env.example`), then `NODE_ENV`. **This is the "monitoring distinguishes preview and production" mechanism** — every log line and the health route both carry it.
- **`getRelease()`** returns a release identifier — Vercel's `VERCEL_GIT_COMMIT_SHA` (automatic), falling back to an explicit `RELEASE_ID`, then `"local"`.

Both are read fresh on every call (never cached at module load), so a single running process can't get "stuck" on a stale value if the environment were somehow reconfigured.

## 5. Client error boundary

`src/app/error.tsx` catches any render error below the root layout that no page-level handling already caught. `src/app/global-error.tsx` is the required Next.js companion for an error thrown *in* the root layout itself (`src/app/error.tsx` can't catch its own parent) — per Next.js's contract it renders its own `<html>`/`<body>` and deliberately avoids any shared provider/component, since those could be the very thing that just failed.

Both:

- Show a fixed, safe fallback message — **never `error.message` itself**, since that's an arbitrary string from wherever the `throw` happened and might echo back something it shouldn't. A reference code (`error.digest` — the ID Next.js itself already generates for a server-rendering error — or a freshly generated one for a client-thrown error) is shown instead, so a user has something concrete to quote to support.
- Report the error server-side via `reportClientErrorAction` (`src/lib/observability/actions.ts`), which re-derives the signed-in user (if any) and calls `logError("client.render_error", ...)` — so a client-side failure a real user hit is captured the same way a server-side one is, not just shown-and-forgotten. The reported payload (`src/lib/observability/client-error-report.ts`) is a narrow, length-capped zod schema (`message`, optional `digest`, `pathname`) — reporting itself can never throw back to the caller.
- Offer "Try again" (`reset()`), which re-renders the failed segment without a full page reload.

## 6. Safe health route

`GET /api/health` (`src/app/api/health/route.ts`) — unauthenticated (see the `/api/` skip in `src/lib/supabase/middleware.ts`, so an uptime monitor never gets redirected to `/login`), returns:

```json
{ "status": "ok", "environment": "production", "release": "abc1234", "timestamp": "...", "durationMs": 4 }
```

`status` is `"degraded"` (HTTP 503) if a lightweight Supabase connectivity check fails. The check hits PostgREST's own root endpoint (`{SUPABASE_URL}/rest/v1/`, its publicly-served OpenAPI schema) with just the publishable key — **never a table query**: this schema's tables intentionally grant the `anon` Postgres role no privileges at all (defense in depth beyond RLS — confirmed live via `\dp households`: `anon` carries no `r`/SELECT bit, only `authenticated` does), so a health check that queried a table anonymously would either always read as "degraded" or would need its own special-cased anon grant carved out of that posture purely for a monitoring convenience. Hitting PostgREST's root avoids that tradeoff entirely — it proves Supabase is reachable and answering without touching any tenant table or its grants. **"Safe" here means**: no session/household context, no financial data, no internal error detail (a failed check is logged server-side via `logError`, not returned in the response body), and no dependency/version strings that would help an attacker fingerprint the stack.

## 7. Authorization failure monitoring

`requireHouseholdMember`/`requireHouseholdRole` (`src/lib/households/permissions.ts`) are the sole data-layer authorization gate (see [security-model.md](./security-model.md) §3/§6) — every household-scoped Server Action calls one of them, either directly inside its own `try/catch` or via `runHouseholdMutation`. Both paths funnel through §2's logging, so every `PermissionDeniedError` (a confirmed member whose role isn't allowed) is automatically logged at `warn` (see the severity table above) with the `householdId` — distinguishable from routine `NotFoundError`s (a non-member, or a bad ID — both intentionally the *same* error, so probing which is true isn't possible from the outside) at `info`. Filtering server logs for `"level":"warn"` and `"errorCode":"permission_denied"` surfaces every authorization rejection across the app from one query.

## 8. Upload / import / calculation failure logging

These aren't separate subsystems — they're the same `reportActionError`/`runHouseholdMutation` logging from §2, applied at the specific action names below (grep the codebase for these to find the exact call site):

- **Upload**: `documents.upload` (`src/features/documents/actions.ts`), `assets.attach_document` (`src/features/assets/actions.ts`).
- **Import**: `imports.prepare_upload`, `imports.create_batch`, `imports.commit_batch`, `imports.rollback` (`src/features/imports/actions.ts`).
- **Calculation**: any thrown error inside a `runHouseholdMutation`'s `run` — e.g. a pure calculation in `src/lib/calculations/*` that throws on an invalid state — is caught and logged the same way, at whatever `actionName` that mutation declared.
- **Scheduled reminder**: `reminders.sync` — both the manual "Refresh" button (`syncRemindersAction`) and the best-effort regeneration `src/app/(workspace)/app/reminders/page.tsx` runs on every page load. The page-load path used to silently swallow a failure (`.catch(() => {})`, on the reasoning that a stale calendar beats a broken page); it still never fails the page, but the failure is now logged instead of discarded.

## 9. What is never logged

Enforced partly by mechanism (§2's flat `LogContext` type, `redact()`), partly by discipline at each call site — reviewed here explicitly since "logs do not contain sensitive financial content" is an acceptance criterion, not just a convention:

| Never logged | How |
|---|---|
| Full account identifiers | Only opaque UUIDs (`accountId`, `assetId`, ...) are ever passed as context — never a masked/real account number, which the app doesn't even store server-readable per [security-model.md](./security-model.md) §5 |
| Policy documents / uploaded file contents | Only Storage *paths*/attachment IDs ever appear in code that touches logging — the file bytes never pass through any observability code at all (browser uploads directly to Storage, see [data-access-patterns.md](./data-access-patterns.md)) |
| Medical details | Insurance claim actions (`src/features/insurance/claims-actions.ts`) log only `claimId`/`attachmentId` — never claim notes/description fields |
| Transaction descriptions | Transaction/expense/recurring actions never pass `description`/`notes`/`counterparty` fields into a log context — only IDs |
| Authentication tokens | `redact()` strips a `Bearer ...` prefix and any JWT-shaped string as a backstop; no code path logs a session/cookie value to begin with |
| Signed URLs | Every action that generates one (`documents.get_download_url`, `assets.get_document_url`, `insurance.get_claim_document_url`, `expenses.get_receipt_url`) explicitly logs only the *attachment/document ID*, never the returned URL — see the `// Never log \`url\` itself` comment at each of those catch blocks |

## 10. Adding a new action's logging

For a `runHouseholdMutation` call: pass `actionName: "feature.verb"` (dot-namespaced, matching the table in §8) — it's optional, defaults to the generic `"household_mutation"` label if omitted, so nothing breaks by not setting it, but a specific label makes a future deliberate test error easier to find. For a manual `try/catch`, replace `actionError(toUserMessage(error))` with `actionError(reportActionError(error, "feature.verb", { /* IDs only */ }))`. Never add a free-text field (a name, note, description, filename) to the `context` object — see §9.
