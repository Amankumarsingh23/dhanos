# DhanOS — Target Architecture

Status: **proposed**. The repository is currently empty — there is no existing framework, package manager, routing, layout, theme, or component code to inspect. Everything below is a recommendation for the architecture to build, not a description of what exists. When actual visual-design assets from Claude Design arrive (component library, theme tokens, Figma/exported code), reconcile them against section 4 before writing any UI code.

## 1. Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Server + client components in one framework, good fit for a data-heavy dashboard app with mixed public (auth) and private (workspace) routes |
| Package manager | pnpm | Fast, disk-efficient, workspace-ready if this later splits into multiple packages |
| Backend/data | Supabase (Postgres + Auth + Storage + Row Level Security) | Explicitly named in the inspection scope; gives auth, relational storage, file storage, and RLS-based multi-tenant isolation without standing up separate services |
| Styling | Tailwind CSS + a component primitive layer (e.g. shadcn/ui as scaffolding) | Utility CSS pairs well with a design-token based theme; shadcn-style primitives are easy to re-skin once Claude Design's actual components/tokens are available — do not treat the scaffold as final visual design |
| Forms | react-hook-form + zod | Schema-first validation that can be shared between client-side form validation and server-side input validation (same zod schema, two enforcement points) |
| Money math | integer minor units in Postgres (`bigint`) + a decimal library (e.g. `dinero.js`/`decimal.js`, no native float math) in TypeScript for any pre-submission arithmetic | See [money-calculation-rules.md](./money-calculation-rules.md) |
| Dates | `date-fns` (+ explicit UTC storage, locale/timezone at display layer) | Lightweight, tree-shakeable; avoid ambiguous local-time storage |
| Charts | Recharts for standard dashboard charts (net worth trend, allocation, cash flow); escalate to visx/d3 only if a specific chart needs custom interaction Recharts can't do | Keep charting library count to one unless proven necessary |
| Testing | Vitest + React Testing Library (unit/component), Playwright (e2e), SQL-level constraint tests against a local Supabase instance | Constraint tests matter more than usual here because money correctness is enforced partly at the DB layer |
| Deployment | Vercel (app) + Supabase Cloud (Postgres/Auth/Storage) | Standard pairing for this stack; environment variables managed per-environment in each platform, never committed |

This is a recommendation, not a locked decision — flag before implementation if there's a reason to deviate (e.g. if Claude Design's exported code assumes a different framework).

## 2. Repository structure (proposed)

Start as a single Next.js app. Do not pre-build a monorepo (turborepo, multiple packages) until there is a second consumer (e.g. a mobile app or background worker) that actually needs shared code — premature workspace splitting adds tooling overhead with no current benefit.

```
dhanos/
  app/                        # Next.js App Router
    (auth)/                   # sign-in, sign-up, password reset — public routes
    (workspace)/              # authenticated app shell
      dashboard/
      accounts/
      income/
      expenses/
      transfers/
      recurring/
      investments/
      sips/
      staking/
      loans/
      lending/
      insurance/
      assets/                 # movable + immovable
      liabilities/
      goals/
      emergency-fund/
      net-worth/
      closing/                # monthly financial closing
      documents/
      reminders/
      reports/
      projections/
      journal/                # financial decision journal
      learn/                  # financial-literacy explanations
      settings/
        household/
        export/
    api/                      # route handlers where server actions aren't sufficient (webhooks, exports)
    layout.tsx                # root layout
  components/
    ui/                       # design-system primitives (reconcile with Claude Design output)
    charts/
    forms/
  lib/
    supabase/                 # client/server Supabase client factories
    money/                    # minor-unit + currency helpers, no float math
    dates/
    validation/                # shared zod schemas
  server/
    actions/                  # Next.js server actions, one module per domain area
    queries/                  # typed read queries
  supabase/
    migrations/               # SQL migrations (Supabase CLI)
    seed.sql
  docs/                       # this documentation set
  tests/
    unit/
    e2e/
```

## 3. Layouts

Two top-level layouts:
- **Auth layout** — minimal chrome, centered form, no workspace navigation. Used by sign-in/sign-up/reset routes.
- **Workspace shell layout** — persistent navigation (sidebar or top bar per Claude Design's pattern once available), household/workspace switcher if multiple households are supported, and a content area per module route above.

Every workspace route must resolve the active household/workspace context before rendering (server-side), and Supabase RLS must independently enforce that scoping — the UI layout is not a security boundary (see [security-model.md](./security-model.md)).

## 4. Design components

No visual design from Claude Design exists yet — the app shell (`src/components/shell/`: sidebar/mobile nav, header, command search, user menu, household selector) and privacy mode (`src/components/shared/privacy-provider.tsx`, `SensitiveAmount`) are built on the placeholder shadcn/ui theme, structurally complete but not final visual design. When Claude Design's output (component code, tokens, or Figma export) is available:
1. Inventory it against the module list in section 2 and the shell components above to identify gaps (financial-specific components like a money input, an account-balance card, a valuation trend sparkline, a loan amortization table are unlikely to be covered by a generic design pass and will need bespoke components built on the shared primitives).
2. Do not restyle or "improve" the provided visual design — treat it as authoritative for look and feel; this document only governs code structure and data flow underneath it. Reconcile the shell's placeholder styling against it rather than treating the current look as final.

## 5. Data flow pattern

- Reads: Server Components query Supabase directly (server-side client, respecting RLS) wherever possible, to avoid shipping data-fetching logic to the client. Every household-scoped list query follows the shared query contract — see [data-access-patterns.md](./data-access-patterns.md) §2 (pagination, deterministic ordering, no unbounded loads, no unnecessary columns, no cross-user caching, explicit archived-record handling).
- Writes: Next.js Server Actions per domain module (`src/features/<domain>/actions.ts`, e.g. `src/features/auth/actions.ts`), each validating input against a shared zod schema before writing, and never trusting client-computed totals for authoritative money fields. Every household-scoped mutation goes through the standard 8-step process implemented by `runHouseholdMutation` (`src/lib/mutations`) — see [data-access-patterns.md](./data-access-patterns.md) §1.
- Client state: kept minimal — form state (react-hook-form) and local UI state only. No global client-side store is needed initially; revisit only if cross-route client state becomes a real pain point.

## 6. Environment variables (planned)

At minimum:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL` — safe for client, used under RLS.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed to the client bundle, used only in trusted server contexts (e.g. scheduled jobs), audited for any usage since it bypasses RLS.
- Standard `.env.local` (gitignored) for local dev, platform-level env config for staging/production. No secrets committed at any point — add `.env*` to `.gitignore` in the first commit that creates it.
- Implemented as `src/lib/env/client.ts` (validated with zod, safe anywhere) and `src/lib/env/server.ts` (imports the `server-only` package so Next.js fails the build if a Client Component imports it — verified in the foundation build).

## 7. Testing setup (planned)

- Unit/component: Vitest + React Testing Library.
- End-to-end: Playwright against a local Supabase instance seeded with fixture data.
- DB constraints: dedicated SQL test fixtures that assert impossible states (negative balances where disallowed, mismatched currency codes, overwritten historical rows) are rejected by constraints, not just application code — see [database-plan.md](./database-plan.md) and [manual-test-checklist.md](./manual-test-checklist.md).

## 8. Deployment (planned)

Vercel project linked to the repository, Supabase Cloud project for Postgres/Auth/Storage, migrations applied via Supabase CLI as part of the deploy pipeline (not applied ad hoc against production). Preview deployments per PR against a staging Supabase project or branch database, never against production data.
