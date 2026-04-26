# Roadmap: PharmIQ Stock Transfer

## Overview

This roadmap rebuilds the PharmIQ Stock Transfer tool from a working Django + React prototype onto the Cloudflare Workers + NEON Postgres + Clerk production stack. The build follows a strict dependency order: infrastructure and auth come first (nothing else is safe without them), the algorithm is audited before it is ported, file upload is built before matching runs against it, freemium enforcement gates real usage before external users are onboarded, and brand polish closes out the milestone. Six phases deliver a fully functional, multi-tenant, freemium-enabled dead-stock matching tool.

## Pre-Flight Setup

Run these once before Phase 1 to reduce manual dashboard work and equip Claude with the right tools.

### 1. Install Relevant Skills

Skills add domain-specific best-practice guidance to Claude's context for this project:

```bash
# Cloudflare Workers patterns, Wrangler config, edge runtime gotchas
npx skills add https://github.com/cloudflare/workers-sdk --skill workers-best-practices

# NEON Postgres connection patterns for serverless environments
npx skills add https://github.com/neondatabase/neon --skill neon-serverless
```

> Run `/skills` in Claude to see what's installed. Add others as needed.

### 2. Set Up MCP Servers

MCP servers let Claude directly manage Cloudflare and NEON resources without you manually using their dashboards. This removes you as the bottleneck for infra setup steps.

**Cloudflare MCP** — manage Workers, R2 buckets, Pages projects, DNS, secrets, and KV from Claude:
```bash
# Install the Cloudflare MCP server
npx @cloudflare/mcp-server-cloudflare
```
Then add to your Claude MCP config (`~/.claude/mcp.json` or Claude Desktop settings):
```json
{
  "cloudflare": {
    "command": "npx",
    "args": ["@cloudflare/mcp-server-cloudflare"],
    "env": { "CLOUDFLARE_API_TOKEN": "your-token-here" }
  }
}
```
Get your API token: Cloudflare Dashboard → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template).

**NEON MCP** — create database branches, run migrations, inspect schemas from Claude:
```bash
npx @neondatabase/mcp-server-neon
```
```json
{
  "neon": {
    "command": "npx",
    "args": ["@neondatabase/mcp-server-neon"],
    "env": { "NEON_API_KEY": "your-api-key-here" }
  }
}
```
Get your API key: NEON Console → Account → API Keys.

> Once configured, Claude can create NEON projects, run `wrangler` commands, set Workers secrets, and manage R2 buckets directly — no dashboard switching needed.

### 3. Workers Paid Plan

⚠️ **Hard blocker** — the free plan's 10 ms CPU limit will fail on the first CSV parse. Upgrade before Phase 1:
Cloudflare Dashboard → Workers & Pages → Plans → Upgrade to Paid ($5/month base).

### Phase 10: fix schema.sql + .dev.vars.example + webhook.test.ts failure + subscriptions.status DEFAULT naming

**Goal:** Close tech-debt items from v1.0 milestone audit — schema.sql fixes, DX config completeness, and documentation sync
**Requirements**: TBD
**Depends on:** Phase 9
**Plans:** 1/1 plans complete

Plans:
- [x] 10-01-PLAN.md — Schema fixes, DX config completeness, and Phase 9 close

---

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Infrastructure, Clerk auth, NEON schema, and authenticated API skeleton — everything else depends on this (completed 2026-03-28)
- [x] **Phase 2: Logic Audit** - Audit and document the existing Django matching algorithm before porting to TypeScript (completed 2026-03-29)
- [x] **Phase 3: File Upload Pipeline** - Multi-store FRED CSV/XLSX upload, parsing, persistence, and per-store status UI (completed 2026-03-30)
- [x] **Phase 4: Matching Algorithm** - Port the audited algorithm, add months-cover cap, and display results in a virtualized table (completed 2026-03-31)
- [x] **Phase 5: Freemium and Billing** - Atomic usage metering, upgrade prompt, and Stripe subscription integration (completed 2026-04-12)
- [x] **Phase 6: Brand, UI and Export** - PharmIQ design system, dark mode, and client-side PDF export (completed 2026-04-12)
- [x] **Phase 7: Fix is_ranged Schema and Pipeline** - Add is_ranged column to rou_data, update ROU upload INSERT, and wire match route to read real ranged status (Gap Closure) (completed 2026-04-12)
- [x] **Phase 8: Phase 04 Verification** - Formally verify all 8 Phase 04 requirements (MATCH-01..07, RESULTS-01) by creating VERIFICATION.md (Gap Closure) (completed 2026-04-12)
- [x] **Phase 9: Requirements and Roadmap Documentation Sync** - Update stale REQUIREMENTS.md checkboxes and ROADMAP.md status for all completed phases (Gap Closure) (completed 2026-04-13)

