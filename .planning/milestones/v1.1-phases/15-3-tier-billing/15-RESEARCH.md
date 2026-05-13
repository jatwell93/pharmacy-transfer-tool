# Phase 15: 3-Tier Billing - Research

**Researched:** 2026-04-19
**Domain:** Stripe Checkout / Billing Portal, Cloudflare Workers (Hono), NEON Postgres, React frontend billing UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BillingPage Layout**
- D-01: Usage summary (match runs + stores used vs limit) sits above the 3 pricing cards as a compact row — e.g. "Match runs: 3/10 this month • Stores: 7/10". Always visible regardless of plan.
- D-02: Three pricing cards are displayed side by side: Free, Pro, Enterprise. Each card shows: plan name, price/month, match run limit, store limit. No feature bullet lists — clean and scannable.
- D-03: The current plan card is highlighted with a teal border (`#0F766E`) + a 'Current plan' badge at the top of the card. Other cards use the standard border colour.
- D-04: Upgrade CTAs live on each card below the limits. Free card: "Upgrade to Pro" button. Pro card: "Upgrade to Enterprise" button. Enterprise card: "Current plan" label (disabled / no button). Buttons call `create-checkout` with the target tier.
- D-05: A "Manage subscription →" link appears below the pricing cards, visible only for paid users (plan_tier = 'pro' or 'enterprise'). Calls `POST /billing/create-portal-session` and redirects to Stripe Customer Portal.

**Stripe Customer Portal**
- D-06: A new Worker endpoint `POST /billing/create-portal-session` is added to `billing.ts`. It calls `stripe.billingPortal.sessions.create` using the org's `stripe_customer_id` from the subscriptions table, sets `return_url` to `${ALLOWED_ORIGIN}/billing`, and returns `{ url }`. No customer ID is exposed to the client.

**Tier-Aware Upgrade Copy (Modal)**
- D-07: When a match run limit (429) or store count limit (403) is hit, the Worker response body includes an `upgrade_to` field: `{ error: '...', upgrade_to: 'pro' | 'enterprise' }`. Frontend reads `upgrade_to` to set modal content — no inference from `usage.plan`.
- D-08: The upgrade modal title and copy change per target tier:
  - `upgrade_to: 'pro'` → "Upgrade to Pro — 10 match runs/month, up to 10 stores. $10/mo AUD."
  - `upgrade_to: 'enterprise'` → "Upgrade to Enterprise — Unlimited runs and stores. $100/mo AUD."
- D-09: Enterprise users never see an upgrade modal — the Worker returns 200 for Enterprise orgs regardless of run count or store count.

**Checkout Success Redirect UX**
- D-10: On `/billing?checkout=success`, BillingPage detects the `checkout` query param on mount and shows a loading spinner in place of the pricing cards with "Confirming your upgrade..." text while synchronously fetching the Stripe session status and writing `plan_tier`.
- D-11: Once confirmed, a toast notification ("You're now on PharmIQ Pro" / "You're now on PharmIQ Enterprise") appears for ~3 seconds (dismissable). Then the BillingPage renders normally with the new plan highlighted.
- D-12: If the synchronous session fetch fails or times out, display an error message: "Upgrade confirmation failed — please refresh or contact support." with a retry button. Do not silently fall back to the old plan display.

**Backend — Tier Enforcement**
- D-13: `lib/plans.ts` defines `PLAN_LIMITS` constant and `PlanTier` type (`'free' | 'pro' | 'enterprise'`). Limits: Free = { matchRuns: 1, stores: 3 }, Pro = { matchRuns: 10, stores: 10 }, Enterprise = { matchRuns: Infinity, stores: Infinity }.
- D-14: Match route (`match.ts`) reads `plan_tier` from subscriptions table (not `status`). Runs the atomic counter check against the tier's `matchRuns` limit. Then runs a distinct-store count query against `rou_data` and gates against the tier's `stores` limit. Returns 429 with `upgrade_to` for run limit, 403 with `upgrade_to` for store limit.
- D-15: Grace period (BILLING-07): The store-count gate runs at match time only (not at upload time). Free orgs with >3 stores already uploaded are not retroactively blocked — they only hit the gate when they try to run a new match.
- D-16: `GET /usage` returns `{ count, limit, plan_tier, store_count }` — adds `plan_tier` (string) and `store_count` (current distinct store count for the org from rou_data) so BillingPage can render both usage stats.
- D-17: `POST /billing/create-checkout` accepts `{ tier: 'pro' | 'enterprise' }` in the request body and selects the correct price ID (`STRIPE_PRICE_ID_PRO` or `STRIPE_PRICE_ID_ENTERPRISE`) from the Env. Stores `stripe_customer_id` at session creation time (before redirect), not in the webhook.
- D-18: Webhook `customer.subscription.updated` handler writes `plan_tier` to subscriptions table. `stripe_event_id` deduplication via `INSERT INTO processed_webhook_events (stripe_event_id) ... ON CONFLICT DO NOTHING RETURNING id` — if no row returned, event already processed, return 200 immediately.

### Claude's Discretion
- Toast notification implementation (could use a simple local state + setTimeout or a lightweight toast library already in the project)
- Exact card dimensions, spacing, and responsive behaviour (desktop-only is fine — app is not mobile-optimised)
- Loading spinner style for checkout success state (consistent with existing loading patterns in the app)
- Error state styling for the session fetch failure message

