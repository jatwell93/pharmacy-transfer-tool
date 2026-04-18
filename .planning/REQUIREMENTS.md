# PharmIQ Stock Transfer — v1 Requirements

> Core value: A pharmacy manager uploads all store reports and instantly sees exactly which stores should exchange dead stock — with a months-cover cap so receiving stores never become overstocked.

---

## v1 Requirements

### Authentication & Tenancy

- [x] **AUTH-01**: User can create an account and sign in via Clerk (email + social)
- [x] **AUTH-02**: Each pharmacy group has isolated data — all queries are scoped to org_id extracted from the verified Clerk JWT (never from request body)
- [x] **AUTH-03**: User without an active Clerk organisation is blocked at middleware before any data operation

### File Upload

- [x] **UPLOAD-01**: User can upload a FRED Office ROU report (CSV or XLSX: Item Code, Item Description, ROU, SOH) for a named store
- [x] **UPLOAD-02**: User can upload a FRED Office dead stock report (CSV or XLSX: Item Code, Item Description, SOH) for a named store
- [x] **UPLOAD-03**: Uploaded store data persists in NEON Postgres; user does not need to re-upload all stores to run a new match
- [x] **UPLOAD-04**: User can see when each store's data was last uploaded and replace it individually
- [x] **UPLOAD-05**: Parser handles FRED-specific CSV quirks — UTF-8 BOM stripping, CRLF line endings, blank title rows before the header row
- [x] **UPLOAD-06**: Parser handles XLSX files via SheetJS (CDN tarball); enforces 5 MB per-file size cap

### Matching Algorithm

- [x] **MATCH-01**: System identifies SKUs in a store's dead stock report that appear in other stores' ROU data with ROU > 0
- [x] **MATCH-02**: System applies sell-through filter — only matches destination stores where ROU ≥ SOH / 12 (will sell through existing stock within 12 months)
- [x] **MATCH-03**: User can set a months-cover target (e.g. 3); maximum transfer quantity = (cover × destination ROU) − destination existing SOH; result is clamped to ≥ 0
- [x] **MATCH-04**: When destination store's existing SOH already exceeds months-cover target, that store is excluded from results (0 qty transfer makes no sense)
- [x] **MATCH-05**: Results are sorted ranged-first, then by ROU descending within each group
- [x] **MATCH-06**: `is_ranged` parsing accepts all truthy variants: `checked`, `yes`, `true`, `1`, `y` (case-insensitive) — not just `"checked"`
- [x] **MATCH-07**: NaN and missing ROU/cost values are explicitly handled (pd.isna / null check) rather than silently defaulted to 0

### Results & Export

- [x] **RESULTS-01**: Match results displayed in a virtualized table: SKU, description, source store, qty to transfer, destination store, destination ROU, months cover, sell-through time
- [x] **RESULTS-02**: User can export match results as a PDF (client-side via @react-pdf/renderer)

### Freemium & Billing

- [x] **BILLING-01**: Free tier allows 1 match run per calendar month per org; enforced via atomic Postgres counter (not KV) — `UPDATE usage_meters SET count = count + 1 WHERE org_id = $1 AND year_month = $2 AND count < limit RETURNING count`
- [x] **BILLING-02**: User can see how many match runs they have used this month and the monthly limit
- [x] **BILLING-03**: When free limit is reached, user sees an upgrade prompt with a CTA linking to Stripe checkout
- [x] **BILLING-04**: Stripe integration for paid plan — subscription creation, webhook handling for plan activation/cancellation, unlimited match runs on paid tier

### Brand & UI

- [x] **BRAND-01**: UI implements PharmIQ brand guide — teal `#0F766E` primary, amber `#D97706` accent, navy `#0F172A` dark base, Space Grotesk (headings) + Inter (body)
- [x] **BRAND-02**: Dark mode toggle (carries forward from existing app)

### Logic Audit

- [x] **AUDIT-01**: Existing Django matching logic is audited for correctness before port — document the algorithm with test cases covering: sell-through filter, months-cover cap, ranged sort, BOM parsing, NaN edge cases
- [x] **AUDIT-02**: Ported TypeScript matching function has unit test coverage for all documented algorithm cases

---

## v1.1 Requirements — Reporting & Tiered Billing

### Visualisation

- [x] **VIZ-01**: User sees a pie chart of dead stock units per store when dead stock data is uploaded (pre-match view — no cost data required)
- [x] **VIZ-02**: After running a match, user sees a grouped bar chart: current vs projected dead stock units per store (assuming all recommended transfers complete)
- [x] **VIZ-03**: Post-match view shows a "Net units recovered" KPI card — total units cleared across all stores

### Cost & Dollar Reporting

