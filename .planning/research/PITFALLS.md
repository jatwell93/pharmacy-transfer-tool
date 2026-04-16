# Pitfalls Research: v1.1

**Project:** PharmIQ Stock Transfer — v1.1 Reporting & Tiered Billing
**Stack context:** Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk — existing production system
**Scope:** Adding dead stock charts, optional Cost Ex CSV column, SOH vs dead stock dollar report, and 3-tier Stripe billing to an already-running app
**Researched:** 2026-04-16
**Confidence:** HIGH (sourced from official Stripe, Recharts/SheetJS docs, NEON docs, and verified community post-mortems)

---

## Charts

| Pitfall | Risk | Prevention | Phase |
|---------|------|-----------|-------|
| **ResponsiveContainer renders invisible at zero height** — Recharts `ResponsiveContainer` with `width="100%"` and `height="100%"` renders nothing if the parent element has no explicit height set. This is a known, documented issue with open GitHub tickets from 2022–2024. The chart appears in the React tree but the SVG has dimensions 0×0. | HIGH — chart ships but is invisible; user sees blank space; no error thrown | Wrap the chart in a `div` with an explicit `minHeight` (e.g., `min-h-[300px]`) or use a fixed pixel height on `ResponsiveContainer` (e.g., `height={300}`). Never rely on a flex parent to supply height — Recharts reads the DOM, not CSS flex layout. | Charts phase |
| **Chart not cleared after file re-upload** — existing app holds `matches` in React state. If a user re-uploads a new dead stock file without a full page reload, the chart will re-render with stale data from the previous run because the parent state was never reset. The table updates (it re-fetches) but the chart derives from a memo that is keyed to the old `matches` array. | HIGH — chart shows data from a prior run while the table shows the new run; pharmacist makes decisions on stale visualisation | Reset all chart-derived state (`chartData`, `preMatchTotals`, `postMatchTotals`) in the same `setState` call that clears `matches` on new upload. Do not derive chart data from a separate fetch — derive it from the same `matches` state object so they are always in sync. | Charts phase |
| **`window` / `ResizeObserver` undefined in SSR or Worker scope** — Recharts uses browser globals (`window`, `ResizeObserver`) internally for `ResponsiveContainer`. While this app uses Cloudflare Pages (client-side React), any attempt to pre-render or run chart components in a Worker context (e.g., for server-side PDF chart generation) will throw `ReferenceError: window is not defined`. | MEDIUM — only a risk if chart is used outside the browser (PDF export, edge SSR); Pages SPA is safe | Keep all chart components in client-only React. If chart-to-PDF export is added later, use a canvas screenshot approach (`html2canvas`) or a headless browser; do not attempt to render Recharts in a Worker. | Charts phase |
| **Bundle size adds ~40 KB gzipped for Recharts** — installing Recharts as a full package imports the entire library including unused chart types (Line, Bar, Area, Scatter, etc.). For a pie chart and a bar chart only, this is unnecessary payload on every page load. | LOW — Pages bundles are cached; 40 KB gzip is acceptable for a B2B SaaS; only matters if bundle budget is already tight | Use tree-shaking-friendly imports: `import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'`. Do NOT import the full default. Verify with `wrangler pages deploy` build output that the chunk size is acceptable. | Charts phase |
| **Pie chart colours clash with PharmIQ brand / dark mode** — Recharts default palette (blue, green, orange, red…) does not use PharmIQ's teal `#0F766E` and amber `#D97706`. In dark mode, default light-background colours become unreadable against the navy `#0F172A` base. | MEDIUM — visual inconsistency erodes trust in a branded SaaS product | Define a `BRAND_COLORS` constant array using PharmIQ palette for pie slices. Pass `fill={BRAND_COLORS[index % BRAND_COLORS.length]}` on each `<Cell>`. Test every chart in both light and dark mode before shipping — Recharts inherits nothing from Tailwind dark mode classes. | Charts phase |
| **Post-match "projected" chart is misleading if transfers are partial** — the post-match chart assumes all recommended transfers complete, which is never guaranteed. If labelled "projected inventory after transfers", pharmacists may treat it as a guaranteed outcome rather than a model. | MEDIUM — trust/credibility risk; pharmacists may file support tickets when reality does not match | Label the chart explicitly "Projected (if all transfers complete)". Add a tooltip or footnote. This is a copy/UX decision, not a code one, but it must be decided in the charts phase before shipping. | Charts phase |