### Deferred Ideas (OUT OF SCOPE)
- Downgrade flow UX (Enterprise → Pro via Customer Portal) — handled by Stripe Customer Portal UI, not custom UI; no additional frontend work needed
- Prorated billing display — Stripe handles this in checkout; not surfaced in app UI
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILLING-05 | Plan limits: Free = 1 match/mo + 3 stores; Pro ($10/mo AUD) = 10 matches/mo + 10 stores; Enterprise ($100/mo AUD) = unlimited | D-13 defines PLAN_LIMITS; match.ts must read plan_tier |
| BILLING-06 | All limits enforced server-side in Worker: atomic match counter + distinct-store count at match time | D-14 atomic pattern; existing UPDATE ... WHERE count < limit RETURNING count extended for Pro |
| BILLING-07 | Free users with >3 stores already uploaded are NOT retroactively blocked — store cap applies to new match runs only | D-15 grace period — gate is match-time only |
| BILLING-08 | Stripe Checkout supports both Pro and Enterprise price IDs; existing subscription item ID passed for correct proration | D-17 create-checkout accepts tier param; Stripe subscription.items.data[0].id used for upgrade |
| BILLING-09 | After Stripe Checkout redirect, app synchronously fetches checkout session status and writes plan_tier before rendering | D-10/D-11/D-12; new Worker endpoint or extended checkout route fetches session + writes DB |
| BILLING-10 | customer.subscription.updated webhook handler writes plan_tier; idempotent via stripe_event_id deduplication | D-18; processed_webhook_events table needed (not in current schema.sql) |
| BILLING-11 | User can manage subscription via Stripe Customer Portal | D-06 new POST /billing/create-portal-session endpoint |
| BILLING-12 | Billing page shows current plan, match runs used, stores used vs limit, side-by-side 3-tier comparison | D-01 through D-05; useUsage hook extended with plan_tier + store_count |
</phase_requirements>

---

## Summary

Phase 15 extends the existing binary Free/Paid billing system to three tiers (Free, Pro, Enterprise). The backend work is in the Cloudflare Worker: `match.ts` is updated to read `plan_tier` instead of `status`, `lib/plans.ts` is created as the single source of truth for tier limits, `billing.ts` gains a portal-session endpoint and tier-aware checkout creation, and `webhook.ts` gains a `customer.subscription.updated` handler with idempotency.

The critical schema dependency is confirmed: `schema.sql` already contains `plan_tier TEXT NOT NULL DEFAULT 'free'` on the `subscriptions` table [VERIFIED: file read], meaning Phase 11 is complete in the repo definition. The `processed_webhook_events` table is NOT in `schema.sql` and NOT in any migration file [VERIFIED: grep across apps/ returned no matches] — it must be created as a DB migration and schema.sql update in Phase 15 (15-01).

The frontend work redesigns `BillingPage.tsx` from a single plan card to a three-column layout with usage summary, and extends `useUsage.ts` to expose `plan_tier` and `store_count`. The existing upgrade modal in `MatchPage.tsx` is extended to consume `upgrade_to` from the error response.

**Primary recommendation:** Follow the wave split as planned — 15-01 covers all Worker-side changes (lib/plans.ts, match.ts, billing.ts, webhook.ts, types.ts, DB migration for processed_webhook_events), and 15-02 covers all frontend changes (BillingPage.tsx, useUsage.ts, MatchPage.tsx upgrade modal).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | 22.0.2 | Stripe API client — checkout sessions, portal sessions, webhook verification | Already installed; `Stripe.createFetchHttpClient()` required for Cloudflare Workers [VERIFIED: package.json] |
| `@neondatabase/serverless` | ^1.0.2 | NEON HTTP driver — all DB queries via `neon()` and `withOrgContext` | Already installed; all routes use this pattern [VERIFIED: billing.ts, match.ts] |
| `hono` | (existing) | HTTP routing — billingRoute extended with new endpoints | Already used for all Worker routes [VERIFIED: index.ts] |
| React + TypeScript | (existing) | BillingPage.tsx redesign | `apps/web` already React 19 + TS [VERIFIED: codebase] |
| `lucide-react` | (existing) | Icons in BillingPage (ExternalLink or ArrowRight for "Manage subscription →") | Already imported in BillingPage.tsx (`CreditCard` icon) [VERIFIED: BillingPage.tsx] |

### No New Packages Required

Phase 15 requires zero new npm packages. All capabilities needed (Stripe SDK, NEON driver, React, lucide-react) are already installed. [VERIFIED: existing code inspection]

The toast notification (D-11, Claude's Discretion) can be implemented with local React state + `setTimeout` — no external toast library needed. The loading spinner already exists in the codebase (`Loader2` from lucide-react used in `MatchPage.tsx`).

---

## Architecture Patterns

### Recommended Structure Changes

```
apps/worker/src/
├── lib/
│   └── plans.ts          # NEW: PLAN_LIMITS constant + PlanTier type (D-13)
├── routes/
│   ├── billing.ts        # EXTENDED: portal-session endpoint + tier-aware checkout + /usage update
│   ├── match.ts          # EXTENDED: reads plan_tier, runs store-count gate, adds upgrade_to to errors
│   └── webhook.ts        # EXTENDED: customer.subscription.updated + stripe_event_id idempotency
├── types.ts              # EXTENDED: add STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_ENTERPRISE to Env
└── db/
    ├── schema.sql         # EXTENDED: add processed_webhook_events table
    └── migrations/
        └── 003-processed-webhook-events.sql  # NEW: CREATE TABLE + GRANT

apps/web/src/
├── hooks/
│   └── useUsage.ts       # EXTENDED: UsageData interface gains plan_tier + store_count
└── pages/
    ├── BillingPage.tsx   # REDESIGNED: 3-tier layout with usage summary + checkout=success handling
    └── MatchPage.tsx     # EXTENDED: upgrade modal reads upgrade_to from error response
```

### Pattern 1: PLAN_LIMITS Constant (lib/plans.ts)

**What:** Single source of truth for tier limits, referenced by both match.ts and billing.ts.
**When to use:** Any code that needs to know tier boundaries.

```typescript
// Source: D-13 from 15-CONTEXT.md
export type PlanTier = 'free' | 'pro' | 'enterprise';

export const PLAN_LIMITS: Record<PlanTier, { matchRuns: number; stores: number }> = {
  free:       { matchRuns: 1,        stores: 3        },
  pro:        { matchRuns: 10,       stores: 10       },
  enterprise: { matchRuns: Infinity, stores: Infinity },
};
```

**Key:** `Infinity` for Enterprise means the atomic counter check can be short-circuited at the application level (check `plan_tier === 'enterprise'` before running usage queries).

### Pattern 2: Tier-Aware Atomic Match Counter (match.ts)

**What:** Reads `plan_tier` from subscriptions, applies the correct `matchRuns` limit, then checks distinct store count.
**When to use:** Every POST /match request.

```typescript
// Source: existing match.ts pattern + D-14 + BILLING-06
// Step 1: Read plan_tier
const planResults = await sql.transaction((tx) => [
  tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
  tx`SELECT plan_tier FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
]);
const planTier = (planResults[1] as Array<{ plan_tier: string }>)[0]?.plan_tier ?? 'free';

