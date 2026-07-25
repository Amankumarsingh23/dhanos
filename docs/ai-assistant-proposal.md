# DhanOS — AI Financial Assistant: Privacy & Architecture Proposal

Status: **proposal only — no implementation exists, none is authorized by this document.** Per the phase gate this responds to ("do not begin until the non-AI product is production reliable... produce a separate privacy and architecture proposal before implementation"), this is that proposal. The non-AI product is feature-complete and independently audited ([version-one-release-notes.md](./version-one-release-notes.md)) but **not yet production-deployed** — no Vercel/Supabase production project exists ([deployment.md](./deployment.md)). Treat "production reliable" as met once a real deployment has been live and stable for a meaningful period, not merely once the code is ready — this proposal can be reviewed and refined in the meantime, but implementation should wait for that.

## 1. Scope — what to build first, and what to defer

Of the potential capabilities listed, prioritized by risk and by how directly they reuse data DhanOS already computes correctly:

**First tier (lowest risk — read-only, over data the app already trusts):**
- Explain cash flow (narrate an existing month's `cash_flow_transactions`/report output)
- Summarize a monthly closing (narrate an existing, already-frozen `monthly_closings` record)
- Compare projections (narrate existing calculator/goal-funding output — never compute a new projection itself)
- Identify concentration (narrate existing portfolio-allocation/platform-concentration figures, already computed by `src/lib/calculations/*`)
- Prepare questions for an adviser (pure text generation from already-visible data, no new data access pattern)

**Second tier (still read-only, but touches content the app doesn't already structure — needs more care):**
- Detect missing records (comparing what exists against what a household's own patterns suggest should exist — e.g., a recurring rule with no recent occurrence; must be framed as "you might want to check," never "you are missing X," since the assistant cannot know a household's real-world circumstances)
- Summarize insurance documents (requires document *content* access — see §5's controls before this is buildable at all)
- Extract statement data (this is bank-statement parsing's own extraction step, not a separate assistant capability — see the note at the end of this document)

**Explicitly not in scope for a first build:** anything that writes data. "Require confirmation for mutations" (the mandatory rules, §3) means even a *proposed* mutation the assistant suggests must go through the exact same `runHouseholdMutation` pipeline and the same Server Action a human-driven form would — the assistant never gets a privileged write path. A defensible first version does not attempt mutation at all; add it only after the read-only capabilities have real usage and trust behind them.

## 2. Architecture

- **Server-only, no client-side API key** — matches the existing `server-only` pattern already enforced for `SUPABASE_SERVICE_ROLE_KEY` ([security-model.md](./security-model.md) §4). A provider API key lives in `src/lib/env/server.ts`-equivalent validation, never in `NEXT_PUBLIC_*`, never reachable from a Client Component.
- **A Server Action, not a new API route class** — reuses the same `runHouseholdMutation`/`requireHouseholdRole` authorization gate every other feature already goes through ([data-access-patterns.md](./data-access-patterns.md)) for *read* access too (a household-scoped read helper following the same pagination/query contract as the shared query layer, §2), so "prevent cross-household retrieval" (§3) is enforced by the same mechanism as everything else in the app, not a parallel one invented for this feature.
- **Context assembly is explicit and auditable** — the Server Action builds the prompt's context by calling the *same* query/calculation functions the relevant page already renders from (e.g., the monthly-closing summary capability calls the same function `/app/monthly-closing/[closingId]` already uses), never a raw, unbounded database dump. This makes "show the underlying data" (§3) a natural consequence of the architecture — the UI can render the exact same structured data object both as the assistant's citation and as the page's own display, because it's the same object.
- **Logging follows [observability.md](./observability.md)'s existing rules** — an AI request/response is logged the same way every other action is (`reportActionError`/`logEvent`, IDs only in context, never free text — see observability.md §9's "never log" list), plus a new named event (e.g. `ai.query`) for volume/cost monitoring distinct from error logging.
- **Provider**: not selected by this document — a provider decision needs its own retention/DPA review (§5) before being named here. Whichever is chosen, route every call through one thin internal module (mirroring `src/lib/supabase/service-role.ts`'s "narrowly-scoped, audited" pattern) so swapping providers later doesn't touch every call site.

## 3. Mandatory rules → concrete design requirements

| Rule | Concrete requirement |
|---|---|
| Label AI output | Every assistant-generated response rendered in a visually distinct component (not styled identically to the app's own factual displays), with a persistent, non-dismissable "AI-generated — verify against your records" label, not a one-time disclaimer |
| Show underlying data | Every claim the assistant makes must link back to the specific structured data it was computed from (§2's "same object" architecture) — a response with no traceable source data is a bug, not a feature |
| Do not claim guaranteed returns | Same rule [money-calculation-rules.md](./money-calculation-rules.md) already applies to every projection in the app — the assistant is a *narrator* of existing, already-hedged figures, never a new source of a return estimate. System-prompt-level instruction alone is not sufficient defense-in-depth; response text should be checked for guarantee-shaped language (e.g. "will earn," "guaranteed") before rendering, at least in an early version, given LLM outputs are not fully controllable by instruction |
| Do not silently alter records | No AI-initiated write path exists at all in the first-tier scope (§1) — this rule is satisfied structurally, not by a runtime check, until write capability is deliberately added later |
| Require confirmation for mutations | When mutation capability is eventually added: the assistant may only *propose* a change (rendered as a normal, editable form pre-filled from its suggestion) — a human always clicks the same "Save" button they would for a manually-entered change, through the same validated Server Action |
| Prevent cross-household retrieval | Enforced by §2's reuse of `requireHouseholdRole` — no context-assembly function may accept a raw ID without re-verifying it against the caller's household, identical to every other query in the app |
| Document provider retention | Cannot be filled in until §5's provider selection is done — this document is explicitly incomplete on this point and should not be read as having satisfied it |
| Do not expose financial documents without approved controls | No document *content* (an uploaded PDF/image's bytes) is sent to any AI provider in the first-tier scope. "Summarize insurance documents" (second tier, §1) is the one capability that would need this, and must not ship until §5's document-handling review is separately done — sending a household's uploaded PDF to a third party is a materially different, higher-stakes decision than sending already-structured numeric data, and deserves its own dedicated review, not an inherited one |

## 4. Privacy

- **Data sent to the provider is minimized to what the specific capability needs** — a cash-flow-explanation request sends that month's cash-flow figures, not the household's entire financial history. No request should default to "send everything, let the model figure out what's relevant."
- **No PII beyond what's operationally necessary** — never send a user's email, full name, or any document content in a first-tier request; household/entity references in the prompt should be opaque IDs or already-anonymized labels (e.g. "Account 1," matching how `people`/`institutions` are referenced elsewhere in privacy-sensitive contexts) wherever the capability doesn't specifically need the real name to be useful.
- **Retention**: not yet documented, by design (§3's table) — this is the single biggest open item before any implementation. Whichever provider is selected, this document must be updated with: how long the provider retains request/response content, whether it's used for model training (must be opted out if the provider offers that toggle), and DhanOS's own retention of AI query/response logs (should follow the same [privacy-model.md](./privacy-model.md) §4 retention discipline already applied to the rest of the app, not a separate, undocumented policy).
- **User control**: a household should be able to see (and ideally export, via the existing export feature) a log of what was actually sent to the AI provider on their behalf — the same transparency principle [privacy-model.md](./privacy-model.md) already applies to what DhanOS itself stores, extended to a third party acting on the household's data.

## 5. What must happen before implementation begins

1. Select a provider and document its actual retention/training-use policy (§4) — not assumed, read from that provider's current terms.
2. Decide whether document-content capabilities (statement/insurance-PDF summarization) are in scope for v1 of this feature at all, given the added privacy surface (§3's document row) — a defensible first release may simply exclude them and ship only the first-tier, already-structured-data capabilities.
3. Design the actual UI treatment for "labeled, with underlying data shown" (§3) — a mock or a small prototype component, reviewed before wiring it to a real provider call.
4. Re-run this document's own checklist (§3's table) against whatever's actually built, the same way [production-supabase.md](./production-supabase.md)/[security-review.md](./security-review.md) verified their own areas live rather than assuming design intent held — do not consider this feature done because this proposal was followed; consider it done because the running feature was checked against it.

## A note on bank-statement parsing

The optional bank-statement-parsing phase (PDF/CSV statement upload, extraction, review) is a **separate, unblocked** phase — its stated precondition ("CSV imports and manual transactions are reliable") is already met by the existing CSV import foundation and transaction/cash-flow modules ([implementation-status.md](./implementation-status.md)). It doesn't depend on this AI-assistant proposal and isn't gated by it. Its own rules (no silent import, OCR only if necessary, never request bank credentials, private originals, shown extraction confidence, required review, preserved source references) are already a complete enough spec to start from directly whenever it's prioritized — no separate proposal document was written for it in this pass, since (a) it's a large enough build to warrant its own dedicated implementation session rather than a speculative design-only pass, and (b) its rules, as given, already constitute the design decisions a proposal document would otherwise need to make.