## Phase Details

### Phase 1: Foundation
**Goal**: A deployable, authenticated scaffold exists — developers can make an authenticated API call that returns the caller's verified org ID, and all NEON tables with RLS are in place
**Depends on**: Nothing (first phase) — manual prerequisite: upgrade Cloudflare Workers account to Paid plan before starting
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can sign in via Clerk (email or social) and is redirected to the app dashboard
  2. An authenticated API request to the Hono Worker returns the caller's org_id sourced exclusively from the verified Clerk JWT
  3. A request with a missing or invalid Clerk JWT is rejected with a 401 before any database operation runs
  4. A request from a user with no active Clerk organisation is rejected with a 403 before any database operation runs
  5. All NEON tables exist with org_id columns and Row Level Security policies enforced
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Worker API with Clerk auth middleware, NEON schema with RLS, and tests
- [x] 01-02-PLAN.md — React SPA with Clerk auth, PharmIQ-branded app shell
- [x] 01-03-PLAN.md — Integration wiring and end-to-end auth verification
**UI hint**: yes

### Phase 2: Logic Audit
**Goal**: The existing Django matching algorithm is fully documented and all correctness issues are captured as failing test cases before any TypeScript is written
**Depends on**: Phase 1
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. A written algorithm spec exists covering sell-through filter, months-cover cap formula, ranged sort order, is_ranged parsing, and NaN/missing-value edge cases — each with a worked example
  2. The ported TypeScript matching function has passing unit tests for every documented algorithm case, including edge cases that the Django version handled incorrectly
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Algorithm spec document and TypeScript type contracts
- [x] 02-02-PLAN.md — TDD implementation of matchTransfers with full test coverage

### Phase 3: File Upload Pipeline
**Goal**: A pharmacy manager can upload ROU and dead-stock FRED exports for each store in their group, see the upload status of each store, and replace individual stores without re-uploading the entire group
**Depends on**: Phase 1
**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04, UPLOAD-05, UPLOAD-06
**Success Criteria** (what must be TRUE):
  1. User can upload a FRED Office ROU CSV or XLSX file for a named store and see it appear in the store list
  2. User can upload a FRED Office dead stock CSV or XLSX file for a named store and see it appear in the store list
  3. Upload data persists in NEON — closing the browser and returning shows previously uploaded stores without re-uploading
  4. User can see the date and time each store's data was last uploaded and replace a single store independently
  5. Files with UTF-8 BOM, CRLF line endings, or blank title rows before the header parse correctly without manual preprocessing
  6. XLSX files are parsed via SheetJS; files over 5 MB are rejected with a clear error message before upload
**Plans**: 4 plans
Plans:
- [x] 03-01-PLAN.md — SheetJS install, CSV/XLSX parser functions, FRED header aliasing, and unit tests
- [x] 03-02-PLAN.md — POST /upload and GET /stores Worker routes with NEON bulk insert
- [x] 03-03-PLAN.md — Upload page UI with store card grid, modal dialog, and routing
- [x] 03-04-PLAN.md — Fix upload test mock desync (gap closure)
**UI hint**: yes