// Step 2: Enterprise short-circuit (D-09 — no gates for Enterprise)
if (planTier !== 'enterprise') {
  const limit = PLAN_LIMITS[planTier as PlanTier].matchRuns;
  // Atomic increment with tier limit
  const usageResults = await sql.transaction((tx) => [
    tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    tx`INSERT INTO usage_meters (org_id, year_month, count) VALUES (${orgId}, ${yearMonth}, 0)
       ON CONFLICT (org_id, year_month) DO NOTHING`,
    tx`UPDATE usage_meters SET count = count + 1
       WHERE org_id = ${orgId} AND year_month = ${yearMonth} AND count < ${limit}
       RETURNING count`,
  ]);
  if ((usageResults[2] as Array<{ count: number }>).length === 0) {
    return c.json({ error: 'Monthly match run limit reached. Upgrade to continue.', upgrade_to: 'pro' }, 429);
    // NOTE: upgrade_to = 'enterprise' when plan_tier is 'pro'
  }

  // Step 3: Store-count gate (D-14, D-15 — match time only, not upload time)
  const storeCountResult = await withOrgContext<Array<{ cnt: number }>>(
    dbUrl, orgId,
    (tx) => tx`SELECT COUNT(DISTINCT store_id) AS cnt FROM rou_data WHERE org_id = ${orgId}`,
  );
  const storeCount = storeCountResult[0]?.cnt ?? 0;
  const storeLimit = PLAN_LIMITS[planTier as PlanTier].stores;
  if (storeCount > storeLimit) {
    const upgradeTo = planTier === 'free' ? 'pro' : 'enterprise';
    return c.json({ error: 'Store limit exceeded. Upgrade to continue.', upgrade_to: upgradeTo }, 403);
  }
}
```

**Critical:** `upgrade_to` field must reflect the next tier above the user's current tier, not a hardcoded value.

### Pattern 3: Idempotent Webhook via processed_webhook_events

**What:** Deduplicates webhook events using `stripe_event_id`. If INSERT returns no row, event was already processed.
**When to use:** All idempotent-critical webhook handlers (`customer.subscription.updated`, and optionally extended to `checkout.session.completed`).

```typescript
// Source: D-18 from 15-CONTEXT.md + Stripe webhook idempotency best practice
// Insert event ID — if already exists, RETURNING returns no rows
const dedupResult = await sql`
  INSERT INTO processed_webhook_events (stripe_event_id)
  VALUES (${event.id})
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING stripe_event_id
`;
if ((dedupResult as Array<unknown>).length === 0) {
  return c.text('', 200); // Already processed
}
// Proceed with business logic...
```

**Note:** The `processed_webhook_events` table uses direct `sql` (not `withOrgContext`) because webhook events are not org-scoped — they operate across all orgs. RLS cannot be applied with an org context. The webhook handler already uses direct `neon(c.env.DATABASE_URL)` for all queries [VERIFIED: webhook.ts].

### Pattern 4: processed_webhook_events Table

**What:** Tracks processed Stripe event IDs to prevent double-processing.
**Schema required:** NOT in current `schema.sql` [VERIFIED: file read — table absent]. Must be added via migration.

```sql
-- Source: D-18 design + standard idempotency pattern [ASSUMED: column name stripe_event_id]
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  stripe_event_id  TEXT PRIMARY KEY,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT, SELECT ON processed_webhook_events TO pharmiq_app;
```

**RLS note:** This table does NOT need RLS — it is not org-scoped data. The webhook handler connects using the same DATABASE_URL as the app role. The pharmiq_app role needs INSERT + SELECT grants. [ASSUMED: neondb_owner DDL runs this migration, as per Phase 3 and 11 precedent]

### Pattern 5: Synchronous Checkout Session Confirm (BILLING-09)

**What:** After Stripe redirects to `/billing?checkout=success`, frontend calls a backend endpoint that retrieves the Stripe session and writes `plan_tier` to the DB before returning. This avoids relying on the async webhook for the immediate UX.

**Backend endpoint (new or extended `billing.ts`):**

```typescript
// Source: Stripe docs — stripe.checkout.sessions.retrieve [VERIFIED: docs.stripe.com]
// POST /billing/confirm-checkout
// Body: { sessionId: string }
// Note: success_url already has ?checkout=success appended; pass session_id as query param instead
const session = await stripe.checkout.sessions.retrieve(sessionId);
const orgId = session.metadata?.org_id;
// Determine plan_tier from session subscription items
const sub = await stripe.subscriptions.retrieve(session.subscription as string);
const priceId = sub.items.data[0]?.price?.id;
const tier = priceId === c.env.STRIPE_PRICE_ID_PRO ? 'pro'
           : priceId === c.env.STRIPE_PRICE_ID_ENTERPRISE ? 'enterprise'
           : 'free';
// Write to DB
await sql`UPDATE subscriptions SET plan_tier = ${tier}, updated_at = NOW()
          WHERE org_id = ${orgId}`;
