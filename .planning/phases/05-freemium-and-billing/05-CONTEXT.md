# Phase 5: Freemium and Billing - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce the free-tier limit (1 match run/month) atomically in the Worker before every match run, surface usage to the user on the Match page and a minimal Billing page, and wire Stripe Checkout + webhook handling so paid subscribers get unlimited runs.

This phase does NOT include: Stripe Customer Portal (self-serve subscription management), CSV/XLSX export (Phase 6), brand polish (Phase 6), or dark mode (Phase 6). Enforcement is backend-only — the algorithm never executes when a 429 is returned.

</domain>

<decisions>
## Implementation Decisions

### Usage Metering (Worker)
- **D-01:** Atomic usage check uses the exact SQL pattern from BILLING-01: `UPDATE usage_meters SET count = count + 1 WHERE org_id = $1 AND year_month = $2 AND count < limit RETURNING count`. If 0 rows updated → return 429. If row doesn't exist yet → INSERT first (upsert pattern).
- **D-02:** A new `GET /api/usage` endpoint returns `{ count: number, limit: number, plan: 'free' | 'paid' }` for the authenticated org. Fetched on Match page mount. No auth bypass — Clerk JWT required like all `/api/*` routes.
- **D-03:** `POST /match` response does NOT need to include usage data. The frontend re-fetches `GET /api/usage` after a successful match run to update the counter display.

### Upgrade Prompt UX
- **D-04:** When `POST /match` returns 429, display a **modal overlay** on the Match page. The modal explains the free limit has been reached and includes an Upgrade CTA button that opens Stripe Checkout.
- **D-05:** Server-side enforcement is the security guarantee — the 429 is returned BEFORE `matchTransfers()` executes, so there are no results in the response to bypass. The modal is purely UX, not security.
- **D-06:** When the frontend knows the user is already at their limit (usage count = limit from `GET /api/usage`), the **Run Match button is disabled** and shows a lock icon or "Upgrade to run again" label. This prevents the unnecessary API call and makes the limit visible before they click.

### Usage Counter Display
- **D-07:** Usage counter ("1 of 1 free run used this month") is shown **on the Match page only**, in the control bar alongside the months-cover input and Run Match button.
- **D-08:** Counter is hidden for paid-plan orgs (no limit applies). Show only when `plan === 'free'`.
- **D-09:** Counter updates without page refresh — re-fetch `GET /api/usage` after each successful match run completes.

### Billing Page
- **D-10:** Enable the Billing nav item (`disabled={true}` → `disabled={false}`) and add `/billing` route in `App.tsx`.
- **D-11:** Billing page is **minimal**: shows current plan name (Free / Paid), runs used this month + monthly limit, and an Upgrade CTA button (→ Stripe Checkout) for free-tier orgs. Paid orgs see "Paid plan — unlimited runs" with no CTA.
- **D-12:** No subscription management UI in Phase 5 (no Stripe Customer Portal link). Users who want to cancel contact admin or use Stripe dashboard directly.

### Stripe Integration
- **D-13:** Build **Stripe Checkout only** (no Customer Portal). The Upgrade CTA creates a Stripe Checkout Session via `POST /api/billing/create-checkout` (authenticated route) and redirects the user to the Stripe-hosted checkout page.
- **D-14:** `POST /api/stripe/webhook` is a **public route** (no Clerk auth middleware). It verifies the `Stripe-Signature` header using the Stripe webhook signing secret. Two events handled:
  - `checkout.session.completed` → set org's plan to `paid` in `subscriptions` table
  - `customer.subscription.deleted` → schedule free-tier revert at period end (see D-15)