---

## Optional Cost Column

| Pitfall | Risk | Prevention | Phase |
|---------|------|-----------|-------|
| **Absent column vs empty column treated identically by SheetJS** — when the Cost Ex column is not included in a FRED export at all, SheetJS `sheet_to_json` omits the key entirely from row objects (the property is `undefined`). When the column is present but a cell is blank, the same thing happens: property is also `undefined`. Code that checks `if (row['Cost Ex'] === undefined)` cannot distinguish "user forgot to include the column" from "this row has no cost". | HIGH — silent data quality issue; 0 costs silently substituted for rows that should flag as missing; dollar report becomes inaccurate | Check at the file level whether the column exists at all (inspect header row), not at the row level. If the header is absent, set `hasCostColumn = false` and skip cost calculations entirely for that upload. If the header is present but a row has no value, treat it as a data quality warning (surface to user), not a silent zero. | Optional Cost Column phase |
| **Negative or zero cost values accepted silently** — pharmacy FRED exports may contain cost errors (negative margin adjustments, zero-cost samples). If `costEx` is `0` or negative and the code only checks `isNaN(costEx)`, the dollar report shows a dead stock value of $0 or negative, which looks like a bug to the pharmacist. | MEDIUM — incorrect dollar report; pharmacist loses trust in the tool | Validate: `costEx > 0`. Negative and zero costs should be treated as a data quality warning and excluded from aggregation (or shown as a separate count of "excluded rows with invalid cost"). | Optional Cost Column phase |
| **Cost currency assumption** — FRED Office is an Australian POS system; costs are in AUD. The code must not perform any currency conversion and must display the `$` symbol without assuming any other currency. If the codebase later supports NZ pharmacies (a plausible expansion), the assumption bakes in. | LOW — no current risk; future risk only | Add an `AUD` constant comment in the cost aggregation function and a `// currency: AUD, no conversion applied` note. Do not add a currency field to the schema yet — premature. | Optional Cost Column phase |
| **Cost column name aliasing not applied** — the existing codebase has a `HEADER_ALIASES` dict for column name normalization. If Cost Ex is not added to the alias map, column headers like `"Cost Exc GST"`, `"CostEx"`, `"Cost (Ex GST)"` (all real FRED variants) will not be recognised. | HIGH — users who have a cost column under a slightly different name get no cost data and no error, and assume the feature is broken | Add all known FRED cost column name variants to the header alias map before the feature ships. Test against at least three real FRED export column name variants. | Optional Cost Column phase |
| **cost_ex stored as TEXT instead of NUMERIC in schema** — when adding a nullable optional column to an existing Postgres table, a developer may add it as `TEXT NULL` to "be safe". Aggregations (`SUM`, `AVG`) on TEXT fail silently in some ORMs or require explicit casting. | MEDIUM — dollar report aggregation queries break or return wrong types at the Postgres level | Add the column as `NUMERIC(12,4) NULL`. Write a migration that adds the column with `DEFAULT NULL`. Do not store cost as text. | Optional Cost Column phase |

---

## Dollar Report

| Pitfall | Risk | Prevention | Phase |
|---------|------|-----------|-------|
| **User-entered SOH $ value not validated — division produces Infinity or NaN** — the percentage calculation is `(dead_stock_value / total_soh_value) * 100`. If the user types `0`, `""`, or a non-numeric string into the SOH field, the result is `Infinity`, `NaN`, or a crash. | HIGH — the report renders `Infinity%` or `NaN%` to the pharmacist; looks broken; may be copy-pasted into a board presentation | Validate on the front-end: require a positive numeric SOH value before computing. Disable the percentage display and show a placeholder until a valid SOH is entered. Never perform the division in the Worker — this is a pure client-side calculation on already-fetched data. | Dollar Report phase |
| **Dollar report shows pre-match totals but user expects post-match totals** — the report shows how much dead stock value the pharmacy holds. If the user has already run a match and is looking at results, they may assume the "dead stock $" figure reflects what will remain after transfers, not what exists now. | HIGH — misinterpretation leads to incorrect decisions; pharmacist thinks more value is being freed than actually is | Make the report context explicit in the UI: "Dead Stock Value (current, before any transfers)". If a post-match dollar figure is needed, compute it separately and label it as "Projected dead stock value after transfers". Use distinct visual sections. | Dollar Report phase |
| **Aggregating cost across stores with partial cost data** — if only 3 of 5 stores have Cost Ex data (stores uploaded files with the cost column, others did not), the total dead stock value is understated without any warning. | HIGH — pharmacist sees a partial figure and treats it as the group total | Track which stores contributed cost data. If any store is missing cost data, show "X of Y stores have cost data" prominently. Do not aggregate across stores without surfacing the coverage gap. | Dollar Report phase |
| **Cost data from a previous upload used with current dead stock file** — if a user uploads a new dead stock file (without a cost column) but the previous upload had cost data stored in NEON, the report may display stale costs against current SOH quantities. | MEDIUM — costs from months ago applied to today's SOH figures; dollar values are wrong | Store `cost_ex` alongside `soh` in the same upload record. When a new dead stock upload replaces the old one (per-store), it must also replace or clear the cost_ex values. Do not retain cost_ex from a prior upload when a new file has no cost column. | Dollar Report phase |