### Phase 4: Matching Algorithm
**Goal**: A pharmacy manager can trigger a match run against all uploaded store data with a chosen months-cover target and view the full ranked results in a virtualized table
**Depends on**: Phase 2, Phase 3
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-06, MATCH-07, RESULTS-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Run Match" executes the algorithm and displays results — source store, destination store, SKU, qty to transfer, destination ROU, and months-cover derived column
  2. User can set a months-cover target; transfer quantities reflect the formula (cover × destination ROU) − destination existing SOH, clamped to zero
  3. Destination stores whose existing SOH already exceeds the months-cover target are absent from results
  4. Results are sorted ranged-first, then by ROU descending within each group
  5. is_ranged values of "checked", "yes", "true", "1", "y" (case-insensitive) are all recognised as ranged
  6. Missing or NaN ROU/SOH values produce a visible data quality warning rather than silently defaulting to zero
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md — POST /match Worker route with NEON queries and matchTransfers loop
- [x] 04-02-PLAN.md — Match page UI with control bar, virtualized table, and warning banners
**UI hint**: yes

### Phase 5: Freemium and Billing
**Goal**: The free tier limit is enforced atomically in the Worker before every match run, users can see their usage, and paying customers can subscribe via Stripe to unlock unlimited runs
**Depends on**: Phase 4
**Requirements**: BILLING-01, BILLING-02, BILLING-03, BILLING-04
**Success Criteria** (what must be TRUE):
  1. A free-tier org that has already run 1 match this calendar month is blocked with a 429 response before the algorithm executes
  2. The UI displays the current match run count and monthly limit (e.g., "1 of 1 free run used this month") without requiring a page refresh after each run
  3. When the free limit is reached the user sees an upgrade prompt with a working link to Stripe Checkout
  4. After completing Stripe payment a Stripe webhook updates the org's plan to paid and subsequent match runs succeed without limit enforcement
  5. Cancelling a paid subscription via Stripe triggers a webhook that reverts the org to the free tier
**Plans**: 3 plans
Plans:
- [x] 05-01-PLAN.md — Stripe SDK install, atomic usage metering in match route, GET /api/usage endpoint
- [x] 05-02-PLAN.md — Stripe Checkout session creation and webhook handler
- [x] 05-03-PLAN.md — Frontend freemium UX: useUsage hook, upgrade modal, billing page
**UI hint**: yes

