# Features Research: v1.1

**Domain:** Pharmacy dead-stock matching / inter-store transfer SaaS (B2B, freemium, multi-tenant)
**Project:** PharmIQ Stock Transfer — v1.1 Reporting & Tiered Billing milestone
**Researched:** 2026-04-16
**Overall confidence:** HIGH (visualisation patterns and billing UX), MEDIUM (cost reporting UX), HIGH (3-tier billing implementation)

> Note: This file covers only the three new v1.1 feature areas.
> The v1.0 feature landscape (upload pipeline, matching algorithm, export, auth) is documented in the same file as of 2026-03-28 (archived below the v1.1 sections for reference).

---

## Dead Stock Visualisation

### Context and Dependencies

- Pre-match pie chart requires uploaded dead-stock file data (SOH per store per SKU). Depends on the upload pipeline already built.
- Post-match grouped bar chart requires a completed match run result. Depends on match run output being available in React state.
- The visualisation is read-only and informational — it does not change the match results.
- If no match has been run yet, the post-match chart cannot render. Show a placeholder.

### Table Stakes

Features that pharmacy managers expect from any basic inventory reporting tool. Missing these makes the visualisation feel like a stub.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pre-match pie chart: dead stock units per store** | Industry standard. Every pharmacy inventory dashboard shows "how much dead stock do I have and where." Managers need to see at a glance which stores are holding the most dead stock before deciding whether to run a match. | Low | Sum SOH across all dead-stock SKUs per store. Render as a proportional pie chart. Store names as labels. Values in units (not dollars — dollars come from the separate cost report). |
| **Post-match bar chart: current vs projected dead stock per store** | Without a before/after comparison, managers cannot judge whether the recommended transfers are worth the logistics effort. Grouped bars (current SOH vs projected SOH after transfers) per store is the expected format. | Medium | Requires computing projected SOH: for each source store SKU, subtract the recommended transfer quantity from its SOH. Grouped bar: two bars per store, "Current" and "After transfers". Do not call it "projected" — pharmacy managers are literal; call it "If all transfers completed". |
| **Chart tooltips showing actual values** | Bare charts without hover detail feel imprecise and unprofessional. Industry standard for data dashboards. | Low | Tooltip shows store name, units, and (for post-match) the delta from current. Use Recharts built-in Tooltip component. |
| **Responsive chart container** | Results page must work on 1280px+ laptop screens without chart overflow or label clipping. | Low | Wrap charts in a ResponsiveContainer from Recharts. Set minHeight so chart is visible on typical 768p laptop displays. |
| **Legend with store colours** | With multiple stores (up to 10 on Pro tier), users must be able to read which bar or slice belongs to which store. | Low | Recharts Legend component. Use PharmIQ teal palette for primary colours. Amber for the "after" state in the grouped bar to signal improvement. |
| **Empty state when no data** | If no dead-stock file has been uploaded, or no match has been run, charts must render a meaningful empty state rather than crashing or showing an empty canvas. | Low | Short explanatory message. "Upload dead stock files for each store to see the pre-match breakdown." |

### Differentiators

Features that separate PharmIQ from a generic inventory dashboard or a spreadsheet pivot chart.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Net dead-stock value recovered (text KPI card above chart)** | Numbers speak louder to pharmacy managers than shapes. A card reading "If all transfers completed: $12,400 in dead stock moves to active stores" (requires cost data) or "482 units cleared across 4 stores" (units, no cost required) anchors the chart to business impact. | Low | Derive from match results: sum of recommended transfer quantities across all SKUs. Display as a single summary card above the post-match chart. Always show units; show $ only when Cost Ex column is present. |
| **Per-store delta annotation on grouped bar** | A small "+/−X units" annotation on each "After" bar showing the absolute improvement for that store. Eliminates mental subtraction. | Low | Recharts LabelList component on the "After" bar. Show negative delta in teal (reduction in dead stock = good). |
| **Colour coding by improvement magnitude** | Stores that improve significantly are highlighted differently from stores where very little transfers. Instantly guides manager attention. | Medium | Conditional colour: store with largest unit reduction gets primary teal, others get progressively lighter shades. Requires sorting by delta. |
| **Download chart as PNG** | Operations managers share results via email or Teams. Exporting the chart as a standalone image is more useful than screenshotting. | Low | Use `chart.getDataURL()` via a ref on the Recharts chart container, or use html2canvas on the chart div. Trigger on a "Download chart" button below each chart. |

