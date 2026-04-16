# Research Summary: v1.1 Reporting & Tiered Billing

**Project:** PharmIQ Stock Transfer
**Milestone:** v1.1 — Reporting & Tiered Billing
**Researched:** 2026-04-16
**Overall Confidence:** HIGH

---

## Stack Additions

The only new frontend dependency is **recharts 3.8.1** (SVG-based, React-native API, Cloudflare Pages safe, ~90 KB gzip). Install with `npm install recharts` in `apps/web`; if peer-dep errors appear due to `react-is`, add the `"overrides": { "react-is": "^19.0.0" }` workaround to `apps/web/package.json` per the shadcn/ui-documented pattern — recharts 3.x resolved the underlying issue but the override may still be needed depending on the dependency tree. Chart.js is ruled out because its canvas renderer requires `document.createElement('canvas')`, which fails in any pre-render context and is fragile on Cloudflare Pages; visx and victory are ruled out as disproportionate effort for two standard chart types. On the Stripe side, two new products and price IDs are required (`STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_ENTERPRISE`), replacing the current single `STRIPE_PRICE_ID` env var. The webhook handler gains a `customer.subscription.updated` listener and must write `plan_tier` (not just binary status) to `subscriptions`. Two schema migrations are needed: `ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS cost_ex NUMERIC(12,4) NULL` for optional cost-per-unit storage, and `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'` plus `stripe_price_id TEXT` for audit trail. All existing `subscriptions.status = 'paid'` rows migrate to `'pro'`. No new libraries beyond recharts, no new infrastructure, no Worker runtime changes.

---

## Feature Landscape

### Dead Stock Visualisation

**Table stakes (users expect these):**
- Pre-match pie chart showing dead stock units per store — the universal "where is my problem stock?" view that every inventory dashboard provides; requires only existing upload data, no cost column needed.
- Post-match grouped bar chart with "Before" vs "If all transfers complete" bars per store — without a before/after comparison, managers cannot judge whether the logistics effort is worth it; grouped (not stacked) bars are the NN/G-confirmed format for before/after comparisons.
- Chart tooltips and a legend with store colours — bare charts feel imprecise for a B2B tool; built-in Recharts Tooltip and Legend components handle both at minimal cost.

**Differentiators (what separates PharmIQ from a spreadsheet):**
- Net units recovered KPI card above the post-match chart ("482 units cleared across 4 stores") — anchors the visual output to a business outcome without requiring cost data; always computable from match results.
- Per-store delta annotation on each "After" bar showing the absolute unit improvement — eliminates mental subtraction; pharmacy managers are operational and literal, not analytical.
- "Download chart as PNG" button — operations managers share results via email and Teams; a dedicated export is more reliable than a screenshot.

**Anti-features to avoid:**
- Animated chart transitions — adds accessibility concerns and feels jarring in a B2B operations context; use `isAnimationActive={false}` on all Recharts chart components.
- D3.js custom charts — 10x setup effort for identical pie and bar output; entirely unjustified.
- Interactive chart-to-table cross-filtering — significant engineering effort for a capability pharmacy managers have not requested; add only if explicitly asked post-launch.

---

### Cost & Dollar Reporting

**Table stakes (users expect these):**
- Dead stock dollar value per store (`SUM(cost_ex * soh)`) — the industry-standard dead stock metric is dollars, not units; NetSuite, Unleashed, and every inventory KPI guide define dead stock by value.
- Dead stock as a percentage of total SOH value — the canonical KPI; industry benchmark is under 10%; requires a manual total SOH $ input per org because FRED dead stock exports do not include a full stock valuation.
- Graceful degradation when Cost Ex column is absent — if a user uploads a standard FRED dead stock report without cost data, the dollar section must explain the gap and not crash or show zeros; the pie chart continues to render in units.

**Differentiators:**
- "Recoverable value" KPI card after match run ("If all transfers complete, $12,400 in dead stock moves to active stores") — ties the matching algorithm directly to a dollar outcome; only shown when cost data is present.
- Industry benchmark indicator ("Your dead stock rate: 18% — Industry target: <10%") — colour-coded against the 10% and 25% thresholds using hardcoded benchmarks from NetSuite/Unleashed/Speed Commerce; no external API required.
- "Top 10 dead stock SKUs by value" table — ranked list of worst offenders for focused action; simple `ORDER BY (cost_ex * soh) DESC LIMIT 10` query against existing data.

