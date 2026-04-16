# Architecture Research: v1.1

**Milestone:** v1.1 — Reporting & Tiered Billing
**Researched:** 2026-04-16
**Confidence:** HIGH — derived from reading full current codebase, not from training data assumptions

---

## Context: What v1.0 Built

Before listing what changes, the current deployed architecture must be understood precisely:

**Worker routes (apps/worker/src/routes/):**
- `POST /api/upload` — multipart: storeName, storeNumber, rouFile, dsFile → NEON insert
- `GET /api/stores` — list stores with rou/ds upload timestamps per org
- `POST /api/match` — body `{ monthsCoverTarget, storeFilter[] }` → run matching algorithm → `{ results, warnings }`
- `GET /api/usage` — `{ count, limit, plan }` for current month
- `POST /api/billing/create-checkout` — creates Stripe Checkout session → `{ url }`
- `POST /api/stripe/webhook` — (public, no Clerk auth) handles `checkout.session.completed` and `customer.subscription.deleted`

**Current billing model (binary, not 3-tier):**
- `subscriptions.status`: `'free'` | `'paid'`
- `match.ts` enforces free limit: `if (planStatus !== 'paid')` → check `usage_meters`
- `billing.ts` returns: `plan === 'paid' ? -1 : 1` (unlimited vs 1 run/month)
- Single `STRIPE_PRICE_ID` env var — only one Stripe product configured

**Current dead_stock table — no cost column:**
```sql
CREATE TABLE IF NOT EXISTS dead_stock (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  description TEXT,
  soh         DOUBLE PRECISION,
  is_ranged   BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Parser — no cost_ex parsing:**
- `parseDeadStockFile` in `parser.ts` does not extract `Cost Ex` column
- `HEADER_ALIASES` already includes `"Cost Ex": ["Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"]` — mapping exists but is unused
- `DeadStockRow` interface has no `cost` field

**match.ts — hardcoded cost = 0:**
```typescript
items.push({ sku: row.sku, soh: row.soh, description: row.description, cost: 0 });
```

**Frontend (apps/web/src/):**
- `MatchPage.tsx` — results table, months cover control, store filter, upgrade modal
- `BillingPage.tsx` — binary free/paid display, upgrade CTA
- `Dashboard.tsx` — empty/populated state, links to Upload and Match
- `useMatchRun.ts`, `useStores.ts`, `useUsage.ts`, `useFetch.ts` — hooks
- No chart components exist yet

---

## New Components

### Worker: New Routes
| Route | File | Notes |
|-------|------|-------|
| `GET /api/dead-stock-summary` | `routes/deadStockSummary.ts` (new) | Returns per-store dead stock unit totals for pre-match pie chart; queries `dead_stock` table aggregated by store |

No new routes needed for post-match chart or cost report — these are computed client-side from match result data already returned by `POST /api/match`.

### Worker: Modified Routes
| Route | File | What Changes |
|-------|------|--------------|
| `POST /api/match` | `routes/match.ts` | Plan check changes from binary (`!== 'paid'`) to tier-aware (`'free'` vs `'pro'` vs `'enterprise'`); store count enforcement added for Pro tier |
| `GET /api/usage` | `routes/billing.ts` | Response gains `plan_tier` field (`'free'`\|`'pro'`\|`'enterprise'`) and tier-aware limits |
| `POST /api/billing/create-checkout` | `routes/billing.ts` | Accepts `tier: 'pro' | 'enterprise'` in request body; selects `STRIPE_PRICE_ID_PRO` or `STRIPE_PRICE_ID_ENTERPRISE` env var |
| `POST /api/stripe/webhook` | `routes/webhook.ts` | `checkout.session.completed` must write `plan_tier` to `subscriptions` based on which price was used; `customer.subscription.deleted` resets to `'free'` |

### Worker: New DB Migration
| Migration | What It Does |
|-----------|--------------|
| `ADD COLUMN cost_ex DOUBLE PRECISION` on `dead_stock` | Enables optional cost column storage; nullable so existing rows without cost are unaffected |
| `ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free'` on `subscriptions` | Replaces binary `status` with 3-value tier; or add alongside `status` as an alias |
| Add `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` env vars | No DB migration — `wrangler.jsonc` / `.dev.vars` change |