### Anti-Features / Over-Engineering

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **D3.js custom charts** | D3 has a steep learning curve and adds significant bundle weight. Recharts provides pie and grouped bar charts with identical output for a fraction of the implementation effort. | Use Recharts. It is the most-used React charting library, SVG-based, tree-shakeable, and integrates cleanly with React state. |
| **Animated chart transitions** | Chart animations increase perceived complexity and can feel jarring in an operations tool. They also add accessibility concerns. | Use Recharts `isAnimationActive={false}`. Static charts load faster and feel more professional for a B2B tool. |
| **Live / real-time data refresh** | Match results are a point-in-time snapshot. Pharmacy dead-stock data changes weekly, not by the second. Real-time polling adds infrastructure complexity with no user benefit. | Render charts from match run result in React state. User triggers a new run if they want fresh data. |
| **Interactive filters on charts (click store to filter table)** | Bi-directional chart-table linking is a significant engineering effort and not expected by pharmacy managers who are not data analysts. | The results table already has a store filter dropdown. Keep chart and table independent. Add linking only if explicitly requested by users post-launch. |
| **3D pie charts** | 3D distorts area perception and makes it harder to compare slices accurately. A known data visualisation anti-pattern. | Use a flat 2D pie chart. Add a legend with raw values in the tooltip for precision. |
| **Stacked bar instead of grouped bar** | Stacked bars make before/after comparison much harder because the "after" segment sits on top of the "before" segment. | Use grouped (side-by-side) bars. Current vs After, side by side per store. Nielsen Norman Group research confirms grouped bars are easier to interpret for comparisons. |

### Library Recommendation

**Use Recharts.** It is the dominant React charting library (most widely used in 2025), SVG-based, ships with PieChart, BarChart, ResponsiveContainer, Tooltip, and Legend out of the box, and integrates cleanly with React hooks and state. The existing project uses React 19 — Recharts is compatible. Install via `npm install recharts`. Confidence: HIGH (multiple official docs and independent reviews confirm).

---

## Cost and Dollar Reporting

### Context and Dependencies

- Requires an optional "Cost Ex" column in the dead-stock upload. This column maps to the "Cost Excl. GST" field in the FRED Stock Valuation report. It is not present in the standard FRED dead stock export — the user must export the Stock Valuation report instead of, or in addition to, the standard dead stock report.
- Dead stock dollar value = SUM(Cost Ex * SOH) per SKU per store, summed across all dead-stock SKUs for that store.
- Total SOH dollar value is not derivable from FRED exports without a full stock valuation export across all SKUs (not just dead stock). The simplest UX is to let the user type this number in manually — one input per store, or a single network total.
- This feature has a hard dependency: if Cost Ex column is absent from the upload, the dollar reporting section must degrade gracefully (hide dollar values, show only unit values).

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Dead stock $ per store (sum of Cost Ex × SOH)** | The industry-standard dead stock metric is dollar value, not units. NetSuite, Unleashed, and every inventory KPI guide defines dead stock as "value of unsold inventory." Pharmacy managers think in dollars. | Low | Calculate on the server after upload: for each org × store, SUM(cost_ex * soh) WHERE is_dead_stock = true. Display as "$X,XXX" with Australian dollar formatting. |
| **Dead stock as % of total SOH value** | The canonical KPI. Industry benchmark is <10%; >25-30% signals non-competitiveness. Displaying this number gives managers an instant health score they can benchmark against. | Low | Formula: (dead_stock_value / user_input_total_soh_value) × 100. Requires user to input their total SOH dollar value. Display prominently as "X% of your inventory is tied up in dead stock." |
| **Manual SOH $ input per org** | Total SOH dollar value cannot be derived from the dead-stock export alone. The user must supply it. This is acceptable — pharmacy managers know their total stock value from their FRED dashboard. | Low | Single number input: "Total inventory value ($)" with AUD currency formatting. Persist in Postgres per org so the user doesn't re-enter it every session. Add a helper label: "Find this in FRED Office → Reports → Stock Valuation → Total Cost Ex." |
| **Graceful degradation when Cost Ex absent** | If the user uploads a standard dead stock report (no Cost Ex column), the dollar section must not crash or show zeroes. It should explain what is missing and how to fix it. | Low | Detect presence of Cost Ex on ingest. If absent, set a flag in the database. UI shows: "Cost data not available — upload a FRED Stock Valuation report to enable dollar reporting." The pie chart still renders in units. |
| **Per-store breakdown table** | A table showing: Store | Dead Stock Units | Dead Stock $ | % of Total SOH. This is the primary output of the cost reporting feature. | Low | Standard data table. Sort by Dead Stock $ descending by default (largest problem store first). |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"Recoverable value" card after match** | After a match run, show: "If all transfers completed, $X,XXX in dead stock is moved to active stores." This ties the matching algorithm directly to financial outcomes. | Low | Derive from match results: for each recommended transfer, transfer_qty × cost_ex. Sum across all matches. Display as a single KPI card alongside the match results. Only visible when Cost Ex data is present. |
| **Industry benchmark comparison** | Show the user how their dead stock % compares to the <10% best-practice threshold. A simple colour-coded gauge or text label: "Your dead stock rate: 18% — Industry target: <10%." | Low | No external API needed — hardcode the 10% and 25% thresholds (well-evidenced benchmarks from NetSuite, Unleashed, Speed Commerce). Use teal for <10%, amber for 10-25%, red for >25%. |
| **"Top 10 dead stock SKUs by value" table** | A ranked table of the worst offenders by dollar value. Gives managers a place to focus beyond the chart aggregates. | Low | SELECT sku, description, cost_ex, soh, (cost_ex * soh) AS value WHERE is_dead_stock ORDER BY value DESC LIMIT 10. Standard pattern from inventory dashboard design guides. |