### Phase 6: Brand, UI and Export
**Goal**: The app looks and feels like part of the PharmIQ product family and users can export match results as a PDF
**Depends on**: Phase 4
**Requirements**: BRAND-01, BRAND-02, RESULTS-02
**Success Criteria** (what must be TRUE):
  1. All UI elements use the PharmIQ brand palette (teal #0F766E primary, amber #D97706 accent, navy #0F172A dark base) and Space Grotesk headings with Inter body text
  2. User can toggle dark mode and the preference persists across sessions
  3. User can export the current match results as a PDF containing the full results table
**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md — CSS variables dark mode refactor, toggle button, FOUC prevention, favicon, title, Dashboard redesign
- [x] 06-02-PLAN.md — @react-pdf/renderer install, TransferReportPDF component, Export PDF button in MatchPage
**UI hint**: yes

### Phase 7: Fix is_ranged Schema and Pipeline
**Goal:** Activate ranged-first sort by persisting is_ranged from ROU uploads — fixes the architectural gap where rou_data has no is_ranged column and matchTransfers sort never activates
**Depends on**: Phase 4
**Requirements**: MATCH-05, MATCH-06
**Gap Closure:** Closes INT-01 and the functional gaps in MATCH-05 and MATCH-06 identified by milestone audit
**Success Criteria** (what must be TRUE):
  1. `rou_data` table has an `is_ranged BOOLEAN DEFAULT false` column in schema.sql
  2. ROU upload route parses and stores `is_ranged` for each row in `rou_data`
  3. `match.ts` RouItem construction reads `is_ranged` from `rou_data` query result (not hardcoded false)
  4. Ranged items float to the top of match results when is_ranged=true in uploaded ROU data
**Plans**: 1 plan
Plans:
- [x] 07-01-PLAN.md — TDD: RED failing tests, GREEN 4-file implementation, schema migration, full suite verification

### Phase 8: Phase 04 Verification
**Goal:** Formally verify all 8 Phase 04 requirements by creating the missing VERIFICATION.md — closes the orphaned status of MATCH-01..07 and RESULTS-01
**Depends on**: Phase 7
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-06, MATCH-07, RESULTS-01
**Gap Closure:** Closes orphaned verification status for all Phase 04 requirements identified by milestone audit
**Success Criteria** (what must be TRUE):
  1. `04-VERIFICATION.md` exists and documents verified status for MATCH-01..07 and RESULTS-01
  2. Each requirement has evidence (test output, manual test result, or code reference)
  3. REQUIREMENTS.md checkboxes `[x]` for MATCH-01..07 and RESULTS-01
**Plans**: 1 plan
Plans:
- [x] 08-01-PLAN.md — Create 04-VERIFICATION.md with evidence for all 8 requirements and update REQUIREMENTS.md checkboxes


### Phase 9: Requirements and Roadmap Documentation Sync
**Goal:** Close the documentation drift gap — update REQUIREMENTS.md checkboxes and ROADMAP.md progress table to accurately reflect all completed work
**Depends on**: Phase 8
**Requirements**: BILLING-01, BILLING-02, BILLING-03, BILLING-04, BRAND-01, BRAND-02, RESULTS-02
**Gap Closure:** Closes INT-02 — 7 requirements implemented and code-verified but still showing [ ] and Pending in documentation
**Success Criteria** (what must be TRUE):
  1. `cd apps/web && npm run build` exits 0 (confirms RESULTS-02 is satisfied)
  2. REQUIREMENTS.md checkboxes updated to `[x]` for BILLING-01..04, BRAND-01, BRAND-02, RESULTS-02
  3. ROADMAP.md progress table and plan checkboxes reflect actual completed state for phases 4, 5, 6
  4. Traceability table shows Complete for all 26 v1 requirements
**Plans**: 1 plan
Plans:
- [x] 09-01-PLAN.md — Build verification and documentation sync for 7 requirements

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-29 |
| 2. Logic Audit | 2/2 | Complete | 2026-03-29 |
| 3. File Upload Pipeline | 4/4 | Complete | 2026-03-30 |
| 4. Matching Algorithm | 2/2 | Complete | 2026-03-31 |
| 5. Freemium and Billing | 3/3 | Complete | 2026-04-12 |
| 6. Brand, UI and Export | 2/2 | Complete | 2026-04-12 |
| 7. Fix is_ranged Schema and Pipeline | 1/1 | Complete   | 2026-04-12 |
| 8. Phase 04 Verification | 1/1 | Complete | 2026-04-12 |
| 9. Requirements and Roadmap Documentation Sync | 1/1 | Complete | 2026-04-13 |

---

## v1.1 Phases — Reporting & Tiered Billing

**Milestone goal:** Give pharmacy managers visual insight into their dead stock position and unlock revenue growth with 3 pricing tiers.

**v1.1 Pre-Flight — Manual Prerequisite for Phase 15:**

Before Phase 15 code runs, create two Stripe products in the Stripe dashboard (both test and live mode):
- Product "PharmIQ Pro" → recurring price $10 AUD/month → save price ID as `STRIPE_PRICE_ID_PRO`
- Product "PharmIQ Enterprise" → recurring price $100 AUD/month → save price ID as `STRIPE_PRICE_ID_ENTERPRISE`

Add both to Worker secrets (`wrangler secret put`) and to `.dev.vars`.

**v1.1 Phase Checklist:**
- [ ] **Phase 11: Schema Migration** - Add cost_ex column to dead_stock and plan_tier column to subscriptions; migrate existing paid rows to pro
- [x] **Phase 12: Cost Column Parser + Summary Endpoint** - Extend parser to extract Cost Ex; write cost_ex to DB; build GET /api/dead-stock-summary (completed 2026-04-16)
- [x] **Phase 13: Charts** - Install recharts 3.8.1; build DeadStockChart (pie) and PostMatchChart (grouped bar); mount on UploadPage and MatchPage (completed 2026-04-17)
- [ ] **Phase 14: Cost Report UI** - Build CostReport component with SOH $ input, dead stock % display, benchmark indicators, and recoverable value KPI
- [x] **Phase 15: 3-Tier Billing** - plans.ts constants, tier-aware match enforcement, multi-price checkout, webhook tier write, 3-tier BillingPage (completed 2026-04-26)

**v1.1 Execution Order:**
Phase 11 must run first. Phase 12 depends on Phase 11. Phases 13, 14, and 15 each depend on Phase 12 (or Phase 11 for 15) and can proceed in parallel once prerequisites are met.

---

### Phase 11: Schema Migration

**Goal:** Both new database columns exist in NEON and schema.sql before any v1.1 feature code runs — cost_ex on dead_stock and plan_tier on subscriptions, with existing paid rows migrated to pro.

**Depends on:** Phase 10

**Requirements:** (schema prerequisite — no v1.1 REQ-ID maps here; all downstream phases depend on this)

**Plans:**
- [ ] 11-01-PLAN.md — Run migration SQL in NEON (cost_ex column, plan_tier column, UPDATE paid→pro), update schema.sql, update .dev.vars.example with STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_ENTERPRISE, verify with \d queries

**UAT:**
- `\d dead_stock` in NEON shows `cost_ex DOUBLE PRECISION` column (nullable, no default)
- `\d subscriptions` shows `plan_tier TEXT NOT NULL DEFAULT 'free'` column and `stripe_price_id TEXT` column
- `SELECT status, plan_tier FROM subscriptions` shows no rows with `status = 'paid'`; any previously paid rows now have `plan_tier = 'pro'`
- schema.sql in the repo matches the live NEON schema exactly
- `.dev.vars.example` includes `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` placeholder entries

**Pitfalls:**
- Run the DB migration BEFORE deploying any v1.1 Worker code — if the Worker deploy races ahead, the first upload or billing route will error on the missing column
- Use `ADD COLUMN IF NOT EXISTS` in the migration SQL so re-running is safe
- `cost_ex` must be `DOUBLE PRECISION` (not TEXT) — aggregation queries (`SUM`, `AVG`) on a TEXT column return wrong types or fail silently

---

### Phase 12: Cost Column Parser + Summary Endpoint

**Goal:** A dead stock file uploaded with a Cost Ex column has its per-unit cost stored in NEON, and the GET /api/dead-stock-summary endpoint returns per-store unit totals and dollar values that both the charts and cost report can consume.

**Depends on:** Phase 11

**Requirements:** COST-01, COST-02, COST-04

**Plans:**
2/2 plans complete
- [x] 12-02-PLAN.md — Build GET /api/dead-stock-summary Worker route (aggregate total_units and total_value per store); register route in index.ts; add useDeadStockSummary hook in apps/web; integration test for the endpoint

**UAT:**
- Upload a FRED dead stock file that includes a Cost Ex column; query `SELECT cost_ex FROM dead_stock WHERE org_id = $1 LIMIT 5` — values are non-null and match the file
- Upload a FRED dead stock file without a Cost Ex column; query returns `cost_ex IS NULL` for all rows; no upload error is thrown
- `GET /api/dead-stock-summary` returns `{ stores: [{ name, totalUnits, totalValue }] }` with correct aggregated figures
- When cost_ex is absent for all stores, totalValue is 0 for every store entry (not an error)
- Cost report panel on MatchPage shows "Re-upload using FRED Stock Valuation report format to see dollar values" when totalValue is 0 for all stores (COST-04)

**Pitfalls:**
- Detect Cost Ex column absence at the header level, not the row level — SheetJS returns `undefined` for both an absent column header and a blank cell in a present column; inspect the header row array before parsing data rows to set `hasCostColumn` flag
- Validate FRED Cost Ex header aliases against a real FRED Stock Valuation export before writing the alias map — the current HEADER_ALIASES entry (`"Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"`) was inferred from research, not validated against a live export; user will supply a real sample before this phase executes
- Use `SUM(cost_ex) FILTER (WHERE cost_ex IS NOT NULL)` in the summary query — a plain `SUM` across a mix of NULL and valued rows returns NULL, not the sum of non-null values
- Negative and zero cost values should be excluded from aggregation and surfaced as a data quality warning, not silently summed

---

### Phase 13: Charts

**Goal:** A pharmacy manager sees a pie chart of dead stock units per store as soon as data is uploaded, and after running a match sees a grouped bar chart showing before/after dead stock units per store alongside a net units recovered KPI card.

**Depends on:** Phase 12

**Requirements:** VIZ-01, VIZ-02, VIZ-03

**Plans:**
2/2 plans complete
- [x] 13-02-PLAN.md — Build PostMatchChart.tsx (grouped BarChart, client-side before/after aggregation from match results + summary data, amber/teal bars, "Projected if all transfers complete" label); build net units recovered KPI card; mount both on MatchPage below results table

**UAT:**
- After uploading dead stock data for at least two stores, UploadPage shows a pie chart with one slice per store labelled with store name and unit count; slices use PharmIQ teal/amber palette
- After running a match, MatchPage shows a grouped bar chart with Before (amber) and After (teal) bars per store; a KPI card above the chart shows total net units recovered across all stores
- Both charts render correctly in dark mode
- Re-uploading a dead stock file clears and redraws the pie chart without a page reload; the post-match chart does not appear until a new match is run
- When no dead stock data has been uploaded, the chart area shows an appropriate empty state message (not a blank space)

**Pitfalls:**
- Wrap every Recharts chart in a `div` with explicit `min-h-[300px]` — `ResponsiveContainer` with `height="100%"` renders a 0x0 SVG silently if the parent has no explicit height; no error is thrown
- Set `isAnimationActive={false}` on all chart components — animations feel jarring in a B2B operations context and add accessibility concerns
- Use hex literals for chart colours (`#0F766E`, `#D97706`) — CSS custom properties (`var(--color-teal)`) do not work inside SVG `fill` props; Recharts renders SVG, not HTML
- Reset chart-derived state in the same setState call that clears `matches` on new upload — do not let the chart and results table derive from different data snapshots
- PostMatchChart depends on `useDeadStockSummary` being loaded; show a loading state if summary data has not arrived when the match completes
**UI hint**: yes

---

### Phase 14: Cost Report UI

**Goal:** When cost data is present, a pharmacy manager can enter their total SOH dollar value and instantly see their dead stock as a percentage of total inventory value with amber/red benchmark indicators, and after a match run sees the recoverable dollar value of matched transfers.

**Depends on:** Phase 12

**Requirements:** COST-03, COST-05

**Plans:** 1 plan

Plans:
- [ ] 14-01-PLAN.md — match.ts cost_ex fix (2-line SQL patch + 2 unit tests) + CostReport.tsx panel (per-store cards, SOH input, progress bar, recoverable KPI)

**UAT:**
- Upload a dead stock file with Cost Ex column; run a match; MatchPage shows a CostReport panel with dead stock dollar value per store
- User types a total SOH $ value into the input field; dead stock percentage updates immediately without a page reload
- When dead stock % is between 10–25%, the indicator renders in amber; when above 25%, it renders in red; when below 10%, it renders in the neutral teal palette
- After a match run with cost data present, a "Recoverable value" KPI card shows the dollar value of dead stock matched for transfer
- When no cost data is present (all stores have totalValue = 0), the cost panel shows an instructional message to re-upload using FRED Stock Valuation format, not zeros or an error
- Typing 0 or leaving the SOH field empty suppresses the percentage calculation and shows a placeholder — the UI never displays Infinity% or NaN%

**Pitfalls:**
- Validate that the user-entered SOH value is a positive number before computing the percentage — division by zero produces `Infinity`, division of NaN produces `NaN`; disable the percentage display until a valid positive SOH is entered
- The cost report shows pre-match (current) dead stock values by default; if a post-match recoverable figure is shown alongside it, label both sections unambiguously to prevent a pharmacist from mistaking the current figure for the projected post-transfer figure
- Track which stores contributed cost data; if only a subset of stores have cost_ex data, show "X of Y stores have cost data" above the totals — never aggregate a partial set without surfacing the coverage gap
**UI hint**: yes

---

### Phase 15: 3-Tier Billing

**Goal:** Three pricing tiers (Free, Pro, Enterprise) are enforced server-side in the Worker, users can upgrade or downgrade via Stripe Checkout and the Customer Portal, and the billing page shows current plan, usage, and a side-by-side tier comparison.

**Depends on:** Phase 11 (plan_tier column must exist before billing code reads it); Phases 12-14 can be in progress or complete

**Requirements:** BILLING-05, BILLING-06, BILLING-07, BILLING-08, BILLING-09, BILLING-10, BILLING-11, BILLING-12

**Plans:** 2/2 plans complete

Plans:
- [x] 15-01-PLAN.md — Create lib/plans.ts with PLAN_LIMITS constant and PlanTier type; update types.ts Env interface; rewrite match.ts tier-aware enforcement with store-count gate; update billing.ts GET /usage, create-checkout with tier param, create-portal-session; update webhook.ts with subscription.updated handler and stripe_event_id idempotency; add processed_webhook_events table to schema.sql
- [x] 15-02-PLAN.md — Redesign BillingPage with 3 pricing cards, usage row, checkout success flow (spinner + toast), portal link; update useUsage and useMatchRun hooks for 3-tier data; update MatchPage upgrade modal with tier-specific copy

**UAT:**
- Free org: first match run succeeds; second match run this calendar month returns 429 with an upgrade prompt
- Pro org (test mode): 10th match run succeeds; 11th match run returns 429; uploading an 11th store and running a match returns 403 with an upgrade-to-Enterprise message
- Enterprise org (test mode): unlimited match runs succeed; no store count gate fires
- Upgrading Free→Pro via Stripe Checkout (test mode) results in the org's plan_tier updating to 'pro' synchronously on the success redirect — a match run immediately after the redirect succeeds without hitting the free tier limit
- `customer.subscription.updated` webhook correctly updates plan_tier when a user upgrades or downgrades between Pro and Enterprise via the Customer Portal
- Cancelling a subscription fires `customer.subscription.deleted` and resets plan_tier to 'free'
- BillingPage shows current plan, match runs used this month vs limit, and all 3 pricing tiers side by side
- Stripe Customer Portal link works and allows subscription management

**Pitfalls:**
- Store stripe_customer_id at checkout session creation time (before redirecting to Stripe), not in the webhook — if the webhook fires before the customer ID is stored, the org lookup fails and the upgrade is silently dropped
- On the checkout success redirect URL, fetch the Stripe session status synchronously and write plan_tier to NEON before rendering the page — do not wait for the async webhook as the authoritative upgrade trigger (webhook typically arrives 1–5 seconds after redirect, during which time a match run would still be blocked)
- Deduplicate webhook events via stripe_event_id: `INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id` — if no row is returned the event was already processed; return 200 immediately without applying DB changes
- When upgrading an existing Pro subscription to Enterprise, always pass the existing subscription item ID in the update call — passing only the new price ID creates a second subscription item and the next invoice charges for both tiers simultaneously
- Run the Phase 11 DB migration BEFORE deploying Phase 15 Worker code — match.ts and billing.ts read plan_tier from subscriptions; if that column does not exist the Worker will error on every request
- Existing Free-tier users with more than 3 stores already uploaded are not retroactively blocked at launch — the store cap applies only to new match runs, not to historical upload data (BILLING-07 grace period)
- Use the atomic `UPDATE usage_meters SET count = count + 1 WHERE org_id = $1 AND year_month = $2 AND count < $limit RETURNING count` pattern for all tier limits — never do a separate SELECT then UPDATE; this is the same pattern as v1.0 and must not regress
**UI hint**: yes

---

## v1.1 Progress

**Execution Order:**
Phase 11 → Phase 12 → Phases 13, 14, 15 (parallel once Phase 12 is complete; Phase 15 requires only Phase 11)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Schema Migration | 0/1 | Not started | - |
| 12. Cost Column Parser + Summary Endpoint | 2/2 | Complete    | 2026-04-17 |
| 13. Charts | 2/2 | Complete    | 2026-04-18 |
| 14. Cost Report UI | 0/1 | Planned     | - |
| 15. 3-Tier Billing | 2/2 | Complete   | 2026-04-26 |