---

## Multi-Tier Billing

| Pitfall | Risk | Prevention | Phase |
|---------|------|-----------|-------|
| **Stripe customer_id not stored at checkout — webhook can't find the org** — the `checkout.session.completed` webhook fires after payment. If `stripe_customer_id` was not stored in the `orgs` table when the session was created, the webhook handler cannot link the payment to an org. This is the most common Stripe integration failure: the handler does `db.query('WHERE stripe_customer_id = $1', [event.data.object.customer])` and gets 0 rows. | CRITICAL — subscription is paid but the org stays on Free; no upgrade applied; customer angry | At checkout session creation, store `stripe_customer_id` in the `orgs` table immediately (before redirecting to Stripe). Also store `org_id` in the checkout session `metadata`. In the webhook handler, look up by `metadata.org_id` as the fallback if customer lookup fails. | Billing phase |
| **Subscription item replaced without specifying item ID — both prices active simultaneously** — when upgrading from Pro to Enterprise (or downgrading), calling `stripe.subscriptions.update()` with a new `price` without specifying the existing `subscription_item.id` creates a second subscription item. The subscription now has two active prices. The next invoice charges for both. | HIGH — customer is double-billed; Stripe support ticket required to fix; trust destroyed | Always update via the specific item ID: `items: [{ id: existingItemId, price: newPriceId }]`. Retrieve the current subscription before updating to get the item ID. Never pass `price` directly to a subscription update without `id`. | Billing phase |
| **Race condition: user runs match immediately after payment redirect, before webhook arrives** — Stripe webhooks are asynchronous and typically arrive 1–5 seconds after the checkout redirect. A user who clicks "Run Match" immediately after payment sees the old Free tier limit enforced (0 remaining runs) and gets a 429, even though they just paid. | HIGH — paying customers are blocked from the feature they just bought; worst possible first impression | On the success redirect URL, call the Stripe API directly to fetch the session status synchronously (not via webhook) and update the org's tier in NEON before rendering the success page. Treat the webhook as a confirmation/reconciliation step, not the authoritative upgrade trigger. | Billing phase |
| **Tier limits enforced only on the front-end** — the store-count cap (Pro: max 10 stores) and match-run cap are shown as UI warnings but not enforced in the Worker. A user with a modified front-end (or direct API access) bypasses both limits. | CRITICAL — paid limits are meaningless; any user can exceed Pro tier limits without upgrading; revenue model undermined | Enforce ALL limits in the Worker: check `org_usage.match_runs_this_month < tier_limit` and `COUNT(DISTINCT store_name) < store_limit` before executing the match. Return HTTP 402 with a structured error when a limit is exceeded. The front-end gates are UX, not security. | Billing phase |
| **Match-run counter race condition — check then increment is not atomic** — two simultaneous match requests for the same org both read `runs_this_month = 0`, both pass the limit check, both run, both increment. Free tier user gets 2 runs for the price of 0. This pitfall carried forward from v1.0 freemium into the expanded 3-tier model. | HIGH — all tier run limits are bypassable under concurrent load | Use the atomic Postgres `UPDATE ... WHERE count < limit RETURNING count` pattern. If UPDATE returns 0 rows, the limit was already reached — reject with 402. Never do a SELECT then a separate UPDATE. This is the same prevention as C7 in the v1.0 pitfalls file — do not regress. | Billing phase |
| **Downgrade not enforced at billing period end — org retains Pro features indefinitely** — when a Pro org cancels, Stripe schedules the subscription to end at the period end. If the Worker only checks `subscription.status === 'active'`, a cancelled-but-not-yet-expired subscription is still `active`. When the period ends and the subscription becomes `canceled`, the org must be gated back to Free. If the webhook for `customer.subscription.deleted` is missed or errors out, the org keeps Pro features forever. | HIGH — revenue leak; org uses unlimited runs without paying | Listen for `customer.subscription.updated` (catches `cancel_at_period_end = true`) and `customer.subscription.deleted`. On both events, recalculate and persist the org's effective tier in NEON. Do not rely solely on the subscription status — store `tier`, `tier_expires_at`, and `stripe_subscription_id` and re-verify against Stripe on any billing-sensitive action if the stored tier is stale. | Billing phase |
| **Webhook handler not idempotent — duplicate events cause double increments or double tier upgrades** — Stripe retries webhooks on non-200 responses and may deliver the same event multiple times. A handler that does `INSERT INTO subscription_events` without checking for duplicates, or `UPDATE orgs SET match_runs = match_runs + 1` on every `invoice.paid` event, will apply the change multiple times. | HIGH — orgs credited with extra runs; billing records inconsistent | Check for duplicate events before processing: `INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`. If the insert returns no row (the event was already processed), return 200 immediately without applying any changes. Store the `stripe_event_id` on all subscription-related database operations. | Billing phase |
| **Store count not enforced at upload time (only at match time)** — the Pro tier caps at 10 stores. If the cap is only checked when running a match, an org can upload data for 15 stores without restriction. When they run the match, they get an error with no clear resolution path (they cannot un-upload stores easily). | MEDIUM — bad UX; user has already done work that is blocked; they feel misled | Enforce the store-count cap at upload time, not just at match time. When a new store's data is uploaded, check `COUNT(DISTINCT store_name) WHERE org_id = $1` against the tier limit. Return a 402 with a clear message ("Your plan supports 10 stores. Upgrade to Enterprise for unlimited stores.") before accepting the upload. | Billing phase |
| **Proration surprises on mid-cycle upgrade from Free to Pro** — Free tier has no Stripe subscription. Upgrading to Pro creates a new subscription mid-billing-month. The user is charged the full $10 on the first invoice (or a prorated amount depending on Stripe settings). If the UI does not make this clear, the user is surprised by an unexpected charge on their first statement. | LOW — billing surprise, not a system failure; recoverable | Show the exact charge amount on the upgrade confirmation screen using `stripe.invoices.retrieveUpcoming()` before the user confirms. Do not redirect to Stripe Checkout without first showing "You'll be charged $X today". | Billing phase |
| **Stripe webhook secret not rotated between environments — production events processed by dev handler** — using the same webhook endpoint or webhook secret in local development and production means that a `wrangler dev` tunnel (ngrok or Cloudflare tunnel) receives and processes real production Stripe events. A test event in dev increments a production usage counter. | MEDIUM — data integrity issue; usage counters corrupted; hard to diagnose | Register separate Stripe webhooks for dev (pointing to `wrangler dev` tunnel) and production (pointing to the deployed Worker URL). Use separate webhook signing secrets per environment stored in `wrangler.toml` secrets. Never share secrets across environments. | Billing phase |