### Anti-Features / Over-Engineering

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic FRED Stock Valuation report parsing (separate upload)** | Adding a third upload type (ROU report, dead stock report, stock valuation report) triples the upload complexity and user friction. The Cost Ex column should be sourced from one report. | Ask users to use FRED's Stock Valuation report as their dead stock upload source — it includes all the same fields plus Cost Ex. Document this in a help tooltip on the upload page. |
| **Multiple SOH $ inputs (one per store)** | Pharmacy group operations managers typically know their total network SOH value, not per-store breakdowns. Per-store inputs create more data entry friction than they are worth. | One total SOH $ input for the whole org. If per-store SOH becomes a user request post-launch, add it then. |
| **Currency conversion / multi-currency** | All Australian pharmacies operate in AUD. Multi-currency adds complexity for zero benefit in this market. | Hardcode AUD. Format with `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`. |
| **Historical dead stock trend charts (week over week)** | Interesting but requires storing multiple snapshots over time. This is an audit/history feature — explicitly deferred to v2. | Show current snapshot only. Note in UI that historical trends are coming in a future version. |
| **Exporting cost report to accounting software** | Integration with Xero, MYOB, or similar is a separate product surface. Not in scope for a stock transfer tool. | Export to CSV covers the data portability need. Let accountants handle the import. |

---

## 3-Tier Billing UX

### Context and Dependencies

