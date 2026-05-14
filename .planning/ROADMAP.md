# Roadmap: PharmIQ Stock Transfer

## Milestones

- ✅ **v1.0 MVP** — Phases 1–10 (shipped 2026-04-13) — full-stack rebuild on Cloudflare/NEON/Clerk stack with matching algorithm, multi-store upload, freemium billing, brand UI, and PDF export
- ✅ **v1.1 Reporting & Tiered Billing** — Phases 11–15 (shipped 2026-05-13) — dead stock charts, cost report panel, and 3-tier billing system
- 🚧 **v1.2 Insights & Listings** — Phases 16–19 (in progress) — table enhancements, Ethical Exchange export, and dead stock scorecard

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–10) — SHIPPED 2026-04-13</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-29
- [x] Phase 2: Logic Audit (2/2 plans) — completed 2026-03-29
- [x] Phase 3: File Upload Pipeline (4/4 plans) — completed 2026-03-30
- [x] Phase 4: Matching Algorithm (2/2 plans) — completed 2026-03-31
- [x] Phase 5: Freemium and Billing (3/3 plans) — completed 2026-04-12
- [x] Phase 6: Brand, UI and Export (2/2 plans) — completed 2026-04-12
- [x] Phase 7: Fix is_ranged Schema and Pipeline (1/1 plan) — completed 2026-04-12
- [x] Phase 8: Phase 04 Verification (1/1 plan) — completed 2026-04-12
- [x] Phase 9: Requirements and Roadmap Documentation Sync (1/1 plan) — completed 2026-04-13
- [x] Phase 10: Fix schema.sql + .dev.vars.example + webhook test + subscriptions.status DEFAULT (1/1 plan) — completed 2026-04-13

</details>

<details>
<summary>✅ v1.1 Reporting & Tiered Billing (Phases 11–15) — SHIPPED 2026-05-13</summary>

- [x] Phase 11: Schema Migration (1/1 plan) — completed 2026-04-15
- [x] Phase 12: Cost Column Parser + Summary Endpoint (2/2 plans) — completed 2026-04-17
- [x] Phase 13: Charts (2/2 plans) — completed 2026-04-18
- [x] Phase 14: Cost Report UI (1/1 plan) — completed 2026-04-19
- [x] Phase 15: 3-Tier Billing (2/2 plans, UAT ✓ 2026-05-13) — completed 2026-04-26

</details>

### 🚧 v1.2 Insights & Listings (In Progress)

**Milestone Goal:** Give pharmacy managers richer visibility into their dead stock position and a path to recover value externally.

- [ ] **Phase 16: Department + Ranged Column Parsing** — Parse department and ranged columns from FRED upload; expose in match results
- [ ] **Phase 17: Table Filters + Responsive Layout** — Four-way filter controls (ranged, department, store, min value) and tablet-responsive table
- [ ] **Phase 18: Ethical Exchange Export** — Pro-gated unmatched-stock PDF listing with free-tier upgrade teaser
- [ ] **Phase 19: Dead Stock Scorecard** — Top-5 items, top-5 departments, all-time trend, and month-over-month comparison panel

## Phase Details

### Phase 16: Department + Ranged Column Parsing
**Goal**: Match results include department and ranged status parsed from the FRED dead stock export
**Depends on**: Phase 15
**Requirements**: TABLE-01, TABLE-02
**Success Criteria** (what must be TRUE):
  1. After a dead stock upload that contains a Department column, each match result row shows the correct department value for that SKU
  2. After a dead stock upload, each match result row shows a Ranged column reflecting the parsed is_ranged value from the FRED export
  3. Uploads that lack a Department column do not fail — the department field is blank/null rather than erroring
  4. Existing parser unit tests continue to pass and new tests cover department header aliasing
**Plans**: 2 plans
Plans:
- [ ] 16-01-PLAN.md — Backend stack: parser.ts + schema.sql + upload.ts + matcher.ts + match.ts
- [ ] 16-02-PLAN.md — Frontend table: useMatchRun.ts + MatchPage.tsx + parser.test.ts new tests
**UI hint**: yes