- [x] **COST-01**: Dead stock upload accepts an optional "Cost Ex" column (unit cost excl. GST from FRED Stock Valuation report); absence detected at header level; does not cause upload errors
- [x] **COST-02**: When cost data is present, dead stock dollar value is displayed per store (`SUM(Cost Ex × SOH)` per store's dead stock SKUs)
- [ ] **COST-03**: User can enter a single org-level total SOH $ value; app displays dead stock as a % of total SOH with amber (10–25%) / red (>25%) benchmark indicator
- [x] **COST-04**: When cost column is absent from the upload, cost report panel shows an instructional message to re-upload using FRED Stock Valuation report format
- [ ] **COST-05**: When cost data is present after a match run, app shows a "Recoverable value" KPI: dollar value of dead stock matched for transfer

### Billing

- [ ] **BILLING-05**: Plan limits — Free: 1 match/mo, 3 stores; Pro ($10/mo AUD): 10 matches/mo, 10 stores; Enterprise ($100/mo AUD): unlimited matches and stores
- [ ] **BILLING-06**: All limits enforced server-side in the Worker: atomic match counter + distinct-store count query against rou_data at match time; client-side gates are UX only
- [ ] **BILLING-07**: Existing Free-tier users with >3 stores already uploaded are not retroactively blocked at launch — the store cap applies to new match runs only (grace period)
- [ ] **BILLING-08**: Stripe Checkout supports both Pro and Enterprise price IDs; user can upgrade Free→Pro, Free→Enterprise, or Pro→Enterprise (existing subscription item ID passed for correct proration)
- [ ] **BILLING-09**: After Stripe Checkout redirect, app synchronously fetches checkout session status and writes plan_tier before rendering — does not rely on async webhook for the immediate upgrade experience
- [ ] **BILLING-10**: `customer.subscription.updated` webhook handler writes plan_tier to subscriptions table; idempotent via stripe_event_id deduplication
- [ ] **BILLING-11**: User can manage subscription (upgrade, downgrade, cancel) via Stripe Customer Portal
- [ ] **BILLING-12**: Billing page shows current plan, match runs used this month, stores used vs limit, and side-by-side pricing comparison for all 3 tiers

---

## v2 Requirements (Deferred)

- Role-based access within org (owner vs staff) — AUTH scope
- CSV export of match results — RESULTS scope
- XLSX export of match results — RESULTS scope
- Responsive/tablet layout — UI scope
- Usage / audit history (upload log, match run log) — AUDIT scope
- Multi-store comparison view (SKU across all stores) — RESULTS scope
- Custom sell-through threshold (instead of hard-coded 12 months) — MATCH scope

---

## Out of Scope

- Direct FRED Office API integration — users export manually; workflow change not needed
- Django / Python backend — replaced entirely by Cloudflare Workers (Node/TypeScript)
- SQLite database — replaced by NEON Postgres
- Real-time collaboration / simultaneous multi-user editing
- Mobile native app — web is sufficient
- Demand forecasting or predictive analytics
- Custom RBAC / permission systems in v1

---

## Traceability

> Filled by roadmapper — maps each REQ-ID to a phase.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| AUTH-01 | Phase 1 — Foundation | Complete |
| AUTH-02 | Phase 1 — Foundation | Complete |
| AUTH-03 | Phase 1 — Foundation | Complete |
| AUDIT-01 | Phase 2 — Logic Audit | Complete |
| AUDIT-02 | Phase 2 — Logic Audit | Complete |
| UPLOAD-01 | Phase 3 — File Upload Pipeline | Complete |
| UPLOAD-02 | Phase 3 — File Upload Pipeline | Complete |
| UPLOAD-03 | Phase 3 — File Upload Pipeline | Complete |
| UPLOAD-04 | Phase 3 — File Upload Pipeline | Complete |
| UPLOAD-05 | Phase 3 — File Upload Pipeline | Complete |
| UPLOAD-06 | Phase 3 — File Upload Pipeline | Complete |
| MATCH-01 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| MATCH-02 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| MATCH-03 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| MATCH-04 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| MATCH-05 | Phase 7 — Fix is_ranged Schema and Pipeline (gap closure) | Complete |
| MATCH-06 | Phase 7 — Fix is_ranged Schema and Pipeline (gap closure) | Complete |
| MATCH-07 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| RESULTS-01 | Phase 8 — Phase 04 Verification (gap closure) | Complete |
| BILLING-01 | Phase 5 — Freemium and Billing | Complete |
| BILLING-02 | Phase 5 — Freemium and Billing | Complete |
| BILLING-03 | Phase 5 — Freemium and Billing | Complete |
| BILLING-04 | Phase 5 — Freemium and Billing | Complete |
| BRAND-01 | Phase 6 — Brand, UI and Export | Complete |
| BRAND-02 | Phase 6 — Brand, UI and Export | Complete |
| RESULTS-02 | Phase 6 — Brand, UI and Export | Complete |
| VIZ-01 | Phase 13 — Charts | Complete |
| VIZ-02 | Phase 13 — Charts | Complete |
| VIZ-03 | Phase 13 — Charts | Complete |
| COST-01 | Phase 12 — Cost Column Parser + Summary Endpoint | Complete |
| COST-02 | Phase 12 — Cost Column Parser + Summary Endpoint | Complete |
| COST-03 | Phase 14 — Cost Report UI | Pending |
| COST-04 | Phase 12 — Cost Column Parser + Summary Endpoint | Complete |
| COST-05 | Phase 14 — Cost Report UI | Pending |
| BILLING-05 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-06 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-07 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-08 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-09 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-10 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-11 | Phase 15 — 3-Tier Billing | Pending |
| BILLING-12 | Phase 15 — 3-Tier Billing | Pending |

---

*Updated: 2026-04-16 | 26 v1 requirements (all Complete) + 13 v1.1 requirements across 3 categories*