**Anti-features to avoid:**
- Separate stock valuation report upload as a third file type — triples upload complexity and user friction; instead, document that users should export FRED's Stock Valuation report as their dead stock upload (it includes all dead stock fields plus Cost Ex).
- Per-store SOH dollar inputs — operations managers know their network total, not per-store breakdowns; one total SOH $ input per org is sufficient for v1.1.
- Historical dead stock trend charts — requires snapshot storage across multiple uploads; explicitly deferred to v2.

---

### 3-Tier Billing

**Table stakes (users expect these):**
- Pricing page with Free / Pro / Enterprise displayed side by side, with Pro visually highlighted as "Most Popular" — SaaS standard; the middle tier converts best when differentiated; use Stripe's embeddable `<stripe-pricing-table>` web component to avoid building this from scratch.
- Contextual upgrade prompt at match limit (dismissible banner at ~85% of limit, modal at 100%) — contextual prompts at the moment of friction convert 30-50% better than navigation-based upgrade flows.
- Upgrade prompt at store upload limit for Pro tier (10 stores) — a distinct friction point from the match limit; show an inline error at the upload step with a direct link to Enterprise checkout.
- Self-serve subscription management via Stripe Customer Portal — users must upgrade, downgrade, and cancel without contacting support; the Portal handles proration and payment method changes natively.
- Server-side enforcement of all tier limits — the Worker match endpoint and upload endpoint must check tier limits before executing; client-side gates are UX only, not security.

**Differentiators:**
- Usage counter visible on the match page ("8 of 10 matches used this month") — keeps users informed before they hit the limit; reduces surprise churn at renewal.
- Positive-framing upgrade prompts ("Unlock unlimited matches" not "You have exceeded your limit") — Appcues research confirms positive framing converts better for SMB SaaS upgrade flows.
- Enterprise "Contact us" CTA instead of self-serve Stripe Checkout — at $100/mo, enterprise buyers often want invoice billing and a conversation before committing; replacing the checkout link with a mailto or Calendly removes the need for Enterprise-specific Stripe flows in v1.1.

**Anti-features to avoid:**
- Custom subscription management UI (cancel, upgrade, change payment method) — duplicates Stripe Customer Portal; redirect to the Portal for all subscription management.
- Usage-based overage charging — hard stop at the tier limit then prompt to upgrade; overages create invoice anxiety and increase SMB churn.
- Custom-built pricing page HTML from scratch — Stripe's embeddable pricing table component handles responsive layout, price display, and Checkout redirect; building a custom version adds days of work for identical output.

**Tier summary:**

| Tier | Price | Match Limit | Store Limit |
|------|-------|-------------|-------------|
| Free | $0 | 1/month | 3 stores |
| Pro | $10/mo | 10/month | 10 stores |
| Enterprise | $100/mo | Unlimited | Unlimited |

---

## Architecture: Build Order

1. **Phase 1 — Schema Migration** — add `cost_ex NUMERIC(12,4) NULL` to `dead_stock` and `plan_tier TEXT NOT NULL DEFAULT 'free'` (plus `stripe_price_id TEXT`) to `subscriptions` before any other code runs; both the cost reporting and billing features have hard dependencies on these columns, so nothing downstream can be built or tested without them.

2. **Phase 2 — Cost Column: Parser + Upload + Summary Endpoint** — extend `parseDeadStockFile` in `parser.ts` to extract the Cost Ex column (the alias map already exists in the codebase but the extraction logic is unimplemented), write `cost_ex` in the upload route's UNNEST INSERT, and build the new `GET /api/dead-stock-summary` route that aggregates dead stock by store (total units and total dollar value); this endpoint also powers the pre-match chart in Phase 3.

3. **Phase 3 — Charts: Pre-Match Pie + Post-Match Grouped Bar** — install recharts, build `DeadStockChart.tsx` (PieChart reading from the summary endpoint) and `PostMatchChart.tsx` (grouped BarChart computing before/after deltas client-side from match results and summary data — no new Worker route needed); mount on UploadPage and MatchPage respectively.