return c.json({ plan_tier: tier });
```

**Alternative:** Pass `?session_id={CHECKOUT_SESSION_ID}` in the `success_url` so the frontend can send it back. Stripe supports `{CHECKOUT_SESSION_ID}` as a template variable in the `success_url` parameter. [CITED: docs.stripe.com/api/checkout/sessions/create]

**Frontend trigger pattern:**

```typescript
// In BillingPage.tsx useEffect — detects checkout=success param on mount (D-10)
const searchParams = new URLSearchParams(window.location.search);
if (searchParams.get('checkout') === 'success') {
  const sessionId = searchParams.get('session_id'); // if passed via success_url template
  // Call confirm-checkout, show spinner, then show toast on success (D-11)
}
```

### Pattern 6: Stripe Portal Session (D-06)

**What:** Creates a Stripe Customer Portal session and returns the short-lived URL.

```typescript
// Source: docs.stripe.com/api/customer_portal/sessions/create [VERIFIED: WebFetch]
billingRoute.post('/billing/create-portal-session', async (c) => {
  const orgId = c.get('orgId');
  // Fetch stripe_customer_id from subscriptions — never expose to client
  const subRows = await withOrgContext<Array<{ stripe_customer_id: string }>>(
    dbUrl, orgId,
    (tx) => tx`SELECT stripe_customer_id FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
  );
  const customerId = subRows[0]?.stripe_customer_id;
  if (!customerId) return c.json({ error: 'No active subscription found' }, 400);

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${c.env.ALLOWED_ORIGIN}/billing`,
  });
  return c.json({ url: portalSession.url });
});
```

### Pattern 7: customer.subscription.updated Webhook

**What:** When a user upgrades/downgrades via Customer Portal, Stripe fires `customer.subscription.updated`. The handler maps the new price ID to a `plan_tier` and writes to DB.

```typescript
// Source: Stripe docs — subscription.items.data[0].price.id [VERIFIED: WebFetch]
if (event.type === 'customer.subscription.updated') {
  const sub = event.data.object as Stripe.Subscription;
  // Idempotency check first (D-18)
  const dedupResult = await sql`INSERT INTO processed_webhook_events (stripe_event_id)
    VALUES (${event.id}) ON CONFLICT DO NOTHING RETURNING stripe_event_id`;
  if ((dedupResult as Array<unknown>).length === 0) return c.text('', 200);

  const priceId = sub.items.data[0]?.price?.id;
  const tier = priceId === env.STRIPE_PRICE_ID_PRO ? 'pro'
             : priceId === env.STRIPE_PRICE_ID_ENTERPRISE ? 'enterprise'
             : 'free';
  let orgId = sub.metadata?.org_id;
  if (!orgId) {
    const rows = await sql`SELECT org_id FROM subscriptions
                           WHERE stripe_subscription_id = ${sub.id} LIMIT 1`;
    orgId = rows[0]?.org_id;
  }
  if (orgId) {
    await sql`UPDATE subscriptions SET plan_tier = ${tier}, updated_at = NOW()
              WHERE org_id = ${orgId}`;
  }
}
```

### Pattern 8: Usage Response Extended

**What:** `GET /usage` returns extended payload with `plan_tier` and `store_count`.

```typescript
// Source: D-16 from 15-CONTEXT.md
// Fetch plan_tier from subscriptions
const subRows = await withOrgContext<Array<{ plan_tier: string }>>(
  dbUrl, orgId,
  (tx) => tx`SELECT plan_tier FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
);
const planTier = subRows[0]?.plan_tier ?? 'free';

// Fetch distinct store count from rou_data
const storeCountRows = await withOrgContext<Array<{ cnt: number }>>(
  dbUrl, orgId,
  (tx) => tx`SELECT COUNT(DISTINCT store_id)::int AS cnt FROM rou_data WHERE org_id = ${orgId}`,
);
const storeCount = storeCountRows[0]?.cnt ?? 0;

const limit = PLAN_LIMITS[planTier as PlanTier].matchRuns;
const limitForUI = limit === Infinity ? -1 : limit; // -1 = unlimited display

return c.json({ count, limit: limitForUI, plan_tier: planTier, store_count: storeCount });
```

### Pattern 9: useUsage Hook Extended

**What:** `UsageData` interface gains `plan_tier` and `store_count`.

```typescript
// Source: existing useUsage.ts [VERIFIED: file read]
export interface UsageData {
  count: number;
  limit: number;        // -1 = unlimited
  plan_tier: string;    // 'free' | 'pro' | 'enterprise'
  store_count: number;  // distinct store count from rou_data
  // REMOVED: plan: 'free' | 'paid' — replaced by plan_tier
}
```

**Breaking change note:** The old `plan: 'free' | 'paid'` field in `UsageData` is replaced. Any component that references `usage.plan` must be updated — currently `BillingPage.tsx` and `MatchPage.tsx` [VERIFIED: both files read].

### Pattern 10: BillingPage 3-Card Layout

**What:** Redesigned layout with usage summary row above three side-by-side plan cards.

```tsx
// Source: D-01 through D-05 from 15-CONTEXT.md
// Structure:
// 1. Usage summary row (always visible) — "Match runs: 3/10 this month • Stores: 7/10"
// 2. Three pricing cards (flex row):
//    Card = { plan name, price, match limit, store limit, CTA or badge }
// 3. "Manage subscription →" link (paid users only)
//
// Current plan card: border-[#0F766E] ring + "Current plan" badge
// Other cards: standard border colour
// Teal = #0F766E (matches PharmIQ brand, existing var(--color-teal)) [VERIFIED: BillingPage.tsx]
```

### Anti-Patterns to Avoid

- **Reading `status` for plan tier in Phase 15 code:** `match.ts` currently reads `status !== 'paid'` for the free-tier gate. Phase 15 must switch ALL billing checks to `plan_tier`. The old `status` column remains in the table but should not drive new logic.
- **Hardcoding `upgrade_to: 'pro'` unconditionally:** When a Pro user hits the store limit, `upgrade_to` must be `'enterprise'` not `'pro'`. Use `planTier === 'free' ? 'pro' : 'enterprise'`.
- **Using `withOrgContext` for webhook DB operations:** Webhook handler does not have a Clerk org context; it uses `neon(DATABASE_URL)` directly (existing pattern). The `processed_webhook_events` table also uses direct `sql`, not `withOrgContext`. [VERIFIED: webhook.ts current implementation]
- **Forgetting to register `POST /billing/create-portal-session` in index.ts:** The existing `billingRoute` is mounted at `app.route('/api', billingRoute)` behind auth middleware. The new endpoint is on `billingRoute` so it inherits auth automatically. No index.ts change needed for new billing routes — only if a new route file is created.
- **Exposing `stripe_customer_id` to the client:** Never return it in the portal session response. Return only `{ url }`.
- **Not registering checkout session `session_id` in success_url:** Without passing `{CHECKOUT_SESSION_ID}` in the success_url template, the frontend cannot tell the backend which session to confirm. The create-checkout route must include `?session_id={CHECKOUT_SESSION_ID}` in the success_url.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe signature verification | Custom HMAC check | `stripe.webhooks.constructEventAsync` (already used) | Subtle timing attack surface; Stripe SDK handles replay protection |
| Webhook idempotency via in-memory map | Per-process `Set<string>` | `processed_webhook_events` Postgres table | Workers are stateless; in-memory deduplication is lost on every request |
| Customer portal | Custom cancel/upgrade UI | `stripe.billingPortal.sessions.create` | Prorations, invoice previews, payment method update — all handled by Stripe Portal |
| Subscription upgrade proration | Custom billing calculation | Pass existing subscription item ID in checkout for correct proration | Stripe handles all proration math |
| Usage counter with SELECT then UPDATE | Two-query pattern | Atomic `UPDATE ... WHERE count < limit RETURNING count` (already used) | Race condition on concurrent requests; atomic pattern already in match.ts |
| Toast notifications | External library | Local React state + `setTimeout` (Claude's Discretion) | App has no existing toast library; simple state is sufficient for a 3-second notification |

---

## Runtime State Inventory

> Phase 15 is a billing extension phase, not a rename/refactor. However, one category of runtime state must be checked.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `subscriptions` table: `plan_tier` column already exists (DEFAULT 'free') [VERIFIED: schema.sql]. Any orgs with `status = 'paid'` need `plan_tier` updated — Phase 11 migration handles this. | None new — Phase 11 already covers this; verify no `status='paid'` rows have `plan_tier='free'` before deploying |
| Live service config | Stripe Billing Portal must be configured in Stripe Dashboard before `create-portal-session` can succeed. Portal configuration (allowed features) is set in Stripe Dashboard → Customer Portal settings. | Manual pre-flight: enable "Cancel subscriptions" and "Update subscriptions" in Stripe Dashboard Customer Portal settings |
| OS-registered state | None — no task scheduler or PM2 processes reference tier data. | None |
| Secrets/env vars | `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` are in `.dev.vars.example` and `wrangler.jsonc` [VERIFIED: both files read]. `types.ts` does NOT yet have these in the `Env` interface [VERIFIED: types.ts shows only `STRIPE_PRICE_ID`]. | Code edit: add to `types.ts` Env interface. Runtime pre-flight: `wrangler secret put` both values before deploying. |
| Build artifacts | None — no compiled binaries or stale artifacts from renaming. | None |

---

## Common Pitfalls

### Pitfall 1: `upgrade_to` field missing from 429/403 responses

**What goes wrong:** Frontend upgrade modal shows wrong copy or defaults to the wrong tier because `upgrade_to` is not in the error response body.
**Why it happens:** The old 429 response in match.ts has no `upgrade_to` field (`return c.json({ error: '...' }, 429)`). Phase 15 adds it, but if forgotten the frontend silently falls back or errors.
**How to avoid:** Both the 429 (match run limit) and the 403 (store count limit) responses MUST include `upgrade_to: 'pro' | 'enterprise'` based on current `plan_tier`.
**Warning signs:** Upgrade modal shows generic copy; MatchPage `error` state doesn't trigger tier-specific copy.

### Pitfall 2: plan_tier vs status column confusion

**What goes wrong:** New Phase 15 code reads `status` instead of `plan_tier`, causing Pro subscribers to be treated as free (since `status = 'paid'` but `plan_tier = 'pro'`).
**Why it happens:** The old match.ts code reads `status` and compares to `'paid'`. Phase 15 changes the source of truth to `plan_tier`.
**How to avoid:** After updating match.ts, grep for any remaining `status` reads in billing/match logic and replace with `plan_tier` reads. `status` column is preserved but not used for plan gating.
**Warning signs:** Pro orgs hitting 429 after 1 run (old free-tier limit still applied).

### Pitfall 3: processed_webhook_events table not migrated before deploying

**What goes wrong:** `customer.subscription.updated` webhook handler throws `relation "processed_webhook_events" does not exist`, returning 500 to Stripe. Stripe retries, creating cascading failures.
**Why it happens:** The table does not exist in the current database [VERIFIED: schema.sql and grep both confirm absence].
**How to avoid:** 15-01 must include a migration task that creates the table AND runs it against NEON before the Worker code is deployed.
**Warning signs:** Worker logs show `relation "processed_webhook_events" does not exist` on any webhook event.

### Pitfall 4: session_id not passed in success_url

**What goes wrong:** After Stripe checkout redirect to `/billing?checkout=success`, the frontend has no session ID to send to the backend confirm endpoint. BILLING-09 (synchronous plan_tier write) cannot work.
**Why it happens:** The `success_url` in `create-checkout` does not include Stripe's `{CHECKOUT_SESSION_ID}` template variable.
**How to avoid:** Set `success_url` to `${ALLOWED_ORIGIN}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`. Stripe substitutes the real session ID at redirect time.
**Warning signs:** BillingPage shows "Confirming your upgrade..." indefinitely because `session_id` query param is null.

### Pitfall 5: Billing Portal fires before stripe_customer_id is stored

**What goes wrong:** `create-portal-session` cannot find `stripe_customer_id` in the subscriptions table — returns 400 or queries Stripe unnecessarily.
**Why it happens:** `stripe_customer_id` is only stored at checkout time (D-17). If a user navigates to the portal before having completed a checkout, the field is null.
**How to avoid:** The `create-portal-session` endpoint must check for `stripe_customer_id` and return a clear error if absent. D-05 specifies the link is only visible when `plan_tier = 'pro' or 'enterprise'` — at those tiers, a checkout must have been completed and `stripe_customer_id` must exist.
**Warning signs:** `stripe_customer_id` is null in subscriptions table for an org that claims to be paid.

### Pitfall 6: Infinite matchRuns limit breaks atomic counter WHERE clause

**What goes wrong:** `UPDATE ... WHERE count < ${Infinity}` — Postgres receives `WHERE count < 'Infinity'` or a JS `Infinity` value which is not a valid SQL integer.
**Why it happens:** `PLAN_LIMITS.enterprise.matchRuns = Infinity` is a JS value; it must never be passed directly into a SQL query parameter.
**How to avoid:** Short-circuit the entire usage-metering block for Enterprise orgs BEFORE constructing any SQL. The check `if (planTier !== 'enterprise')` gates the entire atomic-counter transaction. [VERIFIED: D-09 — Enterprise orgs never see usage gates]
**Warning signs:** TypeScript compiler may not catch this; runtime NEON error about invalid numeric value.

### Pitfall 7: useUsage hook breaking changes in MatchPage

**What goes wrong:** `MatchPage.tsx` reads `usage?.plan === 'free'` and `usage.count >= usage.limit` — both break after `UsageData.plan` is removed.
**Why it happens:** Renaming `plan` to `plan_tier` in `UsageData` is a breaking interface change that affects all consumers.
**How to avoid:** 15-02 must update ALL references to `usage.plan` in both `BillingPage.tsx` and `MatchPage.tsx` to use `usage.plan_tier`. Also update the `isAtLimit` derived value in MatchPage to handle `plan_tier` correctly: `usage.plan_tier === 'enterprise'` is never at limit.
**Warning signs:** TypeScript compile errors on `usage.plan` — these will surface at build time if types are updated before JSX consumers.

### Pitfall 8: RLS and processed_webhook_events

**What goes wrong:** The `processed_webhook_events` table has RLS enabled requiring `request.jwt.claims` — but webhook handler has no Clerk context, so all INSERTs fail with a policy violation.
**Why it happens:** RLS is enabled on all existing tables in schema.sql. If the same `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + org-isolation policy is applied to `processed_webhook_events`, the webhook handler (which has no org context) cannot INSERT.
**How to avoid:** Do NOT apply RLS to `processed_webhook_events`. The table has no `org_id` column; the webhook handler uses `neon(DATABASE_URL)` directly without `set_config('request.jwt.claims', ...)`. The migration must NOT include RLS statements for this table.
**Warning signs:** Webhook handler gets Postgres `ERROR: new row violates row-level security policy for table "processed_webhook_events"`.

---

## Code Examples

### Full lib/plans.ts

```typescript
// Source: D-13 from 15-CONTEXT.md [VERIFIED: decision captured]
// FILE: apps/worker/src/lib/plans.ts

export type PlanTier = 'free' | 'pro' | 'enterprise';

export const PLAN_LIMITS: Record<PlanTier, { matchRuns: number; stores: number }> = {
  free:       { matchRuns: 1,        stores: 3        },
  pro:        { matchRuns: 10,       stores: 10       },
  enterprise: { matchRuns: Infinity, stores: Infinity },
};
```

### Updated Env interface (types.ts)

```typescript
// Source: D-17 from 15-CONTEXT.md — STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_ENTERPRISE needed
// Old STRIPE_PRICE_ID remains for backward compat with any existing ref
export interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DATABASE_URL: string;
  ALLOWED_ORIGIN: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;              // Phase 5 legacy; kept for compat
  STRIPE_PRICE_ID_PRO: string;          // Phase 15
  STRIPE_PRICE_ID_ENTERPRISE: string;   // Phase 15
}
```

### Migration SQL for processed_webhook_events

```sql
-- Source: D-18 from 15-CONTEXT.md; table absence verified via grep [VERIFIED: no matches]
-- FILE: apps/worker/src/db/migrations/003-processed-webhook-events.sql

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  stripe_event_id  TEXT PRIMARY KEY,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — webhook handler has no org context; this table is not org-scoped
GRANT INSERT, SELECT ON processed_webhook_events TO pharmiq_app;
```

### create-checkout with tier param

```typescript
// Source: D-17 from 15-CONTEXT.md
billingRoute.post('/billing/create-checkout', async (c) => {
  const orgId = c.get('orgId');
  const body = await c.req.json<{ tier?: 'pro' | 'enterprise' }>();
  const tier = body.tier ?? 'pro';
  const priceId = tier === 'enterprise'
    ? c.env.STRIPE_PRICE_ID_ENTERPRISE
    : c.env.STRIPE_PRICE_ID_PRO;

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Store stripe_customer_id at session creation if customer_email known,
  // otherwise let Stripe create it and capture in webhook/confirm step
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // {CHECKOUT_SESSION_ID} is replaced by Stripe at redirect time (BILLING-09)
    success_url: `${c.env.ALLOWED_ORIGIN}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.env.ALLOWED_ORIGIN}/billing`,
    metadata: { org_id: orgId, tier },
    subscription_data: { metadata: { org_id: orgId, tier } },
  });

  return c.json({ url: session.url });
});
```

### BillingPage checkout=success detection (D-10)

```typescript
// Source: D-10 through D-12 from 15-CONTEXT.md
// In BillingPage.tsx — useEffect on mount
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    const sessionId = params.get('session_id');
    if (!sessionId) {
      setConfirmError('Upgrade confirmation failed — please refresh or contact support.');
      return;
    }
    setConfirming(true);
    fetchApi('/api/billing/confirm-checkout', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Confirm failed');
        const { plan_tier } = await res.json() as { plan_tier: string };
        setToastMessage(
          plan_tier === 'enterprise'
            ? "You're now on PharmIQ Enterprise"
            : "You're now on PharmIQ Pro"
        );
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000); // D-11: 3-second auto-dismiss
        // Remove checkout query params from URL without reload
        window.history.replaceState({}, '', '/billing');
        refresh(); // Refresh usage data to show new plan
      })
      .catch(() => {
        setConfirmError('Upgrade confirmation failed — please refresh or contact support.');
      })
      .finally(() => setConfirming(false));
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary `status = 'free' | 'paid'` | Three-tier `plan_tier = 'free' | 'pro' | 'enterprise'` | Phase 15 | All billing logic shifts to `plan_tier`; `status` column retained but not the decision column |
| Single `STRIPE_PRICE_ID` | `STRIPE_PRICE_ID_PRO` + `STRIPE_PRICE_ID_ENTERPRISE` | Phase 11 (env vars) + Phase 15 (code) | Both must be in `.dev.vars` and Worker secrets before deploying |
| Free limit = 1 run hardcoded | Limits from `PLAN_LIMITS` constant | Phase 15 | Changing limits is a code-only change in `lib/plans.ts` |
| No webhook idempotency | `processed_webhook_events` table deduplication | Phase 15 | Prevents double-billing on Stripe webhook retries |
| Async-only plan activation (webhook) | Sync confirm + async webhook | Phase 15 | User sees upgraded plan immediately after checkout redirect |

