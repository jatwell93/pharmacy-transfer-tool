# PharmIQ Stock Transfer

## What This Is

A dead-stock matching tool for Australian pharmacy groups. Pharmacy managers upload ROU (Rate of Usage) and dead-stock reports exported from FRED Office for each store. The system identifies which stores hold dead stock that other stores in the network can sell, and recommends transfers capped at a user-defined months-cover limit to prevent receiving stores from becoming overstocked. Part of the PharmIQ platform ("Smart Ops. Better Margins.").

## Core Value

A pharmacy manager uploads all store reports and instantly sees exactly which stores should exchange dead stock — with a months-cover cap so receiving stores never become overstocked.

## Current Milestone: v1.1 Reporting & Tiered Billing

**Goal:** Give pharmacy managers visual insight into their dead stock position and unlock revenue growth with 3 pricing tiers.

**Target features:**
- Dead stock visualisation — pie chart of units per store (pre-match) and projected change chart (post-match, assuming all transfers completed)
- SOH vs Dead Stock dollar report — optional Cost Ex column in dead stock upload; user types total SOH $ to see dead stock $ as % of total inventory value
- 3-tier billing: Free (1 match/mo), Pro ($10/mo, 10 matches/mo + max 10 stores), Enterprise ($100/mo, unlimited)

## Requirements

### Validated

✓ File upload: accepts FRED ROU export (Item Code, Item Description, ROU, SOH) — existing
✓ File upload: accepts FRED dead stock export (Item Code, Item Description, SOH) — existing
✓ Matching logic: identifies dead-stock SKUs that other stores have positive ROU for — existing
✓ Sell-through filter: matches only stores where ROU >= SOH / 12 — existing
✓ Results view: virtualized table of matched transfers with store, SKU, ROU, sell-through — existing
✓ PDF export of match results — existing
✓ Dark mode toggle — existing

### Active

- [x] **Months cover cap**: user sets cover target (e.g. 3 months); max transfer = (cover × ROU) − receiving store's existing SOH; uses net allocation to prevent overstocking — Validated in Phase 04: Matching Algorithm
- [x] **Rebuilt on Cloudflare/NEON/Clerk stack**: Workers (Node), Pages (React), NEON Postgres, Clerk auth — replaces Django+SQLite — Validated in v1.0
- [x] **Persistent data**: uploaded ROU and dead-stock data stored per organisation in NEON; re-upload per store as needed without re-uploading everything — Validated in Phase 03: File Upload Pipeline
- [x] **Freemium model**: 1 match run per month on free tier; unlimited on paid — Validated in Phase 05: freemium-and-billing
- [x] **Dynamic store list**: derived from uploaded data, not hard-coded in source — Validated in Phase 03: File Upload Pipeline
- [x] **PharmIQ brand**: teal/amber/navy palette, Space Grotesk typography, brand guide compliance — Validated in Phase 01: Foundation
- [x] **Logic audit**: verify matching algorithm correctness — months cover, sell-through filter, ranged status ranking, is_ranged parsing, NaN/ROU edge cases — Validated in Phase 02: logic-audit
- [x] **Multi-store upload UX**: clear workflow for uploading N stores before running match — Validated in Phase 03: File Upload Pipeline
- [x] **Results export**: PDF export implemented — Validated in Phase 06: pdf-export
- [x] **Auth & tenancy**: Clerk auth, per-org data scoping (no cross-org data leakage) — Validated in Phase 01: Foundation
- [ ] **Dead stock visualisation**: pie chart showing dead stock units per store before match; projected change chart after match (assuming all transfers completed)
- [x] **Cost Ex column parsing**: optional Cost Ex column captured from FRED Stock Valuation uploads; per-unit cost stored in dead_stock.cost_ex; GET /api/dead-stock-summary endpoint returns per-store unit totals and dollar values with hasCostData signal — Validated in Phase 12: cost-column-parser-summary-endpoint
- [ ] **SOH vs Dead Stock dollar report**: optional Cost Ex column in dead stock upload; dead stock value $ calculated per store; user inputs total SOH $ to see dead stock as % of total inventory value
- [ ] **3-tier billing**: Free (1 match/mo), Pro ($10/mo, 10 matches/mo, max 10 stores), Enterprise ($100/mo, unlimited matches and stores); Stripe products for both paid tiers

### Out of Scope

- Django/Python backend — replacing with Node/Cloudflare Workers
- SQLite — replacing with NEON Postgres
- Real-time collaboration / multi-user simultaneous editing — not needed for v1
- Mobile app — web responsive is sufficient
- Direct FRED API integration — manual CSV/XLSX export remains the upload mechanism
- Audit/history trail — deferred to v2
- Multi-store comparison visualisation — deferred to v2

## Context

**Existing codebase** (`dead-stock-tranfer-app/` + `stock_transfer_project/`): A working React + Django app with proven matching logic that needs to be audited, then rebuilt on the new stack. Key concerns from codebase audit:
- Matching algorithm works but `is_ranged` parsing is brittle (only accepts `"checked"`, not `"yes"/"true"/"1"`)
- NaN/ROU masking with `or 0.0` pattern silently hides data quality issues
- No months-cover cap exists yet (core new feature)
- Store list is hard-coded in frontend (must be made dynamic)
- Zero test coverage on business logic
- No auth, no tenancy — must be addressed before any hosted deployment

**FRED Office reports** are the data source — standard pharmacy POS system used widely in Australian pharmacies. Export format is CSV or XLSX with flexible column naming (header aliasing already implemented in existing code).

**Brand identity**: PharmIQ brand guide at `brand-identity-pharma-apps/brand-identity/brand-guidelines.md`. Primary teal `#0F766E`, accent amber `#D97706`, dark base navy `#0F172A`. Font: Space Grotesk (platform) / Inter (body). Must align with the companion use-by dates app on the same platform.

**Related product**: A companion app (use-by dates tracker) already deployed on Cloudflare Pages + Workers + NEON + Clerk. Stock transfer tool should feel like a product family member — same design system, same auth, potentially unified dashboard in the future.

## Constraints

- **Stack**: Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk — must match companion app stack
- **Auth**: Clerk — already integrated in companion app, users will be the same
- **Data**: NEON Postgres — replaces SQLite; must support multi-tenant (per-org) data scoping
- **Deployment**: Cloudflare Pages/Workers — no traditional server, no Python
- **Business model**: 3 tiers — Free (1 match/mo), Pro ($10/mo, 10 matches/mo + max 10 stores), Enterprise ($100/mo, unlimited); enforced in backend via atomic counters and store-count gating
- **Market**: Australian pharmacies — FRED Office export formats are the integration surface

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild on Cloudflare/NEON/Clerk instead of migrating Django | Same stack as companion app; Django has no auth, SQLite can't scale, no deployment config | — Pending |
| Net months-cover allocation (subtract existing SOH) | Prevents receiving store overstocking; aligns with how buyers think | — Pending |
| Separate product (not embedded in companion app) | Freemium lead-gen; distinct brand page; cross-markets both products | — Pending |
| 1 match run/month free tier | Low enough to drive upgrade; high enough to demonstrate value | — Pending |
| Preserve FRED export format support | Users already know how to export; no workflow change needed | — Pending |

---
*Last updated: 2026-04-17 — Phase 12 complete: Cost Ex parsing + dead-stock summary endpoint + useDeadStockSummary hook*

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