- Stripe is already integrated for the existing freemium billing (v1.0 phase). Existing pattern: 1 free match/month enforced via Postgres counter.
- New requirement: 3 explicit tiers — Free, Pro ($10/mo, 10 matches/mo, max 10 stores), Enterprise ($100/mo, unlimited).
- The Stripe pricing table widget (`stripe.pricingTable()`) is available and handles the public-facing pricing display. It cannot handle upgrades/downgrades from within an existing subscription — for that, use the Stripe Customer Portal.
- Billing enforcement must remain server-side. The frontend is informational only.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pricing page with 3 tiers displayed side by side** | Industry standard for SaaS. Users expect to see all options at once with a clear feature comparison. "Good / Better / Best" layout (also called "Free / Pro / Enterprise" or "Starter / Growth / Scale"). | Low | Use Stripe's embeddable pricing table component or a custom HTML pricing table. Stripe's embedded option is fastest to build and auto-syncs with Stripe product config. Supports up to 4 products — sufficient for 3 tiers. |
| **Highlight Pro as the recommended tier** | SaaS research consistently shows the middle tier converts best when visually differentiated as the "most popular" or "recommended" option. The Pro tier is the revenue target. | Low | Apply a "Most Popular" badge or border highlight to the Pro column. Use PharmIQ teal as the highlight colour. |
| **Upgrade prompt at match limit (soft then hard)** | Free users must see a contextual upgrade prompt at the moment of friction — not buried in settings. Research shows contextual prompts convert 30-50% better than navigation-based upgrades. | Low | Two-stage: (1) at 85% of limit (e.g. after 9 of 10 Pro matches), show a dismissible banner "You have 1 match left this month — upgrade for unlimited." (2) at 100%, show a modal with upgrade CTA. Never silently block — always explain why. |
| **Upgrade prompt at store limit (Pro tier, 10 stores)** | When a Pro user tries to add an 11th store upload, they hit the store limit. This is a distinct friction point from the match limit. | Low | Show inline error at the upload step: "Your plan supports up to 10 stores. Upgrade to Enterprise for unlimited stores." Include a direct link to Stripe Customer Portal or Enterprise checkout. |
| **Self-serve subscription management (Stripe Customer Portal)** | Users must be able to upgrade, downgrade, and cancel without contacting support. Any friction here increases churn. | Low | Use Stripe's built-in Customer Portal. Expose via a "Manage subscription" link in account settings. Stripe Customer Portal handles upgrade, downgrade, and cancellation flows natively. |
| **Current plan displayed in account settings** | Users must always know what plan they are on and what their current usage is. Confusion about plan status drives support tickets. | Low | Show: Plan name, next billing date, matches used this month / limit, stores uploaded / limit. Fetch from Stripe Subscription object + Postgres usage counter. |
| **Billing enforcement is server-side** | Client-side gating is trivially bypassable. Match run and store upload endpoints must check tier limits before executing. | Medium | Already enforced for match limit (Postgres counter). Extend to: check `org_tier` field in Postgres before accepting a new store upload. Set `org_tier` via Stripe webhook on subscription create/update/delete. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Usage counter visible on match page (not just settings)** | Showing "8 of 10 matches used" on the match trigger page (not buried in settings) keeps users informed before they hit the wall. Reduces surprise. | Low | Persistent low-prominence banner below the match run button. Only show on Pro and Free tiers; Enterprise users see "Unlimited." |
| **"What you unlock" framing on upgrade prompts** | Prompts framed as "Upgrade to unlock unlimited matches" convert better than "You have exceeded your limit." Research from Appcues and UserActive consistently shows positive framing outperforms restriction framing. | Low | CTA text: "Unlock unlimited matches" not "Upgrade now." Secondary text: "Pro plan — $10/month, 10 matches/month, up to 10 stores." |
| **Annual pricing option with discount** | Offering annual billing at 2 months free (e.g. $100/yr for Pro instead of $120/yr) is a standard SaaS revenue and churn-reduction tactic. Reduces month-to-month churn. | Low | Add annual price product in Stripe. Show monthly/annual toggle on pricing page. Highlight savings. Stripe pricing table supports multiple prices per product. |
| **Enterprise "Contact us" CTA (not self-serve checkout)** | Enterprise buyers ($100/mo) often want a conversation, a quote, and invoice billing rather than a credit card form. A "Contact us" button for Enterprise builds in the sales motion. | Low | Replace Stripe Checkout link for Enterprise with a mailto or Calendly link. Label as "Talk to us." This also removes the need to build Enterprise-specific Stripe flows for v1.1. |

### Anti-Features / Over-Engineering

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom-built pricing page from scratch** | Stripe's embeddable pricing table already handles responsive layout, price display, and Checkout redirect. Building a custom version adds days of work for identical output. | Use `<stripe-pricing-table>` web component. Configure in Stripe Dashboard. Embed with a script tag. |
| **Upgrade/downgrade inside the app (custom UI)** | Building a custom subscription management UI (cancel, upgrade, change payment method) duplicates Stripe Customer Portal. The Portal is production-tested and handles edge cases (proration, failed payments, invoice history). | Redirect to Stripe Customer Portal for all subscription management. Link from account settings. |
| **Metered / pay-per-run billing** | Per-run billing creates invoice anxiety and is wrong for a recurring operations tool. Managers need predictable costs. This is the same anti-feature from v1.0 research — still correct. | Flat subscription: Free → Pro ($10/mo) → Enterprise ($100/mo). |
| **Grandfathering / legacy plan logic** | Handling legacy plan codes, grandfathered pricing, and migration paths for old subscribers adds significant backend complexity for a product that has no subscribers yet. | Use a single clean set of Stripe products for v1.1. Add complexity only when real subscribers exist and plans change. |
| **Usage-based overage charging** | Charging per match above the plan limit (e.g. $2/match overage) adds billing complexity and invoice unpredictability. Research shows overage fees increase churn in SMB tools. | Hard stop at limit. Prompt upgrade. Do not charge overages. |
| **In-app Stripe Checkout iframe** | Embedding Checkout directly in the page (rather than redirecting to hosted Checkout) is a Stripe anti-pattern — it breaks on strict iframe policies and complicates PCI scope. | Use Stripe-hosted Checkout with redirect back to the app after success. |
| **Tier downgrade UI within the app** | Downgrades require proration, immediate enforcement, and potential data-loss conversations (e.g. "You have 12 stores uploaded but Free only allows 3 — which stores should we keep?"). This is a v2 problem. | Redirect to Customer Portal for downgrades. The Portal handles proration automatically. Do not build custom downgrade flows in v1.1. |

