# Phase 15: 3-Tier Billing - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing binary Free/Paid billing into three tiers (Free, Pro, Enterprise) enforced server-side in the Worker. Users can upgrade or downgrade via Stripe Checkout and the Customer Portal. The BillingPage is redesigned with a 3-tier pricing comparison UI and usage display. No new data upload or matching logic — this phase is billing infrastructure and UI only.

</domain>

<decisions>
## Implementation Decisions

### BillingPage Layout
- **D-01:** Usage summary (match runs + stores used vs limit) sits **above** the 3 pricing cards as a compact row — e.g. "Match runs: 3/10 this month • Stores: 7/10". Always visible regardless of plan.
- **D-02:** Three pricing cards are displayed **side by side**: Free, Pro, Enterprise. Each card shows: plan name, price/month, match run limit, store limit. No feature bullet lists — clean and scannable.
- **D-03:** The current plan card is highlighted with a **teal border (`#0F766E`) + a 'Current plan' badge** at the top of the card. Other cards use the standard border colour.
- **D-04:** **Upgrade CTAs live on each card** below the limits. Free card: "Upgrade to Pro" button. Pro card: "Upgrade to Enterprise" button. Enterprise card: "Current plan" label (disabled / no button). Buttons call `create-checkout` with the target tier.
- **D-05:** A **"Manage subscription →" link** appears below the pricing cards, visible **only for paid users** (plan_tier = 'pro' or 'enterprise'). Calls `POST /billing/create-portal-session` and redirects to Stripe Customer Portal.

### Stripe Customer Portal
- **D-06:** A new Worker endpoint **`POST /billing/create-portal-session`** is added to `billing.ts`. It calls `stripe.billingPortal.sessions.create` using the org's `stripe_customer_id` from the subscriptions table, sets `return_url` to `${ALLOWED_ORIGIN}/billing`, and returns `{ url }`. No customer ID is exposed to the client.

### Tier-Aware Upgrade Copy (Modal)
- **D-07:** When a match run limit (429) or store count limit (403) is hit, the Worker response body includes an **`upgrade_to` field**: `{ error: '...', upgrade_to: 'pro' | 'enterprise' }`. Frontend reads `upgrade_to` to set modal content — no inference from `usage.plan`.
- **D-08:** The upgrade modal **title and copy change per target tier**:
  - `upgrade_to: 'pro'` → "Upgrade to Pro — 10 match runs/month, up to 10 stores. $10/mo AUD." CTA calls `create-checkout` with `{ tier: 'pro' }`.
  - `upgrade_to: 'enterprise'` → "Upgrade to Enterprise — Unlimited runs and stores. $100/mo AUD." CTA calls `create-checkout` with `{ tier: 'enterprise' }`.
- **D-09:** Enterprise users never see an upgrade modal — the Worker returns 200 for Enterprise orgs regardless of run count or store count.

### Checkout Success Redirect UX
- **D-10:** On `/billing?checkout=success`, BillingPage detects the `checkout` query param on mount and **shows a loading spinner in place of the pricing cards** with "Confirming your upgrade..." text while synchronously fetching the Stripe session status and writing `plan_tier`.
- **D-11:** Once confirmed, a **toast notification** ("You're now on PharmIQ Pro" / "You're now on PharmIQ Enterprise") appears for ~3 seconds (dismissable). Then the BillingPage renders normally with the new plan highlighted.
- **D-12:** If the synchronous session fetch **fails or times out**, display an error message: "Upgrade confirmation failed — please refresh or contact support." with a retry button. Do not silently fall back to the old plan display.

### Backend — Tier Enforcement
- **D-13:** `lib/plans.ts` defines `PLAN_LIMITS` constant and `PlanTier` type (`'free' | 'pro' | 'enterprise'`). Limits: Free = { matchRuns: 1, stores: 3 }, Pro = { matchRuns: 10, stores: 10 }, Enterprise = { matchRuns: Infinity, stores: Infinity }.
- **D-14:** Match route (`match.ts`) reads `plan_tier` from subscriptions table (not `status`). Runs the atomic counter check against the tier's `matchRuns` limit. Then runs a distinct-store count query against `rou_data` and gates against the tier's `stores` limit. Returns 429 with `upgrade_to` for run limit, 403 with `upgrade_to` for store limit.
- **D-15:** **Grace period (BILLING-07):** The store-count gate runs at **match time only** (not at upload time). Free orgs with >3 stores already uploaded are not retroactively blocked — they only hit the gate when they try to run a new match.
- **D-16:** `GET /usage` returns `{ count, limit, plan_tier, store_count }` — adds `plan_tier` (string) and `store_count` (current distinct store count for the org from rou_data) so BillingPage can render both usage stats.
- **D-17:** `POST /billing/create-checkout` accepts `{ tier: 'pro' | 'enterprise' }` in the request body and selects the correct price ID (`STRIPE_PRICE_ID_PRO` or `STRIPE_PRICE_ID_ENTERPRISE`) from the Env. Stores `stripe_customer_id` at session creation time (before redirect), not in the webhook.
- **D-18:** Webhook `customer.subscription.updated` handler writes `plan_tier` to subscriptions table. `stripe_event_id` deduplication via `INSERT INTO processed_webhook_events (stripe_event_id) ... ON CONFLICT DO NOTHING RETURNING id` — if no row returned, event already processed, return 200 immediately.