### Worker: Parser Change
| File | What Changes |
|------|--------------|
| `lib/parser.ts` — `parseDeadStockFile` | Extract `Cost Ex` column if present (alias already defined in `HEADER_ALIASES`); emit NaN for non-numeric; return as `cost?: number` on `DeadStockRow` |
| `lib/parser.ts` — `DeadStockRow` interface | Add `cost?: number` field |
| `routes/upload.ts` — dead_stock INSERT | Add `cost_ex` column to UNNEST INSERT if `cost` is present in parsed rows |

### Frontend: New React Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `DeadStockChart` | `components/DeadStockChart.tsx` | Pre-match pie chart — dead stock units per store; reads from `GET /api/dead-stock-summary` |
| `PostMatchChart` | `components/PostMatchChart.tsx` | Post-match bar/grouped-bar chart — "before" (total dead stock SOH per store) vs "after" (dead stock SOH minus transferred qty per store); computed client-side from match results |
| `CostReport` | `components/CostReport.tsx` | SOH vs Dead Stock dollar report panel; takes total SOH $ input + dead stock $ computed from match results; shows dead stock as % of total inventory |

### Frontend: Modified Pages/Components
| File | What Changes |
|------|--------------|
| `pages/MatchPage.tsx` | Add `PostMatchChart` below results table (shown after match run); add `CostReport` panel below chart |
| `pages/UploadPage.tsx` | Add `DeadStockChart` above upload form (shows current dead stock state per store); updates after successful upload |
| `pages/BillingPage.tsx` | Replace binary free/paid with 3-tier pricing cards (Free, Pro, Enterprise); upgrade CTA selects tier and calls `create-checkout` with `tier` parameter |
| `hooks/useUsage.ts` | Parse `plan_tier` from API response; expose in return value |
| `types/` (or inline) | `BillingPlan` type: `'free' | 'pro' | 'enterprise'` |

### Frontend: New Hook
| Hook | Purpose |
|------|---------|
| `useDeadStockSummary` | Fetches `GET /api/dead-stock-summary`; returns `{ summary: StoreDeadStockSummary[], loading, error }` |

### DB Schema Changes Summary
| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `dead_stock` | `cost_ex` | `DOUBLE PRECISION` nullable | Optional cost per unit from FRED export |
| `subscriptions` | `plan_tier` | `TEXT NOT NULL DEFAULT 'free'` | `'free'` \| `'pro'` \| `'enterprise'`; replaces binary logic |

---

## Modified Components

### `apps/worker/src/types.ts`
Current `Env` interface has `STRIPE_PRICE_ID: string`. Must add:
```typescript
STRIPE_PRICE_ID_PRO: string;
STRIPE_PRICE_ID_ENTERPRISE: string;
```
Remove `STRIPE_PRICE_ID` or keep as alias for backward compat during transition.

### `apps/worker/src/routes/match.ts`
Current plan check logic:
```typescript
const planStatus = ... ?? 'free';
if (planStatus !== 'paid') { /* enforce limit = 1 */ }
```
Must change to tier-aware:
```typescript
const planTier = sub?.plan_tier ?? 'free'; // 'free' | 'pro' | 'enterprise'
const limit = PLAN_LIMITS[planTier]; // { runs: number | null, stores: number | null }
if (limit.runs !== null && currentUsage >= limit.runs) return 429;
if (limit.stores !== null) { /* count distinct stores in rou_data, gate if over */ }
```

### `apps/worker/src/routes/billing.ts`
`GET /usage` response currently: `{ count, limit, plan }` where `plan` is `'free'`|`'paid'`.
Must become: `{ count, limit, planTier }` where `planTier` is `'free'`|`'pro'`|`'enterprise'`.

`POST /billing/create-checkout` currently uses single `c.env.STRIPE_PRICE_ID`.
Must accept `{ tier: 'pro' | 'enterprise' }` in body and select the correct price ID.

### `apps/worker/src/routes/webhook.ts`
On `checkout.session.completed`, must determine which tier was purchased (inspect `session.line_items` or store tier in `session.metadata` during checkout creation), then write `plan_tier` to `subscriptions`.

Recommended approach: pass `tier` in checkout session metadata at creation time:
```typescript
metadata: { org_id: orgId, plan_tier: tier },
```
Then in webhook:
```typescript
const planTier = session.metadata?.plan_tier ?? 'pro';
// UPDATE subscriptions SET plan_tier = $planTier ...
```

