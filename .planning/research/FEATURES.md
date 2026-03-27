# Feature Landscape

**Domain:** Pharmacy dead-stock matching / inter-store transfer SaaS (B2B, freemium, multi-tenant)
**Project:** PharmIQ Stock Transfer
**Researched:** 2026-03-28
**Overall confidence:** HIGH (core matching/upload/export patterns), MEDIUM (freemium metering implementation), MEDIUM (ranged-product prioritisation)

---

## Table Stakes

Features that users expect on day one. Missing any of these and the product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CSV/XLSX file upload per store** | FRED Office only exports CSV/XLSX; there is no API. This is the only data entry path. | Low | Already proven in existing app. Column aliasing (header heuristics) already implemented — keep it. |
| **Per-store upload status indicator** | With N stores, managers need to see at a glance which stores have fresh data and which are stale. | Low | Show store name, file name, upload timestamp. "Last uploaded 3 days ago" warning threshold (e.g. >7 days). |
| **Months-cover cap input** | Core new feature. Prevents receiving stores from becoming overstocked. Without it the transfer qty is uncapped and the tool is dangerous. | Medium | User sets cover target (e.g. 3 months). Max transfer = (cover × ROU) − existing SOH. Must never be negative. |
| **Match run trigger** | Explicit "Run Match" action (not auto-run on upload). User controls when matching executes after all uploads are current. | Low | Single button. Runs server-side. Returns results to display. |
| **Match results table** | The core output. Managers need to see: source store, destination store, SKU/item code, description, ROU, SOH, recommended transfer qty. | Medium | Virtualized table is already implemented (handles large datasets). Retain. |
| **Sell-through filter** | Only recommend transfers where the receiving store can sell the stock. Filter: ROU >= SOH / 12 (i.e. stock sells through in ≤12 months). | Low | Already implemented. Must survive rebuild. |
| **Dynamic store list** | Store names derived from uploaded file data, not hard-coded. New stores appear automatically. | Low | Current store list is hard-coded — this is a regression risk. Fix in rebuild. |
| **CSV export of results** | Managers share results with staff, email to store managers, import into POS system. PDF alone is insufficient for workflow. | Low | CSV is higher priority than Excel or PDF for workflow compatibility. |
| **Organisation-scoped data** | All uploaded data is per-org. No pharmacy group can see another group's data. Non-negotiable for any hosted deployment. | Medium | Postgres `org_id` column on all tables + application-layer enforcement. Clerk org ID as the tenant key. |
| **Auth with Clerk** | Must match companion app. Same users, same sessions. | Low | Clerk already in companion app. Wrap all routes. |
| **Free tier enforcement (1 run/month)** | Freemium model requires backend enforcement. Client-side-only is trivially bypassable. | Medium | Counter stored in Postgres (not KV — see PITFALLS). Reset on calendar month boundary. Check before executing match. |
| **Upgrade prompt when limit hit** | Without a clear path to upgrade, free users just churn. Show context-aware prompt at the moment of friction. | Low | Modal on 429 response from backend. Framing: "You've used your free match this month — upgrade for unlimited." |
| **Responsive web UI** | Pharmacy managers use a mix of desktop and laptop. Full mobile is not required but the UI must not break on 1280px+. | Low | Not mobile-first, but must not be broken at standard laptop widths. |

---

## Differentiators

