# Milestone v1.2 Requirements — Insights & Listings

**Milestone:** v1.2
**Goal:** Give pharmacy managers richer visibility into their dead stock position and a path to recover value externally.
**Status:** Active

---

## Category: Table Enhancements (Free)

- [ ] **TABLE-01**: User can see a Department column in match results, populated from the FRED dead stock export
- [ ] **TABLE-02**: User can see a Ranged column in match results (true/false), parsed from FRED export
- [ ] **TABLE-03**: User can view the match results table on a tablet without horizontal scrolling or broken layout (responsive design)
- [ ] **TABLE-04**: User can toggle the results table to show ranged items only or non-ranged items only
- [ ] **TABLE-05**: User can filter match results by one or more departments using a multi-select filter
- [ ] **TABLE-06**: User can filter match results by source store or destination store
- [ ] **TABLE-07**: User can set a minimum transfer value ($) threshold to hide low-value rows

## Category: Ethical Exchange Export (Pro only)

- [ ] **EE-01**: User can see which dead stock items have no internal match (no store in the network can absorb them) and are flagged as Ethical Exchange candidates automatically
- [ ] **EE-02**: User can review the auto-selected Ethical Exchange candidates and confirm or deselect individual items before export
- [ ] **EE-03**: User can download a printable PDF listing for confirmed items, pre-filled with FRED-known fields (item name, units per pack, quantity to sell); user completes expiry date, price, state, and cold chain status manually before submitting to ethicalexchange.com.au
- [ ] **EE-04**: Free-tier users see an Ethical Exchange teaser panel with an upgrade prompt (Pro required)

## Category: Dead Stock Scorecard (Free)

- [ ] **SCORE-01**: User can see a scorecard panel showing the top 5 dead stock SKUs by total value across the org
- [ ] **SCORE-02**: User can see the top 5 departments by total dead stock value across the org
- [ ] **SCORE-03**: User can see an all-time trend chart of total dead stock value, derived from dead_stock upload timestamps stored in NEON (no new snapshot table required)
- [ ] **SCORE-04**: User can see a month-over-month comparison showing whether total dead stock value has increased or decreased vs the previous calendar month

---

## Future Requirements (Deferred)

- Role-based access within org (owner vs staff) — AUTH scope
- CSV/XLSX export of match results — RESULTS scope
- Usage / audit history (upload log, match run log) — AUDIT scope
- Multi-store comparison view (SKU across all stores) — RESULTS scope
- Custom sell-through threshold (instead of hard-coded 12 months) — MATCH scope

---

## Out of Scope (v1.2)

- New NEON snapshot/history table — scorecard derives from existing `dead_stock` rows with `uploaded_at` timestamp
- EE web form prefill or API integration — ethicalexchange.com.au has no public API; PDF covers the workflow
- Mobile native layout — tablet responsive is sufficient
- In-app expiry/price/image entry form — user fills these fields manually after PDF export
- Scheduled cron snapshots — derive from upload data instead

---

## Traceability

| REQ-ID | Phase | Plans | Status |
|--------|-------|-------|--------|
| TABLE-01 | Phase 16 | TBD | Pending |
| TABLE-02 | Phase 16 | TBD | Pending |
| TABLE-03 | Phase 17 | TBD | Pending |
| TABLE-04 | Phase 17 | TBD | Pending |
| TABLE-05 | Phase 17 | TBD | Pending |
| TABLE-06 | Phase 17 | TBD | Pending |
| TABLE-07 | Phase 17 | TBD | Pending |
| EE-01 | Phase 18 | TBD | Pending |
| EE-02 | Phase 18 | TBD | Pending |
| EE-03 | Phase 18 | TBD | Pending |
| EE-04 | Phase 18 | TBD | Pending |
| SCORE-01 | Phase 19 | TBD | Pending |
| SCORE-02 | Phase 19 | TBD | Pending |
| SCORE-03 | Phase 19 | TBD | Pending |
| SCORE-04 | Phase 19 | TBD | Pending |