### `apps/web/src/pages/BillingPage.tsx`
Currently shows one plan card (Free vs Paid). Must show three plan cards with:
- Free: 1 match/mo, no store limit
- Pro: 10 matches/mo, max 10 stores, $10/mo
- Enterprise: unlimited matches and stores, $100/mo

### `apps/web/src/hooks/useUsage.ts`
Must parse new `planTier` field; expose to consumers.

### `apps/worker/src/lib/parser.ts`
`parseDeadStockFile` must optionally extract `Cost Ex` column. The `HEADER_ALIASES` mapping already exists — only the extraction logic and the `DeadStockRow` interface need to change.

---

## Data Flow: Pre-Match Chart

```
1. User navigates to Upload page (or Dashboard after upload)

2. Frontend: useDeadStockSummary hook fetches:
   GET /api/dead-stock-summary
   Headers: Authorization: Bearer <Clerk JWT>

3. Worker /dead-stock-summary route:
   a. Verify Clerk JWT → extract orgId (existing middleware, no change)
   b. Query NEON:
      SELECT s.name AS store_name,
             SUM(ds.soh) AS total_dead_stock_units,
             SUM(ds.soh * ds.cost_ex) AS total_dead_stock_value  -- nullable, 0 if cost_ex absent
      FROM dead_stock ds
      JOIN stores s ON s.id = ds.store_id
      WHERE ds.org_id = $orgId
      GROUP BY s.name
      ORDER BY total_dead_stock_units DESC
   c. Return: { stores: [{ name, totalUnits, totalValue }] }

4. Frontend: DeadStockChart component renders a Recharts PieChart
   - One slice per store
   - Label: store name + unit count
   - PharmIQ teal/amber palette for slices
   - Tooltip on hover shows units + optional $ value if cost_ex data available
   - "No data yet" empty state if array is empty
```

**Confidence:** HIGH — the query is straightforward aggregation against existing table structure; the chart is pure client-side Recharts rendering.

---

## Data Flow: Post-Match Chart

```
1. User clicks "Run Match" on MatchPage
2. POST /api/match returns { results, warnings } — existing flow, no change

3. Frontend computes chart data client-side from results array:

   // Group by sourceStore — compute units transferred out
   const transferredOut = Map<storeName, totalQtyTransferred>
   for each result in results:
     transferredOut[result.sourceStore] += result.bestMatch.qtyToTransfer

   // Compare against pre-match summary (from DeadStockChart hook, same data)
   for each store in deadStockSummary:
     before = store.totalUnits
     after  = Math.max(0, before - (transferredOut[store.name] ?? 0))
     → push { store: store.name, before, after } to chartData

4. PostMatchChart renders a Recharts BarChart with grouped bars:
   - X-axis: store names
   - Two bars per store: "Before" (total dead stock units) and "After" (projected remaining)
   - "Before" bar: amber (#D97706)
   - "After" bar: teal (#0F766E)
   - Tooltip shows delta (units freed)
   - Only shown when hasRun === true (same gate as existing results table)
```

**No new Worker route needed.** All computation is client-side from:
1. `useDeadStockSummary` data (already fetched on page load)
2. `results` array from `useMatchRun` (already in state)

**Dependency:** PostMatchChart depends on DeadStockSummary data being loaded. If `useDeadStockSummary` has not loaded yet when match completes, chart shows a loading state and renders once data arrives.

**Confidence:** HIGH — client-side aggregation of existing in-memory data; no new Worker work required.

---

## Data Flow: Cost/Dollar Report

```
1. PREREQUISITE: dead_stock table must have cost_ex column added (schema migration)
2. PREREQUISITE: parser must extract Cost Ex column (parser.ts change)
3. PREREQUISITE: upload route must write cost_ex to DB (upload.ts change)

Once above prerequisites are in place:

4. Dead stock summary endpoint already returns totalDeadStockValue
   (SUM(soh * cost_ex) per store — 0 if cost_ex is NULL/absent)

5. CostReport component on MatchPage:
   a. Displays total dead stock value ($) per store — from dead-stock-summary data
   b. User inputs total SOH value ($) in a text field (client-side only; not stored)
   c. Component computes:
      - Dead stock % = (sum of all stores' totalDeadStockValue) / userInputSOH × 100
      - Per-store breakdown: each store's totalDeadStockValue as % of userInputSOH
   d. Visual: progress bar or simple stat display (not a chart)
   e. Only shown if at least one store has cost_ex data (guard against $0/$0 display)

NO new Worker route needed — cost_ex aggregation is added to the existing
/dead-stock-summary endpoint query (SUM(soh * cost_ex) is already in the flow above).
```