### Tier Logic Summary

| Tier | Price | Match Limit | Store Limit | Enforcement |
|------|-------|-------------|-------------|-------------|
| Free | $0 | 1/month | 3 stores | Postgres counter + org_stores count |
| Pro | $10/mo | 10/month | 10 stores | Postgres counter + org_stores count |
| Enterprise | $100/mo | Unlimited | Unlimited | No counter check |

Tier value stored in Postgres `organisations.tier` column (`free`, `pro`, `enterprise`). Updated via Stripe webhook (`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`). The Worker match endpoint reads `org.tier` from Postgres — never from Stripe API at request time (too slow, adds latency).

---

## Feature Dependencies (v1.1)

```
Dead Stock Upload (existing)
  └── Cost Ex column (optional, detected on ingest)
        ├── Dead stock $ per store (cost_ex × soh, summed)
        │     ├── Dead stock % of SOH (requires manual SOH $ input)
        │     ├── Recoverable value card (after match run)
        │     └── Top 10 dead stock SKUs by value table
        └── Pre-match pie chart (units — works WITHOUT Cost Ex)
              └── Match run result (existing)
                    └── Post-match grouped bar chart (current vs projected)
                          └── Net dead-stock value recovered card

Stripe Products (Pro + Enterprise)
  └── Stripe Pricing Table (public pricing page)
  └── Stripe Checkout (Free → Pro upgrade flow)
  └── Stripe Webhook → org.tier update in Postgres
        ├── Match run limit enforcement (extended from v1.0)
        ├── Store upload limit enforcement (new in v1.1)
        ├── Upgrade prompt: match limit (extended from v1.0)
        └── Upgrade prompt: store limit (new in v1.1)
  └── Stripe Customer Portal (self-serve subscription management)
```

---

## MVP Recommendation for v1.1

**Phase 1 (visualisation, no cost data):** Pre-match pie chart, post-match grouped bar chart, net units recovered card. These require only data already in the system. Recharts, no new upload fields. Low risk.

**Phase 2 (cost reporting):** Cost Ex column detection on upload, dead stock $ calculation, manual SOH $ input, dead stock % KPI, per-store breakdown table. Medium risk — depends on FRED Stock Valuation export format, which must be validated with a real export file before implementing the parser.

**Phase 3 (3-tier billing):** Stripe Pro + Enterprise products, pricing page with Stripe embeddable table, Pro tier gating (10 matches/month, 10 stores), Enterprise tier gating (unlimited), Stripe Customer Portal link, usage banner on match page.

**Defer to v2:** Historical trend charts, annual billing toggle, "Top 10 SKUs" table (nice-to-have), chart PNG download.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Recharts as chart library | HIGH | Multiple independent sources, official docs, dominant in React ecosystem. |
| Pre-match pie chart pattern | HIGH | Universal inventory dashboard pattern, confirmed across NetSuite, Datarithm, Unleashed docs. |
| Post-match grouped bar chart pattern | HIGH | NN/G research and multiple data visualisation guides confirm grouped bars for before/after comparisons. |
| Dead stock % of SOH calculation | HIGH | Standard formula, confirmed across NetSuite, Unleashed, CashFlow Inventory, Speed Commerce. |
| 10% benchmark for dead stock | MEDIUM | Widely cited but no single authoritative Australian pharmacy source. Multiple general inventory sources agree. |
| Manual SOH $ input UX | MEDIUM | No direct precedent in pharmacy SaaS found. Logical extrapolation from inventory dashboard patterns. Validate with target users. |
| Cost Ex column in FRED exports | LOW | Inferred from FRED Office feature set and pharmacy practice. Must be confirmed by testing with a real FRED Stock Valuation export before implementation. |
| Stripe pricing table for 3-tier display | HIGH | Confirmed directly in Stripe official docs. Supports up to 4 products and multiple prices per product. |
| Stripe Customer Portal for self-serve management | HIGH | Confirmed in Stripe official docs. Handles upgrade, downgrade, cancel, invoice history natively. |
| Stripe pricing table not suitable for upgrades | HIGH | Confirmed in Stripe official docs: "The pricing table only works for creating subscriptions." |
| "What you unlock" framing converts better | MEDIUM | Supported by Appcues research and UserActive guide. No direct A/B test data for this specific product category. |
| Enterprise "Contact us" vs self-serve | MEDIUM | Common pattern in B2B SaaS but not universally adopted. Valid for $100/mo price point where buyers may want invoicing. |