---

## Cross-Cutting Pitfalls (Affect Multiple Features)

| Pitfall | Risk | Prevention | Affects |
|---------|------|-----------|---------|
| **Schema migration adds nullable column without backfilling — aggregation queries return wrong totals** — adding `cost_ex NUMERIC NULL` to the dead stock table leaves existing rows with `cost_ex = NULL`. A `SUM(cost_ex)` on a mix of NULL and valued rows returns NULL (not the sum of non-null values) in some query patterns. | MEDIUM | Use `SUM(cost_ex) FILTER (WHERE cost_ex IS NOT NULL)` in all aggregation queries. Document that `NULL` means "not provided" and `0` is a legitimate cost (a free sample). | Cost column, Dollar report |
| **Adding billing tier check adds latency to the match endpoint** — the match endpoint is the core product action. Adding a NEON query to check tier/usage before each match run adds a database round-trip. Under the NEON serverless driver (HTTP), this is 20–80 ms of added latency on every match run. | LOW | Batch the tier check into the same transaction as the usage increment: the `UPDATE org_usage ... RETURNING match_runs_this_month, tier_limit` pattern checks and increments atomically with one round-trip. Do not add a separate SELECT before the match logic. | Billing, Match endpoint |
| **v1.0 PITFALLS checklist items not regressed** — v1.1 adds new columns, new endpoints, and new external integrations. Each new endpoint that touches the database must include the `orgId` null guard, `org_id` in every WHERE clause, and an atomic usage check. It is easy to add a new endpoint and forget the v1.0 tenancy and counter patterns. | HIGH | Add a code review checklist item: every new Worker endpoint must be verified against the v1.0 prevention checklist (orgId guard, org_id in WHERE, no non-atomic counters). | All phases |

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Charts — ResponsiveContainer | Zero-height invisible chart | Explicit `minHeight` on parent div; test in both light and dark mode |
| Charts — data binding | Stale chart after re-upload | Reset chart state in the same call that clears `matches` |
| Charts — brand | Default Recharts colours | Define `BRAND_COLORS` array from PharmIQ palette; `<Cell fill={...}>` |
| Optional cost column — parsing | Absent column vs blank cell | Detect header presence at file level; treat absent column as "no cost data" |
| Optional cost column — aliases | Unrecognised FRED column name | Extend `HEADER_ALIASES` with all known Cost Ex variants before shipping |
| Optional cost column — schema | Stored as TEXT | Add as `NUMERIC(12,4) NULL`; write migration with `DEFAULT NULL` |
| Dollar report — division | Zero SOH input → Infinity | Validate SOH > 0 before computing; disable percentage display until valid |
| Dollar report — partial stores | Understated total | Show "X of Y stores have cost data" coverage indicator |
| Stripe — webhook | stripe_customer_id not stored | Store customer_id at session creation; use metadata.org_id as fallback in webhook |
| Stripe — upgrade | Two subscription items created | Always pass `items[].id` when updating a subscription |
| Stripe — race condition | Webhook arrives after redirect | Fetch subscription status from Stripe API synchronously on success redirect |
| Stripe — downgrade | Cancelled subscription retains Pro | Listen for `customer.subscription.deleted`; store `tier_expires_at` |
| Stripe — idempotency | Duplicate webhook events | Deduplicate on `stripe_event_id` with ON CONFLICT DO NOTHING |
| Stripe — enforcement | Limits front-end only | Enforce all limits in Worker before match execution; return 402 |
| Stripe — store cap | Enforced at match, not upload | Check store count at upload time; return 402 with upgrade CTA |