**Deprecated/outdated in Phase 15:**
- `match.ts` logic: `planStatus !== 'paid'` check — replaced with `planTier !== 'enterprise'` + PLAN_LIMITS lookup
- `billing.ts` GET /usage: `plan = subRows[0]?.status === 'paid' ? 'paid' : 'free'` — replaced with `plan_tier` read
- `billing.ts` POST /billing/create-checkout: `line_items: [{ price: c.env.STRIPE_PRICE_ID }]` — replaced with tier-selected price ID
- `UsageData.plan: 'free' | 'paid'` in `useUsage.ts` — replaced with `plan_tier: string`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `processed_webhook_events` has no RLS needed because the webhook handler never sets `request.jwt.claims` | Architecture Pattern 3 / Pitfall 8 | If wrong, webhook INSERT would fail with RLS policy violation — easy to detect and fix |
| A2 | Stripe's `{CHECKOUT_SESSION_ID}` template variable works in `success_url` with Cloudflare Pages redirect | Pattern 5 (success_url) | If Stripe does not substitute the variable, `session_id` query param will be literally `{CHECKOUT_SESSION_ID}` — visible in browser URL |
| A3 | Phase 11 migration has been applied to the live NEON database (plan_tier column exists on live subscriptions table) | All backend patterns | If Phase 11 has not been run against live DB, deploying Phase 15 Worker code will throw `column "plan_tier" does not exist` |
| A4 | `sub.items.data[0]?.price?.id` reliably identifies the tier in `customer.subscription.updated` for single-price subscriptions | Pattern 7 | PharmIQ uses single-item subscriptions; if multi-item subscriptions are ever used, first-item assumption breaks |
| A5 | Stripe Billing Portal is configured in the Stripe Dashboard before `create-portal-session` is called | Pitfall 5 / Runtime State | If portal not configured, API call succeeds but portal URL may show empty or error to user |