---

## Sources

- [Recharts official documentation](https://recharts.github.io/en-US/api/)
- [Best React chart libraries 2025 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [shadcn/ui charts (built on Recharts)](https://www.shadcn.io/charts)
- [Dead Stock Percentage — Alexander Jarvis](https://www.alexanderjarvis.com/what-is-dead-stock-percentage-in-ecommerce/)
- [What Is Dead Stock? — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/dead-stock.shtml)
- [33 Inventory Management KPIs and Metrics — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-kpis-metrics.shtml)
- [Dead stock reporting patterns — Sculpture Hospitality Inventory Tab](https://support.sculpturehospitality.com/what-is-the-inventory-tab)
- [Revisiting Dead Stock — Speed Commerce](https://www.speedcommerce.com/insights/revisiting-dead-stock-what-is-it-how-to-reduce-it/)
- [Choosing Chart Types: Consider Context — Nielsen Norman Group](https://www.nngroup.com/articles/choosing-chart-types/)
- [Embeddable pricing table — Stripe Docs](https://docs.stripe.com/payments/checkout/pricing-table)
- [Set up tiered pricing — Stripe Docs](https://docs.stripe.com/subscriptions/pricing-models/tiered-pricing)
- [SaaS Tiered Billing Guide — Maxio](https://www.maxio.com/blog/tiered-pricing-examples-for-saas-businesses)
- [Three-Tier Pricing Strategy for SaaS — FastSpring](https://fastspring.com/blog/three-tier-pricing-strategy-for-saas-is-it-still-ideal/)
- [How freemium SaaS products convert users with brilliant upgrade prompts — Appcues](https://www.appcues.com/blog/best-freemium-upgrade-prompts)
- [How to create a SaaS upgrade flow that converts — UserActive](https://www.useractive.io/articles/how-to-create-a-saas-upgrade-flow-that-converts/)
- [Pharmacy Inventory Forecasting — RxERP](https://rxerp.com/2026/02/10/pharmacy-inventory-forecasting-guide/)
- [Pharmacy Inventory Management — Datarithm](https://www.datarithm.co/pharmacy-inventory-management)

---

## v1.0 Feature Landscape (archived)

> The v1.0 feature research below is preserved for reference. It documents the core matching, upload, export, and freemium billing features built in v1.0.

**Domain:** Pharmacy dead-stock matching / inter-store transfer SaaS (B2B, freemium, multi-tenant)
**Researched:** 2026-03-28
**Overall confidence:** HIGH (core matching/upload/export patterns), MEDIUM (freemium metering implementation), MEDIUM (ranged-product prioritisation)

---

### Table Stakes (v1.0)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CSV/XLSX file upload per store** | FRED Office only exports CSV/XLSX; there is no API. This is the only data entry path. | Low | Already proven in existing app. Column aliasing (header heuristics) already implemented — keep it. |
| **Per-store upload status indicator** | With N stores, managers need to see at a glance which stores have fresh data and which are stale. | Low | Show store name, file name, upload timestamp. "Last uploaded 3 days ago" warning threshold (e.g. >7 days). |
| **Months-cover cap input** | Core new feature. Prevents receiving stores from becoming overstocked. Without it the transfer qty is uncapped and the tool is dangerous. | Medium | User sets cover target (e.g. 3 months). Max transfer = (cover × ROU) − existing SOH. Must never be negative. |
| **Match run trigger** | Explicit "Run Match" action (not auto-run on upload). User controls when matching executes after all uploads are current. | Low | Single button. Runs server-side. Returns results to display. |
| **Match results table** | The core output. Managers need to see: source store, destination store, SKU/item code, description, ROU, SOH, recommended transfer qty. | Medium | Virtualized table is already implemented (handles large datasets). Retain. |
| **Sell-through filter** | Only recommend transfers where the receiving store can sell the stock. Filter: ROU >= SOH / 12. | Low | Already implemented. Must survive rebuild. |
| **Dynamic store list** | Store names derived from uploaded file data, not hard-coded. | Low | Current store list is hard-coded — fixed in rebuild. |
| **CSV export of results** | Managers share results with staff, email to store managers, import into POS system. | Low | CSV is higher priority than Excel or PDF for workflow compatibility. |
| **Organisation-scoped data** | All uploaded data is per-org. No pharmacy group can see another group's data. | Medium | Postgres org_id column on all tables + application-layer enforcement. Clerk org ID as the tenant key. |
| **Auth with Clerk** | Must match companion app. Same users, same sessions. | Low | Clerk already in companion app. Wrap all routes. |
| **Free tier enforcement (1 run/month)** | Freemium model requires backend enforcement. | Medium | Counter stored in Postgres. Reset on calendar month boundary. Check before executing match. |
| **Upgrade prompt when limit hit** | Without a clear path to upgrade, free users just churn. | Low | Modal on 429 response from backend. |
| **Responsive web UI** | Managers use desktop and laptop. | Low | Not mobile-first, but must not break at standard laptop widths. |

### Differentiators (v1.0)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Ranged vs non-ranged product prioritisation** | Ranged items prioritised as receiving transfers. Prevents recommending a store stock a product it doesn't sell. | Medium | is_ranged field normalised on ingest to accept "yes", "true", "1", "checked". |
| **Net allocation across multiple sources** | Prevents same dead-stock units being promised to two destinations. | High | Greedy or priority-queue allocation. Biggest differentiator over simple flag-if-ROU-positive matching. |
| **Data quality warnings** | When ROU is zero/null/unparseable, surface visible warning rather than silently defaulting to 0. | Low | Replace or-0.0 masking with explicit warning row in UI. |
| **Per-store upload with replace semantics** | Each store's data can be re-uploaded independently. | Low | "Replace [Store] data" button with confirmation. |
| **Excel (XLSX) export** | Pharmacy managers live in Excel. | Medium | Use exceljs. Formatted columns, freeze header row, auto-width. |
| **Usage counter display** | Show free-tier users how many runs they have left. | Low | "1 of 1 free runs used this month" banner. |
| **Months cover visualisation in results** | "Transfer 24 units" → "This gives Store B 2.8 months cover." | Low | Derived column: transfer_qty / ROU. Display as X.X mo. |
| **Stale data warning** | Flag store upload >7 days old before running match. | Low | Configurable threshold. Warning, not a block. |

### Anti-Features (v1.0)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Direct FRED Office API integration** | No public API. Screen-scraping is fragile. | Keep manual CSV/XLSX export. |
| **Real-time multi-user collaboration** | One operations manager per org runs matches. | Single-user-per-org session model. |
| **Mobile app** | Match runs happen at a desk. | Responsive web is enough. |
| **Audit/history trail** | Significant scope. Requires snapshot storage. | Defer to v2. |
| **Multi-store comparison visualisation** | Not actionable for v1. Table is the action-driver. | Defer to v2 (now v1.1). |
| **Demand forecasting** | Out of scope. Different workflow. | ROU used only for cover calculation. |
| **Email/SMS notifications** | Match runs are fast (seconds). No async gap to fill. | Synchronous response is fine. |
| **Custom user roles** | Complex RBAC not needed for one operations manager per org. | Clerk organisation membership is sufficient. |
| **Stripe-metered billing** | Pay-per-run creates invoice anxiety. | Flat subscription. |
| **White-label / reseller mode** | No channel partners in current market context. | Single-tenant-per-org for v1. |
| **Inline spreadsheet editing** | Teaches users to edit in tool rather than fix at source. | Show validation errors, instruct user to fix in FRED. |
| **Suggested order quantities to suppliers** | Different workflow entirely. | Out of scope. |

*Researched: 2026-04-16 (v1.1 sections) / 2026-03-28 (v1.0 archived sections)*