### Phase 17: Table Filters + Responsive Layout
**Goal**: Users can slice match results by ranged status, department, store, and minimum transfer value, and view the table on a tablet without layout breakage
**Depends on**: Phase 16
**Requirements**: TABLE-03, TABLE-04, TABLE-05, TABLE-06, TABLE-07
**Success Criteria** (what must be TRUE):
  1. User can view the match results table on a tablet (768px viewport) without horizontal scrolling or overlapping columns
  2. User can toggle a filter to show only ranged items, only non-ranged items, or all items
  3. User can select one or more departments from a multi-select control and the table updates to show only matching rows
  4. User can choose a source store or destination store from a filter and see only rows involving that store
  5. User can enter a minimum dollar transfer value and rows below that threshold are hidden from the results
**Plans**: 2 plans
Plans:
- [ ] 17-01-PLAN.md — Filter state, derived memos, handlers, filter strip UI (TABLE-04, TABLE-05, TABLE-06, TABLE-07)
- [ ] 17-02-PLAN.md — Responsive horizontal scroll and sticky SKU+Description columns (TABLE-03)
**UI hint**: yes

### Phase 18: Ethical Exchange Export
**Goal**: Pro users can identify unmatched dead stock items and download a printable PDF listing for ethicalexchange.com.au; Free users see a teaser with an upgrade prompt
**Depends on**: Phase 16
**Requirements**: EE-01, EE-02, EE-03, EE-04
**Success Criteria** (what must be TRUE):
  1. After a match run, dead stock items with no internal match are automatically flagged and displayed as Ethical Exchange candidates
  2. User can review the candidate list and deselect individual items before generating the export
  3. User can download a PDF listing pre-filled with FRED-known fields (item name, units per pack, quantity to sell) with blank fields for expiry, price, state, and cold chain
  4. Free-tier users see an Ethical Exchange panel that explains the feature and prompts them to upgrade to Pro
**Plans**: TBD
**UI hint**: yes

### Phase 19: Dead Stock Scorecard
**Goal**: Users can see a scorecard panel quantifying their top dead stock exposures and whether the position is improving or worsening over time
**Depends on**: Phase 16
**Requirements**: SCORE-01, SCORE-02, SCORE-03, SCORE-04
**Success Criteria** (what must be TRUE):
  1. User can see the top 5 dead stock SKUs ranked by total value across the org
  2. User can see the top 5 departments ranked by total dead stock value across the org
  3. User can see an all-time trend chart showing total dead stock value across all uploads (derived from dead_stock rows with uploaded_at timestamps, no new table)
  4. User can see a month-over-month indicator showing whether total dead stock value increased or decreased compared to the previous calendar month
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-29 |
| 2. Logic Audit | v1.0 | 2/2 | Complete | 2026-03-29 |
| 3. File Upload Pipeline | v1.0 | 4/4 | Complete | 2026-03-30 |
| 4. Matching Algorithm | v1.0 | 2/2 | Complete | 2026-03-31 |
| 5. Freemium and Billing | v1.0 | 3/3 | Complete | 2026-04-12 |
| 6. Brand, UI and Export | v1.0 | 2/2 | Complete | 2026-04-12 |
| 7. Fix is_ranged Schema and Pipeline | v1.0 | 1/1 | Complete | 2026-04-12 |
| 8. Phase 04 Verification | v1.0 | 1/1 | Complete | 2026-04-12 |
| 9. Requirements and Roadmap Documentation Sync | v1.0 | 1/1 | Complete | 2026-04-13 |
| 10. Fix schema.sql + DX + webhook fixes | v1.0 | 1/1 | Complete | 2026-04-13 |
| 11. Schema Migration | v1.1 | 1/1 | Complete | 2026-04-15 |
| 12. Cost Column Parser + Summary Endpoint | v1.1 | 2/2 | Complete | 2026-04-17 |
| 13. Charts | v1.1 | 2/2 | Complete | 2026-04-18 |
| 14. Cost Report UI | v1.1 | 1/1 | Complete | 2026-04-19 |
| 15. 3-Tier Billing | v1.1 | 2/2 | Complete | 2026-04-26 |
| 16. Department + Ranged Column Parsing | v1.2 | 0/2 | In progress | - |
| 17. Table Filters + Responsive Layout | v1.2 | 0/? | Not started | - |
| 18. Ethical Exchange Export | v1.2 | 0/? | Not started | - |
| 19. Dead Stock Scorecard | v1.2 | 0/? | Not started | - |