**Note on optional cost_ex:** FRED exports may or may not include a Cost column. The system must handle absence gracefully:
- If `cost_ex IS NULL` for all rows of a store, `totalDeadStockValue` returns 0
- CostReport component shows a "Upload a file with a Cost Ex column to see dollar values" hint when totalDeadStockValue is 0 for all stores

**Confidence:** HIGH — the data path is clean; the only work is adding the column, extending the parser, and writing the frontend component.

---

## Data Flow: 3-Tier Billing

### Plan Limit Constants (Worker, shared module)

Define in `apps/worker/src/lib/plans.ts` (new small file):
```typescript
export const PLAN_LIMITS = {
  free:       { runsPerMonth: 1,  maxStores: null },  // null = no store limit
  pro:        { runsPerMonth: 10, maxStores: 10   },
  enterprise: { runsPerMonth: null, maxStores: null }, // null = unlimited
} as const;
export type PlanTier = keyof typeof PLAN_LIMITS;
```

### Stripe Checkout Flow (3-tier)

```
1. User visits BillingPage — sees 3 plan cards

2. User clicks "Upgrade to Pro" or "Upgrade to Enterprise":
   Frontend → POST /api/billing/create-checkout { tier: 'pro' | 'enterprise' }

3. Worker billing route:
   a. Read tier from request body
   b. Select price ID: tier === 'pro' ? STRIPE_PRICE_ID_PRO : STRIPE_PRICE_ID_ENTERPRISE
   c. Create Stripe Checkout session:
      - line_items: [{ price: priceId, quantity: 1 }]
      - metadata: { org_id: orgId, plan_tier: tier }   ← CRITICAL for webhook
   d. Return { url: session.url }

4. Frontend redirects to Stripe Checkout (window.location.href = url) — existing pattern

5. User completes payment on Stripe-hosted page

6. Stripe fires checkout.session.completed webhook:
   Worker webhook route:
   a. Verify Stripe-Signature (existing WebCrypto pattern)
   b. Extract org_id and plan_tier from session.metadata
   c. UPSERT subscriptions:
      INSERT INTO subscriptions (org_id, stripe_customer_id, stripe_subscription_id, status, plan_tier)
      VALUES ($orgId, $customerId, $subscriptionId, 'active', $planTier)
      ON CONFLICT (org_id) DO UPDATE
        SET stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            status = 'active',
            plan_tier = EXCLUDED.plan_tier,
            updated_at = NOW()
   d. Return 200

7. User redirected to /billing?checkout=success (existing success_url)
   Frontend: BillingPage shows new plan tier on load
```

### Runtime Enforcement at Match Time (match.ts)

```
POST /api/match receives request → existing auth middleware → in match handler:

1. Fetch plan_tier from subscriptions:
   SELECT plan_tier FROM subscriptions WHERE org_id = $orgId LIMIT 1
   → planTier = result?.plan_tier ?? 'free'

2. Look up limits:
   const limits = PLAN_LIMITS[planTier]

3. Check run limit (if finite):
   if (limits.runsPerMonth !== null) {
     // existing usage_meters check — same atomic upsert pattern
     // change freeLimit from hardcoded 1 to limits.runsPerMonth
   }

4. Check store count (Pro tier only):
   if (limits.maxStores !== null) {
     const storeCount = await countDistinctStores(orgId, dbUrl);
     // COUNT DISTINCT store_id FROM rou_data WHERE org_id = $orgId
     if (storeCount > limits.maxStores) {
       return 403 { error: 'Store limit reached. Upgrade to Enterprise for unlimited stores.' }
     }
   }

5. If all checks pass → proceed with existing match algorithm
```

### Store Count Enforcement: Upload vs Match Time

**Decision: enforce at match time, not upload time.**

Rationale:
- Enforcing at upload time means a Pro user who uploads an 11th store gets a confusing error during file upload, which is not obviously related to their plan
- The match is the monetized action — this is where enforcement is architecturally correct
- Enforcing at upload time also creates edge cases (store added, then plan changed, store data stranded)
- Gate: at match run, count `DISTINCT store_id` in `rou_data WHERE org_id = $orgId`