4. **Phase 4 — Cost Report UI** — build `CostReport.tsx` using dollar aggregates already returned by the summary endpoint; add a manual SOH $ input field; compute dead stock percentage client-side; guard rendering against missing cost data (show upgrade hint when `totalValue === 0` for all stores); mount below PostMatchChart on MatchPage.

5. **Phase 5 — 3-Tier Billing** — create `lib/plans.ts` with `PLAN_LIMITS` constants and `PlanTier` type; update `billing.ts` (multi-price checkout, tier-aware `/usage` response), `match.ts` (tier-aware run and store-count enforcement), and `webhook.ts` (write `plan_tier` from checkout session metadata, reset on subscription deletion); update `BillingPage.tsx` to show three pricing cards; add `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` to env; create the two Stripe products in the dashboard (manual step). This is the most complex phase; it can proceed in parallel with Phases 3-4 once the Phase 1 schema migration is in place.

---

## Top Pitfalls

1. **ResponsiveContainer renders invisible at zero height** — wrap every Recharts chart in a `div` with explicit `min-h-[300px]`; never rely on a flex parent to supply height to `ResponsiveContainer`; this is a widely-documented Recharts issue that throws no error and produces a 0x0 SVG silently.

2. **Stale chart after file re-upload** — reset all chart-derived state in the same `setState` call that clears `matches` on new upload; chart and results table must always derive from the same in-memory data snapshot; do not fetch chart data independently from a separate hook that can diverge.

3. **Absent Cost Ex column vs blank Cost Ex cell are indistinguishable at row level** — detect header presence at the file level (inspect the header row before parsing data rows); if the Cost Ex header is entirely absent, set `hasCostColumn = false` and skip all cost calculations; do not default missing values to zero, which silently produces an inaccurate dollar report.

4. **Dollar report shows wrong totals when only some stores have cost data** — track which stores contributed cost data and surface "X of Y stores have cost data" prominently above the cost figures; never aggregate across a partial store set without a coverage indicator, or managers will treat a partial total as the group total.

5. **Paying user sees Free-tier limit immediately after Stripe checkout redirect** — Stripe webhooks are asynchronous and typically arrive 1-5 seconds after the redirect; on the checkout success URL, call the Stripe API synchronously to fetch session status and update `plan_tier` in NEON before rendering the page; treat the webhook as a reconciliation step, not the authoritative upgrade trigger.

6. **Match-run counter race condition: check-then-increment is not atomic** — use the atomic Postgres `UPDATE usage_meters SET count = count + 1 WHERE org_id = $1 AND count < $limit RETURNING count` pattern; if UPDATE returns 0 rows the limit is already hit; never do a separate SELECT before the UPDATE; this pitfall applies equally to the new Pro (10/month) and Free (1/month) limits.

7. **Webhook handler not idempotent — duplicate Stripe events cause double tier upgrades** — deduplicate on `stripe_event_id` with `INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`; if no row is returned the event was already processed; return HTTP 200 immediately without applying any database changes.

---

## Open Questions for User

1. **FRED Stock Valuation export format** — the cost column parser depends on knowing the exact column headers that FRED Office writes for cost-per-unit in a Stock Valuation export. Research inferred likely variants (`"Cost Ex"`, `"Cost Excl GST"`, `"Cost (Ex GST)"`) but this was not validated against a real export file. Can you provide a sample FRED Stock Valuation report (even anonymised) before the parser is built, so the header aliasing covers all real variants from the start?

2. **Free tier store limit** — the feature research specifies Free: 3 stores, Pro: 10 stores, Enterprise: unlimited. The current v1.0 schema enforces no store cap for free users. Is the 3-store Free limit confirmed for v1.1, or is Free remaining unlimited on store count (with only match-run count gated)? Introducing a store cap on existing Free users may require a grace period or a data conversation.

3. **Enterprise tier launch approach** — research recommends replacing the Enterprise Stripe Checkout link with a "Contact us" CTA (mailto or Calendly) to avoid building Enterprise-specific billing flows in v1.1. Is there a preferred contact channel to use for that CTA, or should a self-serve Enterprise Stripe Checkout be built instead?

---

*Synthesized: 2026-04-16*
*Source files: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
*Ready for roadmap: yes*