Features that make PharmIQ Stock Transfer meaningfully better than a spreadsheet or a generic inventory tool.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Ranged vs non-ranged product prioritisation** | Ranged items (in the store's active product range) should be prioritised over non-ranged items as receiving transfers. Prevents recommending a store stock a product it doesn't sell. | Medium | `is_ranged` field already in existing data model. Current parsing is brittle (only accepts `"checked"`). Must accept `"yes"`, `"true"`, `"1"`, `"checked"` — normalise on ingest. Ranged items get priority slot in allocation before non-ranged items are considered. |
| **Net allocation across multiple sources** | If store A can supply 10 units and stores B and C both want it, the system must allocate without over-committing. Net allocation prevents the same dead-stock units being promised to two destinations. | High | This is the hardest matching logic problem. Requires greedy or priority-queue allocation across all transfer candidates for a given SKU. Biggest differentiator over simple "flag if ROU > 0" matching. |
| **Data quality warnings (not silent errors)** | When ROU is zero, null, or unparseable, surface a visible warning rather than silently defaulting to 0. Managers need to know their data is clean. | Low | Current codebase uses `or 0.0` masking. Replace with explicit warning row in UI: "Store X: 3 SKUs had unparseable ROU — excluded from match." |
| **Per-store upload workflow with replace semantics** | Each store's data can be re-uploaded independently without re-uploading all stores. New file replaces old file for that store. | Low | Already in existing architecture intention. Must be explicit in UI: "Replace Chemist Warehouse Bondi data" button with confirmation. |
| **Excel (XLSX) export** | Pharmacy managers live in Excel. XLSX export with formatted columns (freeze header row, auto-width columns) is significantly more useful than raw CSV for operations staff. | Medium | Use `exceljs` or `xlsx` library. Format: frozen header, column widths, no formulas needed. |
| **Usage counter display** | Show free-tier users how many runs they have left this month. Reduces surprise at the paywall moment. | Low | "1 of 1 free runs used this month" banner. Persistent, dismissible. Drives upgrade consideration before the wall hits. |
| **Months cover visualisation in results** | Show not just "transfer 24 units" but "this gives Store B 2.8 months cover." Makes the recommendation immediately interpretable without mental arithmetic. | Low | Derived column: `transfer_qty / ROU`. Display as `X.X mo`. |
| **Stale data warning** | If a store's upload is more than N days old, flag it in the UI before running a match. Prevents acting on stale data. | Low | Configurable threshold (default: 7 days). Warning, not a block — manager may be in a small group with infrequent FRED exports. |
| **Column mapping UI (fallback)** | If FRED changes its export format or a user uploads a non-standard file, allow them to map columns manually instead of getting a cryptic parse error. | High | Nice-to-have for v1 only if header aliasing fails in testing. Defer unless aliasing breaks frequently. Deprioritise. |

---

## Anti-Features (Deliberate Exclusions for v1)

Things that seem useful but will expand scope, add complexity, or dilute focus. Build these later or never.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Direct FRED Office API integration** | FRED doesn't publish a public API. Screen-scraping or internal protocol reverse-engineering is fragile and a support burden. | Keep manual CSV/XLSX export as the input. Users already know the workflow. |
| **Real-time multi-user collaboration** | Pharmacy groups have one operations manager who runs matches. Concurrent editing of the same dataset is not a real use case. | Single-user-per-org session model is sufficient. |
| **Mobile app (iOS/Android)** | Match runs happen at a desk, once a week or month. Mobile is not the workflow context. | Responsive web is enough. |
| **Audit/history trail of past match runs** | Useful but significant scope. Requires storing full match result snapshots, versioning, and a history UI. | Defer to v2. Free-tier users especially do not need this. |
| **Multi-store comparison visualisation (charts)** | Attractive but not actionable for v1. The table is the action-driver; charts are for reporting. | Defer to v2. |
| **Demand forecasting / reorder point calculation** | Out of scope. This is transfer matching, not replenishment planning. Two different workflows with different data requirements. | The ROU field is used only for cover calculation, not forecasting. |
| **Email/SMS notifications when a match run completes** | Async notification is an enterprise feature. Match runs are fast (seconds) — no async gap to fill. | Synchronous response is fine. |
| **Custom user roles (admin/viewer/editor per store)** | Complex RBAC is not needed when the typical user is one operations manager per pharmacy group. | Clerk organisation membership is sufficient for v1. One role: org member. |
| **Stripe-metered billing (pay-per-run pricing)** | Pay-per-run creates invoice anxiety and is wrong for a tool used weekly. | Flat subscription: free (1 run/month) → paid (unlimited). Simple Stripe Checkout link for upgrade. |
| **White-label / reseller mode** | No evidence of channel partners in the current market context. Adds multi-layer tenancy complexity. | Single-tenant-per-org model for v1. |
| **Inline spreadsheet editing of upload data** | Attractive technically but teaches users to edit data in the tool rather than fixing it at source (FRED Office). | Show validation errors, instruct user to fix in FRED and re-export. |
| **Suggested order quantities to suppliers** | Different workflow entirely (purchasing vs. internal transfer). Different data (lead times, supplier pricing). | Out of scope. Clearly separate this concern. |

---

## Feature Dependencies

```
Clerk Auth
  └── Org-scoped data (org_id on all rows)
        └── Per-org file storage (ROU + dead-stock per store)
              └── Dynamic store list (derived from stored uploads)
                    └── Match run
                          ├── Months-cover cap (user input before run)
                          ├── Sell-through filter
                          ├── Ranged-product prioritisation
                          ├── Net allocation logic
                          └── Results table
                                ├── CSV export
                                ├── XLSX export
                                └── PDF export

Free tier enforcement
  └── Postgres usage counter (org_id + calendar month key)
        ├── Check before match run (block if limit reached)
        ├── Increment after successful run
        └── Usage counter display in UI
              └── Upgrade prompt (modal on 429)
```

---

## MVP Recommendation

**Phase 1 (core loop):** Auth (Clerk) → file upload per store → months-cover cap input → match run → results table → CSV export → free tier enforcement.

This is the minimum viable version that delivers the core value proposition end-to-end.

**Phase 2 (quality and workflow):** XLSX export, ranged-product prioritisation fix, net allocation logic, data quality warnings, stale data warnings, usage counter display.

**Phase 3 (differentiation):** Months cover visualisation in results, PDF export, upgrade prompt polish, column mapping fallback UI.

**Defer indefinitely:** All anti-features listed above.

---

## Notes on Key Implementation Decisions

### Usage metering: Postgres counter, not Cloudflare KV

Store the usage counter in NEON Postgres, not Cloudflare KV. Reasons:

1. KV is eventually consistent — two concurrent match run requests could both read "0 runs used" before either writes "1". A Postgres `UPDATE ... RETURNING` with a row-level lock is atomic.
2. The counter table (`usage_counters`) already lives next to the subscription/org data. No new infrastructure dependency.
3. Pattern: `(org_id, year_month)` composite key. `year_month` is `YYYY-MM` string. On first run of each month, insert row with `count = 1`. Subsequent runs increment. Check `count < limit` before allowing run. Reset is implicit (new month = new row).
4. Cron reset is not needed — the month key IS the reset mechanism.

### Multi-tenancy: org_id column + application-layer enforcement

Use Postgres `org_id` column on all tables (`stores`, `rou_uploads`, `deadstock_uploads`, `match_runs`). Do not rely on Postgres RLS for the initial version — RLS adds complexity and the worker-to-database connection model (connection string, not user-per-tenant) makes RLS setup non-trivial on NEON. Application-layer enforcement (every query includes `WHERE org_id = $1` where `$1` comes from Clerk session) is explicit, testable, and auditable.

Review RLS addition in v2 once multi-tenancy patterns are stable.

### File upload: parse client-side, store server-side

Parse CSV/XLSX in the browser using SheetJS (already in existing codebase intent). Send parsed row data as JSON to the Worker API. Worker validates structure and writes to NEON. Do not upload raw files to R2 for v1 — unnecessary complexity. If raw file storage is needed later (audit trail, re-processing), add R2 in v2.

### Column header aliasing: normalise on ingest, warn on failure

Keep the existing header aliasing approach (maps variant column names to canonical names). Extend it to handle `is_ranged` variants (`"checked"`, `"yes"`, `"true"`, `"1"`, `"Yes"`, `"TRUE"`). If a required column cannot be resolved, return a structured error listing which columns were expected and which were found. Never silently default.

### Export formats: priority order is CSV > XLSX > PDF

CSV is the most actionable format (importable into POS, shareable via email). XLSX is preferred by operations staff for manual review. PDF is a nice-to-have report format. Implement in that order. PDF can be deferred to Phase 3.

### Freemium UX: show counter, frame limit as opportunity

Display "X of 1 free run used this month" in a persistent (but low-prominence) banner on the match page. When the limit is reached, show a modal with positive framing ("You've run your free match — upgrade for unlimited access") and a clear CTA to Stripe Checkout. Do not hard-block the UI with a wall — let users still see their previous results and the upload interface.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Core matching features | HIGH | Working existing codebase provides ground truth. Requirements are validated. |
| File upload UX patterns | HIGH | Kalzumeus article + Uploadcare UX guide + multiple sources agree on patterns. |
| Export format priority (CSV > XLSX > PDF) | HIGH | Standard workflow pattern, confirmed across multiple pharmacy/inventory tool sources. |
| Usage metering (Postgres counter pattern) | HIGH | Multiple SaaS billing guides recommend database-backed counters. Postgres atomic increment is well-documented. |
| Freemium upgrade prompt UX | MEDIUM | Appcues research + Stripe guide are credible but best pattern varies by product. The recommended approach (warning at limit, positive framing) is well-evidenced. |
| Net allocation logic complexity | MEDIUM | No single source documents the exact algorithm. This is domain-specific. Needs a spec written during the logic audit phase. |
| Ranged vs non-ranged prioritisation | MEDIUM | Feature exists in current codebase but the priority ordering logic needs to be validated against real pharmacy buyer workflow. |
| RLS for multi-tenancy | MEDIUM | RLS is well-documented but adds complexity on NEON/Workers connection model. Application-layer enforcement recommended for v1. |

---

## Sources

- [10 Main Features of a Pharmacy Inventory Management System — Langate](https://langate.com/news-and-blog/10-main-features-of-a-pharmacy-inventory-management-system/)
- [Pharmacy Inventory Management Systems in 2025 — Interexy](https://interexy.com/pharmacy-inventory-management-system-main-features-benefits)
- [Datarithm Liquidation Engine (dead-stock market context)](https://www.datarithm.co/news/datarithm-introduces-its-liquidation-engine)
- [Design and Implementation of CSV/Excel Upload for SaaS — Kalzumeus](https://www.kalzumeus.com/2015/01/28/design-and-implementation-of-csvexcel-upload-for-saas/)
- [UX best practices for designing a file uploader — Uploadcare](https://uploadcare.com/blog/file-uploader-ux-best-practices/)
- [How to Implement Usage Tracking and Limits — Autumn](https://useautumn.com/how-to-implement-usage-tracking-and-limits)
- [How freemium SaaS products convert users with brilliant upgrade prompts — Appcues](https://www.appcues.com/blog/best-freemium-upgrade-prompts)
- [Beyond metering: usage-based pricing guide — Stigg](https://www.stigg.io/blog-posts/beyond-metering-the-only-guide-youll-ever-need-to-implement-usage-based-pricing)
- [Multi-tenant data isolation with PostgreSQL Row Level Security — AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Shipping multi-tenant SaaS using Postgres Row-Level Security — Nile](https://www.thenile.dev/blog/multi-tenant-rls)
- [Stripe Meters API Reference](https://docs.stripe.com/api/billing/meter)
- [Data Table Design UX Patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Filter UX Design Patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-filtering)
- [Pharmacy Inventory Management: Complete Guide 2026 — CPCON](https://cpcongroup.com/insights/article/pharmacy-inventory-management/)