---

## Sources

**Recharts ResponsiveContainer zero-height issue:**
- https://github.com/recharts/recharts/issues/1545
- https://github.com/recharts/recharts/issues/4586
- https://www.dhiwise.com/post/simplify-data-visualization-with-recharts-responsivecontainer

**Recharts bundle size:**
- https://github.com/recharts/recharts/issues/1417
- https://github.com/recharts/recharts/issues/2174

**SheetJS blank/absent column behaviour:**
- https://github.com/SheetJS/sheetjs/issues/50
- https://github.com/SheetJS/sheetjs/issues/139
- https://github.com/SheetJS/sheetjs/issues/592
- https://github.com/exceljs/exceljs/issues/1924

**Stripe subscription upgrade/downgrade pitfalls:**
- https://docs.stripe.com/billing/subscriptions/change
- https://docs.stripe.com/billing/subscriptions/prorations
- https://www.stigg.io/blog-posts/the-only-guide-youll-ever-need-to-implement-upgrade-downgrade-flows-part-2

**Stripe webhook idempotency and race conditions:**
- https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks
- https://dev.to/belazy/the-race-condition-youre-probably-shipping-right-now-with-stripe-webhooks-mj4
- https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91
- https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide

**Stripe customer_id lookup failure on webhook:**
- https://github.com/better-auth/better-auth/issues/5976
- https://docs.stripe.com/billing/subscriptions/webhooks

**Postgres atomic check-and-increment:**
- https://dev.to/mistval/winning-race-conditions-with-postgresql-54gn
- https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/
- https://oneuptime.com/blog/post/2026-01-25-postgresql-race-conditions/view

**Stripe Cloudflare Workers native support:**
- https://blog.cloudflare.com/announcing-stripe-support-in-workers/

*Researched: 2026-04-16*
