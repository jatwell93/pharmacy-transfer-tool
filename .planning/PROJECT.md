# PharmIQ Stock Transfer

## What This Is

A dead-stock matching tool for Australian pharmacy groups. Pharmacy managers upload ROU (Rate of Usage) and dead-stock reports exported from FRED Office for each store. The system identifies which stores hold dead stock that other stores in the network can sell, recommends transfers capped at a user-defined months-cover limit to prevent receiving stores from becoming overstocked, and shows managers their dead stock dollar exposure with benchmark indicators and recoverable value estimates. Part of the PharmIQ platform ("Smart Ops. Better Margins.").

## Core Value

A pharmacy manager uploads all store reports and instantly sees exactly which stores should exchange dead stock — with a months-cover cap so receiving stores never become overstocked.

## Current State: v1.1 SHIPPED ✅

**Shipped:** 2026-05-13
**Stack:** Cloudflare Workers (Node/TypeScript) + Pages (React/Vite) + NEON Postgres + Clerk auth + Stripe billing
**Test coverage:** 109+ Worker tests passing; web Vitest suite (9 tests) for billing/modal components

**What's live:**
- Multi-store FRED CSV/XLSX upload (ROU + dead stock) with SheetJS parsing and NEON persistence
- Dead stock matching algorithm with months-cover cap, sell-through filter, ranged-first sort
- Virtualized results table with PDF export (@react-pdf/renderer)
- Dead stock charts: pie chart per store (pre-match) + projected change bar chart + Net Units Recovered KPI (post-match)
- Cost Report panel: per-store dead stock $ cards, SOH $ input, dead stock % with amber/red benchmarks, recoverable value KPI
- 3-tier billing: Free (1 match/mo, 3 stores), Pro ($10/mo AUD, 10 matches/mo, 10 stores), Enterprise ($100/mo AUD, unlimited)
- Stripe Checkout + in-place upgrade + Customer Portal + synchronous checkout confirmation + webhook idempotency
- PharmIQ brand (teal #0F766E / amber #D97706 / navy #0F172A, Space Grotesk + Inter) with dark mode

## Requirements

### Validated — v1.0

- ✓ AUTH-01..03: Clerk auth + org-scoped data isolation — v1.0
- ✓ UPLOAD-01..06: FRED ROU + dead stock upload (CSV/XLSX), NEON persistence, store card grid — v1.0
- ✓ MATCH-01..07: Matching algorithm with months-cover cap, sell-through filter, ranged sort, is_ranged parsing, NaN handling — v1.0
- ✓ RESULTS-01..02: Virtualized results table + PDF export — v1.0
- ✓ BILLING-01..04: Free tier (1 match/mo), Stripe paid plan, atomic usage counter — v1.0
- ✓ BRAND-01..02: PharmIQ brand guide, dark mode — v1.0
- ✓ AUDIT-01..02: Django algorithm audit + TypeScript port with full unit test coverage — v1.0

### Validated — v1.1

- ✓ VIZ-01..03: Dead stock pie chart, post-match grouped bar chart, Net Units Recovered KPI — v1.1
- ✓ COST-01..05: Cost Ex column parsing, per-store dollar values, SOH % report with benchmarks, recoverable value KPI — v1.1
- ✓ BILLING-05..12: 3-tier billing (Free/Pro/Enterprise), server-side enforcement, Stripe multi-price checkout, synchronous confirmation, webhook idempotency, BillingPage — v1.1

### Active (v1.2 candidates)

- [ ] Role-based access within org (owner vs staff) — AUTH scope
- [ ] CSV/XLSX export of match results — RESULTS scope
- [ ] Responsive/tablet layout — UI scope
- [ ] Usage / audit history (upload log, match run log) — AUDIT scope
- [ ] Multi-store comparison view (SKU across all stores) — RESULTS scope
- [ ] Custom sell-through threshold (instead of hard-coded 12 months) — MATCH scope

### Out of Scope

- Django/Python backend — replaced entirely by Cloudflare Workers (Node/TypeScript)
- SQLite — replaced by NEON Postgres
- Direct FRED Office API integration — manual CSV/XLSX export remains the upload mechanism
- Real-time collaboration / simultaneous multi-user editing — not needed
- Mobile native app — web responsive is sufficient
- Demand forecasting or predictive analytics
- Custom RBAC / permission systems in v1

## Context

**FRED Office reports** are the data source — standard pharmacy POS system used widely in Australian pharmacies. Export format is CSV or XLSX with flexible column naming (header aliasing implemented in parser.ts).

**Brand identity**: PharmIQ brand guide at `brand-identity-pharma-apps/brand-identity/brand-guidelines.md`. Primary teal `#0F766E`, accent amber `#D97706`, dark base navy `#0F172A`. Font: Space Grotesk / Inter. Aligned with companion use-by dates app.

**Related product**: A companion app (use-by dates tracker) already deployed on Cloudflare Pages + Workers + NEON + Clerk. Stock transfer tool shares the same design system and auth provider.

**Known issues / tech debt from v1.1:**
- Phase 11 and Phase 15 VERIFICATION.md files missing (documentation artifacts; UAT and SUMMARY provide evidence)
- All 5 v1.1 VALIDATION.md files in `status: draft` (Nyquist task-level marking not done; no functional impact)

## Constraints

- **Stack**: Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk — must match companion app stack
- **Auth**: Clerk — already integrated in companion app, users will be the same
- **Data**: NEON Postgres — replaces SQLite; must support multi-tenant (per-org) data scoping
- **Deployment**: Cloudflare Pages/Workers — no traditional server, no Python
- **Business model**: 3 tiers — Free (1 match/mo, 3 stores), Pro ($10/mo AUD, 10 matches/mo, 10 stores), Enterprise ($100/mo AUD, unlimited); enforced in backend via atomic counters and store-count gating
- **Market**: Australian pharmacies — FRED Office export formats are the integration surface

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild on Cloudflare/NEON/Clerk instead of migrating Django | Same stack as companion app; Django has no auth, SQLite can't scale, no deployment config | ✓ v1.0 complete |
| Net months-cover allocation (subtract existing SOH) | Prevents receiving store overstocking; aligns with how buyers think | ✓ Phase 04 |
| Separate product (not embedded in companion app) | Freemium lead-gen; distinct brand page; cross-markets both products | ✓ Deployed |
| 3-tier pricing: Free / Pro $10 / Enterprise $100 AUD | Replaces binary free/paid — Pro adds 10 matches+10 stores, Enterprise is unlimited | ✓ Phase 15 (UAT ✓) |
| In-place subscription update for tier upgrades | Stripe subscription update avoids double-billing; synchronous confirmation avoids webhook race (BILLING-08/09) | ✓ Phase 15 |
| Preserve FRED export format support | Users already know how to export; no workflow change needed | ✓ v1.0 |
| `hasCostData` as explicit COST-04 signal (not `totalValue === 0`) | Store can have `totalValue === 0` with zero-cost items; `hasCostData` is unambiguous | ✓ Phase 12 |
| Synchronous checkout confirmation (`GET /billing/checkout-session/:sessionId`) | Webhook arrives 1–5s after redirect; synchronous fetch prevents race condition on upgrade | ✓ Phase 15 |

---
*Last updated: 2026-05-13 — v1.1 milestone archived. All 42 requirements across v1.0 and v1.1 complete.*

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