### Claude's Discretion
- Toast notification implementation (could use a simple local state + setTimeout or a lightweight toast library already in the project)
- Exact card dimensions, spacing, and responsive behaviour (desktop-only is fine — app is not mobile-optimised)
- Loading spinner style for checkout success state (consistent with existing loading patterns in the app)
- Error state styling for the session fetch failure message

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing billing routes (extend, don't replace)
- `apps/worker/src/routes/billing.ts` — Current GET /usage and POST /billing/create-checkout; both need updating for 3-tier
- `apps/worker/src/routes/webhook.ts` — Current webhook handler; extend to handle customer.subscription.updated + stripe_event_id deduplication
- `apps/worker/src/types.ts` — Env interface; add STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_ENTERPRISE

### Frontend billing UI (redesign)
- `apps/web/src/pages/BillingPage.tsx` — Current single-card billing page; full redesign for 3 pricing cards
- `apps/web/src/hooks/useUsage.ts` — Current UsageData interface (plan: 'free' | 'paid'); update to plan_tier + store_count

### Match route (update limit enforcement)
- `apps/worker/src/routes/match.ts` — Update to read plan_tier from subscriptions + enforce tier store-count gate

### Upgrade modal (update copy)
- `apps/web/src/pages/MatchPage.tsx` — Existing upgrade modal wired to 429 error; extend to read upgrade_to from error response and set tier-specific copy

### Requirements
- `.planning/REQUIREMENTS.md` §BILLING-05 through BILLING-12 — full acceptance criteria for this phase

### Schema context (plan_tier column already exists from Phase 11)
- `.planning/phases/11-schema-migration/` (if exists) — plan_tier column on subscriptions table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `billing.ts` GET /usage — already queries subscriptions and usage_meters; extend to add plan_tier and store_count fields
- `billing.ts` POST /billing/create-checkout — already creates Stripe sessions; extend to accept tier param and select price ID
- `webhook.ts` — already handles checkout.session.completed and customer.subscription.deleted; add customer.subscription.updated and idempotency
- `useUsage` hook — already polls /api/usage on mount; extend UsageData interface for new fields
- MatchPage upgrade modal — already wired to 429 error via useEffect on error state; extend to read upgrade_to from error response

### Established Patterns
- Atomic Postgres counter via `UPDATE ... WHERE count < limit RETURNING count` — match.ts already uses this for free tier; extend for Pro tier limit
- `withOrgContext` tx wrapper — used in billing.ts and match.ts for all DB queries; continue using
- Stripe fetch HTTP client — already instantiated in billing.ts and webhook.ts
- PharmIQ brand teal `#0F766E` — use for current-plan card border and badge

### Integration Points
- New `POST /billing/create-portal-session` route must be registered in `apps/worker/src/index.ts` under the authenticated middleware (not before it, unlike the webhook)
- `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` must be added to `.dev.vars` and `wrangler.toml` bindings (per pre-flight instructions in ROADMAP.md)
- processed_webhook_events table needed for idempotency — check if this exists in schema.sql or needs migration

</code_context>

<specifics>
## Specific Ideas

- Upgrade modal copy is specific and pricing-forward: include the price (e.g. "$10/mo AUD") and the limit increase in the modal body, not just the plan name — users need the value prop at decision time
- "Manage subscription →" link should use a right arrow or external link icon (lucide-react is already used for icons in BillingPage)
- Toast for upgrade confirmation should name the specific plan ("You're now on PharmIQ Pro" / "...Enterprise") not be generic ("Upgrade successful")

</specifics>

<deferred>
## Deferred Ideas

- Downgrade flow UX (Enterprise → Pro via Customer Portal) — handled by Stripe Customer Portal UI, not custom UI; no additional frontend work needed
- Prorated billing display — Stripe handles this in checkout; not surfaced in app UI

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-3-tier-billing*
*Context gathered: 2026-04-19*