---

## Open Questions

1. **Does a confirm-checkout endpoint already exist, or does it need to be created?**
   - What we know: Current `billing.ts` has no `/confirm-checkout` route [VERIFIED: file read]. Current `success_url` uses `/billing?checkout=success` without `session_id`.
   - What's unclear: Whether the planner should update the existing `success_url` template in create-checkout AND create the new confirm endpoint in the same plan.
   - Recommendation: Yes — both changes are in 15-01 (backend plan). The `success_url` update and new `POST /billing/confirm-checkout` route go together.

2. **Should `checkout.session.completed` also be idempotency-guarded?**
   - What we know: Current webhook.ts handles `checkout.session.completed` with a SQL transaction (UPSERT), which is already effectively idempotent due to `ON CONFLICT DO UPDATE`. D-18 specifies idempotency for `customer.subscription.updated` specifically.
   - What's unclear: Whether the planner should extend deduplication to `checkout.session.completed` as well.
   - Recommendation: Add `processed_webhook_events` deduplication to `checkout.session.completed` too for consistency, but it is not strictly required since the UPSERT is already idempotent. Low priority if it adds complexity to 15-01.

3. **What happens to existing tests in billing.test.ts after UsageData changes?**
   - What we know: `billing.test.ts` has 3 GET /usage tests that assert `body.plan === 'free'` or `'paid'` [VERIFIED: file read]. After Phase 15, `plan` is removed from the response.
   - What's unclear: Whether 15-02 (frontend plan) or 15-01 (backend plan) is responsible for updating these tests.
   - Recommendation: 15-01 must update `billing.test.ts` to assert `plan_tier` instead of `plan`. The backend change and test update are tightly coupled.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stripe account (test mode) | Billing checkout + portal + webhooks | Yes [ASSUMED: Phase 5 already integrated] | stripe@22.0.2 | — |