- **D-15:** When a subscription is cancelled, **access remains paid until the billing period ends** (Stripe sends `customer.subscription.updated` with `cancel_at_period_end: true` first, then `customer.subscription.deleted` when it actually ends). The Worker sets plan to `free` only on `customer.subscription.deleted` (actual end), not on the cancellation notice.
- **D-16:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` added as Worker secrets (Wrangler). `STRIPE_PUBLISHABLE_KEY` added to web app env. `Env` interface in `types.ts` updated.

### Claude's Discretion
- Exact SQL for `usage_meters` upsert (INSERT ... ON CONFLICT DO UPDATE vs SELECT then INSERT)
- Whether `usage_meters.limit` is a column on the row or derived from the org's `subscriptions.status` at query time
- Stripe Checkout session parameters (price ID, success/cancel URLs, client_reference_id for org_id mapping)
- Loading state for the usage counter on Match page mount
- Modal design details (width, overlay opacity, exact copy)
- Error handling if `GET /api/usage` fails (fail silently, show counter as "–/1")
- Whether to store the Stripe price ID in env vars or hardcode for v1

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Freemium & Billing — BILLING-01 through BILLING-04 (exact atomic SQL pattern in BILLING-01, full acceptance criteria)
- `.planning/ROADMAP.md` §Phase 5 — goal and success criteria (5 items)

### Existing Worker Code (integration points)
- `apps/worker/src/index.ts` — Hono app; new billing routes mount here; `/api/stripe/webhook` must bypass Clerk auth middleware
- `apps/worker/src/routes/match.ts` — Usage check runs inside the match route BEFORE `matchTransfers()` executes
- `apps/worker/src/db/client.ts` — `withOrgContext` pattern for all authenticated NEON queries
- `apps/worker/src/types.ts` — `Env` interface; add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `apps/worker/src/middleware/auth.ts` — `clerkAuth` + `requireOrg` middleware; webhook route must be excluded

### Existing Schema (Phase 1 design)
- `.planning/phases/01-foundation/01-CONTEXT.md` §D-03 — `usage_meters` (id, org_id, year_month, count) and `subscriptions` (id, org_id, stripe_customer_id, stripe_subscription_id, status, updated_at) already created in NEON

### Existing Web App (integration points)
- `apps/web/src/App.tsx` — add `/billing` route alongside `/match`
- `apps/web/src/components/AppShell.tsx` — Billing nav item (`disabled={true}`, line ~42); Phase 5 enables it
- `apps/web/src/pages/MatchPage.tsx` — add usage counter to control bar; add modal overlay for 429 response; disable Run Match when at limit
- `apps/web/src/hooks/useFetch.ts` — authenticated fetch hook; use for `GET /api/usage` and `POST /api/billing/create-checkout`

### Brand & UI
- `brand-identity-pharma-apps/brand-identity/brand-guidelines.md` — PharmIQ brand palette (teal `#0F766E`, amber `#D97706`, navy `#0F172A`); Billing page and modal must stay on-brand

### No external specs
- Stripe integration uses standard Stripe Node SDK patterns — no project-specific spec document exists. Downstream agents should use Stripe documentation for Checkout Session creation and webhook verification.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/worker/src/routes/match.ts` — usage check logic inserts before `matchTransfers()` call; reference pattern for placement
- `apps/worker/src/routes/upload.ts` — Hono route module pattern with `withOrgContext`; billing route follows same structure
- `apps/web/src/hooks/useFetch.ts` — authenticated fetch hook; create `useUsage` hook wrapping `GET /api/usage`
- `apps/web/src/pages/MatchPage.tsx` — control bar already has months-cover input + Run Match button; usage counter inserts here
- `apps/web/src/components/AppShell.tsx` — Billing `NavItem` at line ~42; change `disabled={true}` to `disabled={false}` + add `href="/billing"`

### Established Patterns
- `withOrgContext` — mandatory for all NEON queries (except the public webhook route)
- Tailwind utility classes + brand tokens — no new CSS files
- `async/await` throughout; camelCase JSON keys in all API responses
- `clerkAuth` + `requireOrg` middleware on all `/api/*` — webhook must use `app.post('/api/stripe/webhook', handler)` registered BEFORE the middleware or with explicit exclusion

### Integration Points
- `apps/worker/src/index.ts` → mount `billingRoute` (authenticated: `/api/usage`, `/api/billing/create-checkout`) and `webhookRoute` (public: `/api/stripe/webhook`)
- `apps/web/src/App.tsx` → add `<Route path="/billing" element={<ProtectedRoute requireOrg={true}><BillingPage /></ProtectedRoute>} />`
- NEON `usage_meters` table → upsert on each match run; read via `GET /api/usage`
- NEON `subscriptions` table → updated by webhook handler on checkout completion and subscription deletion

</code_context>

<specifics>
## Specific Ideas

- The Run Match disable state (when at free limit) should be visually clear — consider a lock icon alongside "Upgrade to run again" as the button label, styled with amber `#D97706` to signal the soft-paywall state
- The upgrade modal should feel premium, not punitive — "You've used your free run for this month" framing, not "Access denied"
- Counter format: "1 of 1 free run used this month" — clear, human-readable
- Paid orgs should have a noticeably different Match page state — no counter, no lock, Run Match fully active

</specifics>

<deferred>
## Deferred Ideas

- Stripe Customer Portal (self-serve subscription management / cancellation from the app) — deferred to v2
- Payment failure handling / dunning (email or in-app notification when payment fails) — deferred to v2
- Usage history log (match runs per month over time) — deferred to v2

</deferred>

---

*Phase: 05-freemium-and-billing*
*Context gathered: 2026-04-05*