### Subscription Cancellation

When `customer.subscription.deleted` fires:
- Existing webhook pattern resets `status = 'free'` — must also reset `plan_tier = 'free'`
- No behavior change needed in match enforcement (it reads plan_tier, free → 1 run/mo limit)

---

## Suggested Build Order

Build order respects hard dependencies: schema before code that uses it; parser before upload that calls it; endpoint before frontend that fetches it.

### Phase 1: Schema Migration (prerequisite for everything else)
1. Add `cost_ex DOUBLE PRECISION` column to `dead_stock` table (nullable — no default needed)
2. Add `plan_tier TEXT NOT NULL DEFAULT 'free'` column to `subscriptions` table
3. Update `schema.sql` to reflect both columns
4. No Worker or frontend code changes needed for this phase

**Gate:** `\d dead_stock` shows `cost_ex` column; `\d subscriptions` shows `plan_tier` column.

**Rationale:** All subsequent phases depend on these columns existing. Cannot test cost parsing without `cost_ex`. Cannot test 3-tier billing without `plan_tier`. Do this first.

---

### Phase 2: Cost Column — Parser + Upload + Summary Endpoint
1. `parser.ts`: Add `cost?: number` to `DeadStockRow` interface; extract `Cost Ex` column in `parseDeadStockFile`
2. `upload.ts`: Include `cost_ex` in dead_stock UNNEST INSERT (pass null when `cost` is absent)
3. New `routes/deadStockSummary.ts`: `GET /api/dead-stock-summary` — aggregate by store, include `totalValue`
4. Register route in `index.ts`
5. New `hooks/useDeadStockSummary.ts` on frontend
6. Tests: parser test for cost_ex extraction; upload test for cost_ex write; integration test for summary endpoint

**Gate:** Upload a FRED dead-stock file with Cost Ex column; verify `cost_ex` rows written to DB; `GET /api/dead-stock-summary` returns `totalValue > 0`.

**Rationale:** Parser and DB column must exist before any chart or cost report can show dollar values. The summary endpoint also powers the pre-match chart (Phase 3), so it must be built here.

---

### Phase 3: Charts — Pre-Match and Post-Match
1. Install Recharts (or shadcn/ui charts which wrap Recharts): `npm install recharts` in `apps/web`
2. `components/DeadStockChart.tsx`: PieChart using `useDeadStockSummary` data; PharmIQ color palette; empty state
3. Add `DeadStockChart` to `UploadPage.tsx` (below store list, above upload form)
4. `components/PostMatchChart.tsx`: Grouped BarChart; client-side aggregation from match results + dead-stock summary; "Before/After" bars; empty state until match run
5. Add `PostMatchChart` to `MatchPage.tsx` (below results table, above cost report)

**Gate:** Pre-match chart renders immediately after upload with correct per-store unit counts; post-match chart renders after Run Match with correct before/after deltas.

**Rationale:** Charts depend on `useDeadStockSummary` (Phase 2). Post-match chart is client-side only and has no new Worker work — can be built in the same phase as pre-match chart.

---

### Phase 4: Cost Report UI
1. `components/CostReport.tsx`: Total SOH input field; dead stock $ display; dead stock % of total inventory; per-store breakdown
2. Add `CostReport` to `MatchPage.tsx` (below PostMatchChart)
3. Guard: only render `CostReport` when at least one store has `totalValue > 0` (i.e., cost_ex data was uploaded)

**Gate:** Upload dead-stock file with Cost Ex; run match; CostReport shows correct dollar values and % of SOH.

**Rationale:** CostReport depends on cost_ex data in DB (Phase 2) and the summary endpoint (Phase 2). Does not depend on charts (Phase 3) but logically follows them on the page. Could be built in Phase 3 if velocity allows.

---