| `STRIPE_PRICE_ID_PRO` | create-checkout tier=pro | In .dev.vars.example (placeholder) [VERIFIED: file read] | `price_xxx` placeholder | Must be real ID before UAT |
| `STRIPE_PRICE_ID_ENTERPRISE` | create-checkout tier=enterprise | In .dev.vars.example (placeholder) [VERIFIED: file read] | `price_xxx` placeholder | Must be real ID before UAT |
| NEON live database | processed_webhook_events migration | Available (Phase 11 established) [ASSUMED] | PostgreSQL (NEON serverless) | psql CLI as fallback to SQL console |
| Stripe Customer Portal configured | create-portal-session | Unknown — must be done in Stripe Dashboard manually | — | Cannot programmatically configure Portal; must be done by human |

**Missing dependencies with no fallback:**
- Real `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` values must be created in Stripe Dashboard before UAT. The plan specifies this is a pre-flight step.
- Stripe Customer Portal must be enabled and configured in Stripe Dashboard before `create-portal-session` UAT.

**Missing dependencies with fallback:**
- None — all code dependencies are installed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via `@cloudflare/vitest-pool-workers`) |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npm test` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILLING-05 | PLAN_LIMITS correct values (free=1/3, pro=10/10, enterprise=Infinity) | unit | `cd apps/worker && npm test` (billing.test.ts) | ❌ Wave 0 — new tests needed |
| BILLING-06 | Pro limit: 10th run succeeds, 11th returns 429 with upgrade_to='enterprise' | unit | `cd apps/worker && npm test` (billing.test.ts) | ❌ Wave 0 — update match tests |
| BILLING-07 | Store gate is match-time only — existing stores not blocked at upload | unit | `cd apps/worker && npm test` | ❌ Wave 0 — new match.test.ts cases |
| BILLING-08 | create-checkout passes correct price ID for 'pro' vs 'enterprise' tier | unit | `cd apps/worker && npm test` (billing.test.ts) | ❌ Wave 0 — update existing create-checkout tests |
| BILLING-09 | confirm-checkout endpoint writes plan_tier and returns it | unit | `cd apps/worker && npm test` (billing.test.ts) | ❌ Wave 0 — new endpoint, new tests |
| BILLING-10 | customer.subscription.updated sets plan_tier; duplicate event ID returns 200 without DB write | unit | `cd apps/worker && npm test` (webhook.test.ts) | ❌ Wave 0 — update webhook tests |
| BILLING-11 | create-portal-session returns { url } using stripe_customer_id | unit | `cd apps/worker && npm test` (billing.test.ts) | ❌ Wave 0 — new endpoint, new tests |
| BILLING-12 | BillingPage renders 3 cards, usage row, current plan highlight | manual / visual | N/A | Manual UAT |

### Sampling Rate

- **Per task commit:** `cd apps/worker && npm test` (existing + new tests must pass)
- **Per wave merge:** `cd apps/worker && npm test` (full suite green)
- **Phase gate:** Full suite green + manual UAT checklist before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/worker/src/__tests__/billing.test.ts` — extend with: plan-tier create-checkout tests, portal-session tests, confirm-checkout tests, usage endpoint plan_tier/store_count assertions. Update existing tests that assert `plan: 'paid'` to use `plan_tier: 'pro'`.
- [ ] `apps/worker/src/__tests__/match.test.ts` — extend with: Pro limit (10 runs), Enterprise skip, store-count gate (free 429 on >3 stores), correct `upgrade_to` field in 429/403 bodies. Update mock that returns `[{ status: 'paid' }]` to return `[{ plan_tier: 'pro' }]`.
- [ ] `apps/worker/src/__tests__/webhook.test.ts` — extend with: `customer.subscription.updated` sets plan_tier; idempotency (second call with same event ID returns 200, no DB write).
- [ ] `apps/worker/src/lib/plans.ts` — new file (Wave 0 creation, tested via billing/match tests).
- [ ] `apps/worker/src/db/migrations/003-processed-webhook-events.sql` — new migration file (manual NEON run, not auto-tested).

