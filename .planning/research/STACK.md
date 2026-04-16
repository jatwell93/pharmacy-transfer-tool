# Stack Research: v1.1

**Project:** PharmIQ Stock Transfer — v1.1 Reporting & Tiered Billing
**Researched:** 2026-04-16
**Scope:** Additions and changes only. Existing v1.0 stack (Hono, NEON, Clerk, Vite, React 19, Tailwind 4, @react-pdf/renderer, SheetJS) is validated and unchanged.

---

## Charting Library

### Recommendation: recharts 3.x

**Install:**
```bash
npm install recharts
```

If npm throws peer dep errors due to `react-is`, add this override to `apps/web/package.json`:
```json
"overrides": {
  "react-is": "^19.0.0"
}
```
Then re-run `npm install`. This is the shadcn/ui-documented workaround (MEDIUM confidence — documented by shadcn, not by recharts maintainers directly, though issue #4558 is closed/completed).

**Version:** 3.8.1 (current as of April 2026). Latest stable releases as of research date.

**Why recharts, not the alternatives:**

| Criterion | recharts | Chart.js (react-chartjs-2) | visx | victory |
|-----------|----------|---------------------------|------|---------|
| React-native API | Yes — SVG component composition | No — imperative canvas API wrapped in React | Yes — low-level primitives | Yes |
| SSR / Cloudflare Pages safe | Yes — SVG renders without `window`/`canvas` | No — requires `document.createElement('canvas')` | Yes | Yes |
| Pie chart | PieChart + Pie + Cell | Yes | Yes (complex setup) | VictoryPie |
| Bar/grouped-bar chart | BarChart + Bar (multiple Bar children = grouped) | Yes | Yes (complex setup) | VictoryBar |
| Bundle size | ~300 KB min, ~90 KB gzip | ~200 KB min, ~70 KB gzip | Modular (pay per primitive) | ~400 KB+ |
| Learning curve | Low (declarative JSX) | Medium (config object) | High (D3 primitives) | Low |
| React 19 support | Resolved (issue #4558 closed) | Yes | Yes | Yes |
| Tailwind 4 compatible | Yes (no CSS conflict) | Yes | Yes | Yes |

**Chart.js is ruled out** because canvas-based rendering requires `document.createElement('canvas')`, which fails in Cloudflare Pages SSR pre-render and also fails in any worker-side rendering. While this app is a SPA (no SSR), the canvas dependency is a fragility — it also cannot render without a live DOM, meaning any component that mounts before hydration can throw. recharts uses SVG, which serialises cleanly.

**visx is ruled out** because it is D3 primitive wrappers — appropriate for custom visualisation products, not for adding two standard chart types to an existing app in a milestone. Setup effort is disproportionate to the need.

**victory is ruled out** because it has the largest bundle of the contenders and no meaningful advantage over recharts for standard pie + bar charts.

**Charts needed for v1.1:**

1. **Dead stock units per store (pre-match)** — `PieChart` + `Pie` + `Cell` (one slice per store, sized by total dead-stock SOH units). Colour each store slice using the PharmIQ teal/amber palette.

2. **Projected change chart (post-match)** — `BarChart` with two `Bar` children per store: current dead SOH vs. projected remaining dead SOH after all recommended transfers. This is a grouped bar chart (side-by-side bars per store), which recharts supports natively by rendering multiple `<Bar dataKey="...">` elements inside one `<BarChart>`.

**Cloudflare Pages compatibility:** recharts is SVG-only, pure React, no canvas, no `window` dependency at import time. Vite tree-shakes unused chart types. No known issues with Cloudflare Pages static hosting.

**Bundle size note:** recharts adds approximately 90 KB gzip to the frontend bundle. Given `@react-pdf/renderer` (~150 KB gzip) is already in the bundle, this keeps the total well under Cloudflare Pages' 25 MB asset limit. For Vite, only imported chart components are bundled — import only `{ PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer }`.

**Confidence: MEDIUM** — recharts 3.x React 19 compatibility confirmed via GitHub issue #4558 (closed) and shadcn/ui docs. Bundle size estimate from community reports (Bundlephobia was unreachable during research). SSR safety confirmed from recharts docs statement that SVG renders in isomorphic contexts.

---

## Stripe Multi-Tier

### Current state

The existing integration (Phase 5) uses:
- One `STRIPE_PRICE_ID` env binding pointing to a single paid price
- `checkout.session.completed` webhook: sets `subscriptions.status = 'paid'`
- `customer.subscription.deleted` webhook: sets `subscriptions.status = 'free'`
- Plan check in `match.ts`: `planStatus !== 'paid'` triggers usage enforcement
- `billing.ts` `/usage` route: returns `plan: 'free' | 'paid'` and `limit: 1 | -1`

### Target state

Three tiers: **Free** (1 match/mo, any stores), **Pro** ($10/mo, 10 matches/mo, max 10 stores), **Enterprise** ($100/mo, unlimited matches and stores).

### Stripe product/price setup

Create **two** Stripe products (in Stripe dashboard or via API):
- Product: "PharmIQ Pro" — one recurring Price: $10 AUD/month → gives `price_pro_xxx` ID
- Product: "PharmIQ Enterprise" — one recurring Price: $100 AUD/month → gives `price_enterprise_xxx` ID

Store both price IDs as Worker env secrets:
```
STRIPE_PRICE_ID_PRO=price_pro_xxx
STRIPE_PRICE_ID_ENTERPRISE=price_enterprise_xxx
```

Add both to the `Env` interface in `types.ts`.

### Checkout session changes

The `/billing/create-checkout` endpoint must accept a `tier` parameter in the request body (`'pro' | 'enterprise'`) and select the correct price ID:
```typescript
const priceId = tier === 'enterprise'
  ? c.env.STRIPE_PRICE_ID_ENTERPRISE
  : c.env.STRIPE_PRICE_ID_PRO;
```

### Webhook changes

**Add `customer.subscription.updated`** to the webhook handler. This fires when a customer upgrades or downgrades between Pro and Enterprise via the Stripe Customer Portal or an API call.

Read the new plan tier from `subscription.items.data[0].price.id` (not from metadata — the `plan_tier` in metadata is not auto-updated by Stripe on subscription changes):

```typescript
if (event.type === 'customer.subscription.updated') {
  const sub = event.data.object as Stripe.Subscription;
  const priceId = sub.items.data[0]?.price?.id;
  const tier = priceId === env.STRIPE_PRICE_ID_ENTERPRISE ? 'enterprise' : 'pro';
  // Update subscriptions table: status = tier
}
```

**`checkout.session.completed`** handler needs to write the tier (not just 'paid') to `subscriptions.status`. Read `session.subscription`, then look up the subscription object to get the price ID — OR pass `tier` as a metadata field on `subscription_data` at checkout creation time (simpler):

```typescript
subscription_data: {
  metadata: { org_id: orgId, plan_tier: tier },  // add plan_tier here
}
```

Then in the webhook: `session.metadata?.plan_tier ?? 'pro'` gives the tier directly without a second Stripe API call.

**`customer.subscription.deleted`** handler is unchanged — always reverts to `'free'`.

**Events to listen for (complete set):**
- `checkout.session.completed` — initial subscription activation (set tier)
- `customer.subscription.updated` — tier upgrade/downgrade (update tier)
- `customer.subscription.deleted` — cancellation/expiry (revert to free)
- `invoice.payment_failed` — optional: flag `status = 'past_due'` if grace period needed

**Confidence: HIGH** — Stripe official docs confirm `customer.subscription.updated` is the correct event for plan changes; `subscription.items.data[0].price.id` is the authoritative field for new plan identification. Metadata approach for passing tier through checkout is documented as a standard Stripe pattern.

---

## Schema Changes

### Current schema gaps

The existing `subscriptions` table stores only binary state:
```sql
status TEXT NOT NULL DEFAULT 'free'  -- values: 'free' | 'paid'
```

The `orgs` table has a `plan` column but it is not written to by any current route (it defaults to `'free'` and stays there).

The `usage_meters` table hardcodes the free tier limit as a constant (`freeLimit = 1`) in application code.

### Required changes

#### 1. `subscriptions.status` — expand value set

No ALTER needed for the column type (already `TEXT`). The application will simply write `'free'`, `'pro'`, or `'enterprise'` as values. Update all plan-check logic to treat `'pro'` and `'enterprise'` as paid tiers:

```typescript
// Old
const isPaid = planStatus === 'paid';

// New
const isPaid = planStatus === 'pro' || planStatus === 'enterprise';
const isEnterprise = planStatus === 'enterprise';
```

#### 2. Migration SQL (apply via NEON SQL editor)

```sql
-- Migration 002: v1.1 multi-tier billing
-- Adds stripe_price_id to subscriptions for audit trail
-- Adds plan_tier to orgs (kept in sync with subscriptions.status)

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- No type change needed for status — it's already TEXT.
-- Update any existing 'paid' rows to 'pro' (the lower paid tier)
UPDATE subscriptions SET status = 'pro' WHERE status = 'paid';

-- Keep orgs.plan in sync (currently always 'free' — update via webhook going forward)
-- No schema change needed for orgs.plan — it's already TEXT.
```

#### 3. Store-count enforcement (Pro tier: max 10 stores)

Do NOT add a `store_limit` column to the schema. This is plan-aware logic, not a stored value. Enforce it at the upload endpoint before inserting a new store row:

```typescript
// In the upload route, before INSERT INTO stores:
if (planStatus === 'pro') {
  const storeCountRows = await sql`
    SELECT COUNT(*) AS count FROM stores WHERE org_id = ${orgId}
  `;
  const storeCount = Number(storeCountRows[0]?.count ?? 0);
  if (storeCount >= 10) {
    return c.json({ error: 'Pro plan limited to 10 stores. Upgrade to Enterprise for unlimited stores.' }, 403);
  }
}
```

This keeps the schema clean and avoids stale limit values if plan logic changes.

#### 4. Usage limit enforcement (Pro tier: 10 matches/mo)

The match route currently hardcodes `freeLimit = 1`. For Pro, the limit is 10. Extract limits from plan status:

```typescript
const limits: Record<string, number> = {
  free: 1,
  pro: 10,
  enterprise: Infinity,
};
const matchLimit = limits[planStatus] ?? 1;

if (matchLimit !== Infinity) {
  // Run the existing upsert+increment pattern with matchLimit instead of freeLimit
}
```

No schema change needed — `usage_meters` is already plan-agnostic (it stores a count; the limit is enforced by the application comparing count against the plan-derived limit).

#### 5. `subscriptions.stripe_price_id` — optional audit column

Add `stripe_price_id TEXT` to `subscriptions` to record which Stripe price ID was active at last update. This helps debug tier mismatches without querying the Stripe API. Written by the webhook handler on `checkout.session.completed` and `customer.subscription.updated`.

**Summary of migration file to create:**

```sql
-- File: apps/worker/src/db/migrations/002-multi-tier-billing.sql

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

UPDATE subscriptions
  SET status = 'pro'
  WHERE status = 'paid';
```

**Confidence: HIGH** — schema analysis is based on direct reading of the existing schema.sql in this repo. Logic for plan enforcement is a code pattern, not a schema design question.

---

## Cost Column (SOH vs Dead Stock Dollar Report)

No new library is needed. The dead stock upload already parses FRED export columns via header aliasing (`HEADER_ALIASES` dict). Adding `Cost Ex` (cost price per unit) follows the same pattern:

- Add `cost_ex` to the `HEADER_ALIASES` map in the upload route (or equivalent header normalisation logic)
- Add `cost_ex DOUBLE PRECISION` column to the `dead_stock` table
- Calculate `dead_stock_value = soh * cost_ex` per row in the Worker after parsing
- Frontend: user inputs `total_soh_value_aud`, Worker or frontend calculates `dead_stock_value / total_soh_value_aud * 100` to get the percentage

**Migration SQL for `dead_stock.cost_ex`:**
```sql
ALTER TABLE dead_stock
  ADD COLUMN IF NOT EXISTS cost_ex DOUBLE PRECISION;
```

This column is nullable — existing rows without Cost Ex data are unaffected, and the dollar report feature gracefully degrades if Cost Ex is absent from an upload.

**Confidence: HIGH** — this is a straightforward additive column following the existing pattern.

---

## What NOT to Add

| Library/Approach | Avoid Because |
|-----------------|---------------|
| Chart.js / react-chartjs-2 | Canvas-dependent; cannot render without DOM; fragile in any pre-render context; unnecessary given recharts SVG approach |
| D3 directly | Low-level primitive; 10x more setup than recharts for two standard chart types; bundle weight equivalent |
| visx (@visx/*) | Airbnb's D3 wrapper; appropriate for custom viz products, not standard chart types; steep learning curve |
| nivo | Larger bundle than recharts; adds its own animation system that conflicts with React 19's concurrent rendering in some edge cases (LOW confidence flag); also SVG-based like recharts but heavier |
| Multiple Stripe subscriptions per customer | Stripe docs warn: each subscription has its own billing period and invoice. For tier switching, update the single subscription's price — do NOT create a second subscription. Creating multiple subscriptions per customer causes double-billing and complicates cancellation logic. |
| Stripe Plans API (deprecated) | The `Plan` object is a legacy alias for `Price`. Use the `Price` object and Products API. Plans are read-only now in newer API versions. |
| `plan_tier` column on `subscriptions` table | Redundant — `status` already stores the tier value (`'free'`, `'pro'`, `'enterprise'`). Adding a separate `plan_tier` column creates a sync risk between two columns holding the same truth. |
| `store_limit` column on `orgs` or `subscriptions` | Hard-coding a limit value in the DB creates stale-value risk when plan rules change. Keep limits as application constants keyed by plan name. |
| Recharts 2.x | React 19 compatibility required the `react-is` override workaround in 2.x. 3.x resolved this and removed the `react-smooth` and `recharts-scale` dependencies — cleaner bundle. Use 3.x. |

---

## Sources

- recharts React 19 support (Issue #4558, closed): https://github.com/recharts/recharts/issues/4558
- recharts 3.0 migration guide: https://github.com/recharts/recharts/wiki/3.0-migration-guide
- shadcn/ui recharts + React 19 override docs: https://ui.shadcn.com/docs/react-19
- recharts npm (version 3.8.1): https://www.npmjs.com/package/recharts
- Stripe upgrade/downgrade subscriptions: https://docs.stripe.com/billing/subscriptions/upgrade-downgrade
- Stripe webhooks for subscriptions: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe metadata use cases: https://docs.stripe.com/metadata/use-cases
- Stripe change subscription price: https://docs.stripe.com/billing/subscriptions/change-price
- Stripe multiple products in one subscription: https://docs.stripe.com/billing/subscriptions/multiple-products

*Researched: 2026-04-16*