### Phase 5: 3-Tier Billing
1. `apps/worker/src/lib/plans.ts`: New file — `PLAN_LIMITS` constant and `PlanTier` type
2. `routes/billing.ts`: `GET /usage` — read and return `plan_tier` from DB; update `create-checkout` to accept `tier` parameter and select correct price ID
3. `types.ts`: Add `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` to `Env` interface; remove `STRIPE_PRICE_ID` or deprecate
4. `.dev.vars.example`: Add `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE`
5. `routes/match.ts`: Replace hardcoded `freeLimit = 1` with `PLAN_LIMITS[planTier].runsPerMonth`; add store count check for Pro tier
6. `routes/webhook.ts`: Write `plan_tier` from `session.metadata.plan_tier` to `subscriptions`; reset `plan_tier = 'free'` on subscription deletion
7. `hooks/useUsage.ts` (frontend): Parse `planTier` from API; expose in hook return value
8. `pages/BillingPage.tsx`: Replace binary plan card with 3 pricing cards; wire upgrade buttons to `create-checkout` with `tier` parameter
9. `pages/MatchPage.tsx`: Update upgrade modal copy to mention tiers (not just "Pro")

**Gate:**
- Free org: 1st match succeeds, 2nd returns 429; upgrade modal fires
- Pro org (test): 10th match succeeds, 11th returns 429; >10 stores returns 403
- Enterprise org (test): unlimited runs, unlimited stores
- Webhook: `plan_tier` written correctly on checkout completion

**Rationale:** 3-tier billing is the most complex phase because it touches billing routes, match enforcement, webhook handling, and frontend. It is placed last because all other features (charts, cost report) can be built and tested without it. The schema migration in Phase 1 is the only prerequisite — once `plan_tier` column exists, this phase can proceed independently of Phases 2–4.

---

## Chart Library Decision

**Use Recharts directly, not shadcn/ui chart wrappers.**

Recharts is already the underlying library for shadcn/ui charts. The shadcn/ui chart components add copy-paste convenience but also add opacity — for PharmIQ's specific color palette and dark mode requirements, writing Recharts components directly gives full control with no extra abstraction layer.

**Install:** `npm install recharts` in `apps/web` package only (no Worker dependency).

**Relevant Recharts components:**
- `PieChart` + `Pie` + `Cell` — for pre-match store distribution
- `BarChart` + `Bar` + `XAxis` + `YAxis` + `Tooltip` + `Legend` — for post-match before/after comparison
- `ResponsiveContainer` — wraps both charts for responsive sizing

**Dark mode:** Recharts renders SVG. Colors come from the data/Cell props, not CSS. PharmIQ's CSS variable approach (`var(--color-teal)`) does NOT work inside SVG fill props. Use hex literals in chart components:
- Teal: `#0F766E` (primary) / `#0D9488` (lighter)
- Amber: `#D97706`
- Slate: `#64748B` (labels, axes)
- Background for tooltips: derive from CSS custom properties on the container div, not SVG

---

## 3-Tier Billing: Stripe Configuration Required

Two new Stripe products and prices must be created in the Stripe dashboard before Phase 5 code runs:
1. Product: "PharmIQ Pro" → Monthly price: $10/mo → price ID stored as `STRIPE_PRICE_ID_PRO`
2. Product: "PharmIQ Enterprise" → Monthly price: $100/mo → price ID stored as `STRIPE_PRICE_ID_ENTERPRISE`

These are manual dashboard actions, not code. Must be done in both test mode and live mode.

---

## Integration Point Map

| Feature | Worker Change | DB Change | Frontend Change | Depends On |
|---------|--------------|-----------|-----------------|------------|
| cost_ex column | upload.ts (write cost_ex) | dead_stock.cost_ex | — | Phase 1 migration |
| Parser cost_ex | parser.ts | — | — | Phase 1 migration |
| Dead stock summary | New GET /dead-stock-summary | — | useDeadStockSummary hook | cost_ex column |
| Pre-match pie chart | — | — | DeadStockChart component, UploadPage | summary endpoint |
| Post-match bar chart | — | — | PostMatchChart component, MatchPage | summary endpoint + match results |
| Cost report | — | — | CostReport component, MatchPage | summary endpoint (totalValue) |
| plan_tier column | billing.ts, match.ts, webhook.ts | subscriptions.plan_tier | BillingPage, useUsage | Phase 1 migration |
| 3-tier limits | match.ts (plans.ts) | — | BillingPage, MatchPage modal | plan_tier column |
| Multi-price checkout | billing.ts (create-checkout) | — | BillingPage (tier buttons) | STRIPE_PRICE_ID_PRO/ENTERPRISE env vars |
| Webhook tier write | webhook.ts | — | — | plan_tier column, tier in metadata |

---

*Researched: 2026-04-16*