**No new test framework installs required.** Vitest + @cloudflare/vitest-pool-workers already configured [VERIFIED: vitest found in package.json scripts].

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — billing routes require Clerk JWT | `clerkAuth + requireOrg` middleware already applied to all `/api/*` routes [VERIFIED: index.ts] |
| V3 Session Management | no | N/A |
| V4 Access Control | yes — org-scoped billing data | RLS on subscriptions table; `plan_tier` reads always via `WHERE org_id = ${orgId}` |
| V5 Input Validation | yes — `tier` param in create-checkout, `sessionId` in confirm-checkout | Validate `tier` is `'pro' | 'enterprise'` before selecting price ID; validate `sessionId` is non-empty string |
| V6 Cryptography | yes — Stripe webhook signature | `stripe.webhooks.constructEventAsync` with `STRIPE_WEBHOOK_SECRET` (already implemented) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tier escalation via tampered `tier` param in create-checkout | Tampering | Validate `tier` against allowlist `['pro', 'enterprise']` before using; price ID comes from env, not client |
| Webhook replay attack | Tampering | Stripe signature verification with `constructEventAsync` (already in place); `processed_webhook_events` idempotency guard |
| Exposing `stripe_customer_id` in portal session response | Information Disclosure | Return only `{ url }` from `create-portal-session`; never return customer ID to frontend |
| Org isolation bypass via `session.metadata.org_id` | Spoofing | `org_id` in session metadata is set server-side from the authenticated `orgId` from Clerk JWT — never from client request body [VERIFIED: existing create-checkout sets `metadata: { org_id: orgId }` from `c.get('orgId')`] |
| Confirm-checkout endpoint called with arbitrary session ID | Tampering | The confirm endpoint must verify `session.metadata.org_id === c.get('orgId')` before writing `plan_tier` to prevent org A from confirming org B's session |

---

## Sources

### Primary (HIGH confidence)
- `apps/worker/src/routes/billing.ts` — current billing routes [VERIFIED: file read]
- `apps/worker/src/routes/webhook.ts` — current webhook handler [VERIFIED: file read]
- `apps/worker/src/routes/match.ts` — current match handler with existing free-tier gate [VERIFIED: file read]
- `apps/worker/src/types.ts` — current Env interface (missing PRO/ENTERPRISE price IDs) [VERIFIED: file read]
- `apps/worker/src/db/schema.sql` — confirms plan_tier exists on subscriptions; confirms processed_webhook_events does NOT exist [VERIFIED: file read]
- `apps/web/src/pages/BillingPage.tsx` — current single-card billing page [VERIFIED: file read]
- `apps/web/src/hooks/useUsage.ts` — current UsageData interface [VERIFIED: file read]
- `apps/web/src/pages/MatchPage.tsx` — existing upgrade modal wired to 429 [VERIFIED: file read]
- `apps/worker/.dev.vars.example` — confirms STRIPE_PRICE_ID_PRO/ENTERPRISE placeholders present [VERIFIED: file read]
- `apps/worker/wrangler.jsonc` — confirms wrangler secret entries documented [VERIFIED: file read]
- `.planning/phases/15-3-tier-billing/15-CONTEXT.md` — all locked decisions [VERIFIED: file read]
- Stripe `billingPortal.sessions.create` API [VERIFIED: WebFetch docs.stripe.com]
- Stripe `checkout.sessions.retrieve` API [VERIFIED: WebFetch docs.stripe.com]
- Stripe Subscription object `items.data[0].price.id` [VERIFIED: WebFetch docs.stripe.com]

### Secondary (MEDIUM confidence)
- WebSearch: Stripe billing portal sessions create TypeScript return_url (2026) — confirmed `stripe.billingPortal.sessions.create({ customer, return_url })` pattern
- WebSearch: `{CHECKOUT_SESSION_ID}` template variable in success_url [CITED: docs.stripe.com/api/checkout/sessions/create]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; zero new packages
- Architecture: HIGH — patterns derived directly from existing code + locked CONTEXT.md decisions
- Pitfalls: HIGH — derived from existing code inspection + known Stripe/NEON patterns

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (Stripe Node SDK stable; NEON HTTP driver stable; 30-day window)
