---
phase: 05-freemium-and-billing
verified: 2026-04-06T04:00:00Z
status: human_needed
score: 13/13 must-haves verified
gaps: []
human_verification:
  - test: "Free org at monthly limit: visit Match page, confirm Run Match button shows Lock icon and 'Upgrade to run again' label in amber"
    expected: "Button is amber (#D97706), shows Lock icon + 'Upgrade to run again' label; clicking opens upgrade modal"
    why_human: "UI rendering and visual state cannot be verified programmatically without a live browser session with a real Clerk-authenticated free-tier org at count >= 1"
  - test: "Upgrade modal appears on 429: trigger a match run when already at limit (simulate by having server return 429), confirm modal opens"
    expected: "Modal overlay appears with 'You've used your free run for this month' heading and 'Upgrade Now' CTA button"
    why_human: "Modal trigger depends on runtime error state propagation through useMatchRun -> MatchPage useEffect; requires live session"
  - test: "Click 'Upgrade Now' in modal: confirm POST /api/billing/create-checkout is called and browser redirects to Stripe Checkout URL"
    expected: "Browser navigates to a Stripe Checkout session URL (https://checkout.stripe.com/...)"
    why_human: "Requires real Stripe credentials (STRIPE_SECRET_KEY + STRIPE_PRICE_ID) in .dev.vars and a live Worker; cannot verify window.location.href redirect programmatically"
  - test: "POST /api/stripe/webhook with a real checkout.session.completed event: verify org plan flips to paid in NEON subscriptions table"
    expected: "subscriptions row for the test org has status='paid', stripe_customer_id and stripe_subscription_id populated"
    why_human: "Requires real Stripe webhook signing secret and a live NEON connection; cannot run against test DB with placeholder secrets"
  - test: "Stripe subscription cancellation: fire a customer.subscription.deleted webhook, confirm org reverts to free plan and match runs return 429 again"
    expected: "subscriptions.status returns to 'free'; next match run from that org gets 429"
    why_human: "End-to-end webhook-to-DB-to-enforcement chain requires live Stripe + NEON; no mocking shortcut is sufficient"
  - test: "Usage counter re-fetches without page refresh: run a successful match, confirm counter text updates from '0 of 1' to '1 of 1' within the same page session"
    expected: "Counter text updates in place after match run completes"
    why_human: "Requires observing React state changes during a live match run; cannot be confirmed via static analysis"
  - test: "Billing page renders correctly for free and paid orgs: navigate to /billing while logged in as free org, confirm plan name, counter, upgrade CTA; then as paid org, confirm 'PharmIQ Pro' and 'Paid plan — unlimited runs'"
    expected: "Free: 'Free Plan', count/limit display, amber 'Upgrade to PharmIQ Pro' button. Paid: 'PharmIQ Pro', 'Paid plan — unlimited runs', no CTA."
    why_human: "Requires live Clerk session and real usage/subscription data from NEON"
---

# Phase 5: Freemium and Billing Verification Report

**Phase Goal:** The free tier limit is enforced atomically in the Worker before every match run, users can see their usage, and paying customers can subscribe via Stripe to unlock unlimited runs
**Verified:** 2026-04-06T04:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A free-tier org that has already run 1 match this calendar month is blocked with a 429 response before the algorithm executes | VERIFIED | `match.ts` lines 63-79: atomic `UPDATE usage_meters WHERE count < freeLimit RETURNING count`; if `updateRows.length === 0` returns `c.json({error: '...'},429)` before any `withOrgContext` data queries or `matchTransfers()` call. Unit tested in `billing.test.ts` test "returns 429 for free-tier org at limit". |
| 2 | The UI displays the current match run count and monthly limit without requiring a page refresh after each run | VERIFIED | `MatchPage.tsx` lines 267-271: `{usage && usage.plan === 'free' && (<span>{usage.count} of {usage.limit} free run{s} used this month</span>)}`. `handleRunMatch` calls `refreshUsage()` unconditionally after `await runMatch(...)` (line 74). `useUsage` exposes `refresh` callback wired to `GET /api/usage`. |
| 3 | When the free limit is reached the user sees an upgrade prompt with a working link to Stripe Checkout | VERIFIED | `MatchPage.tsx` lines 51-55: `useEffect` opens modal when `error.includes('Monthly match run limit reached')`. `handleUpgrade` (lines 77-87) POSTs to `/api/billing/create-checkout` and redirects via `window.location.href = url`. `billing.ts` lines 52-76 creates Stripe Checkout session. |
| 4 | After completing Stripe payment a Stripe webhook updates the org's plan to paid and subsequent match runs succeed without limit enforcement | VERIFIED | `webhook.ts` lines 55-71: `checkout.session.completed` handler upserts into `subscriptions` with `status='paid'`. `match.ts` line 57: `planStatus !== 'paid'` check skips usage enforcement for paid orgs. Webhook mounted before auth middleware (index.ts line 22 before line 27). |
| 5 | Cancelling a paid subscription via Stripe triggers a webhook that reverts the org to the free tier | VERIFIED | `webhook.ts` lines 76-87: `customer.subscription.deleted` handler updates `subscriptions SET status='free'`. Webhook test 4 confirms this path. |

**Score:** 5/5 roadmap success criteria verified

### Plan-level Must-Haves

**Plan 01 (BILLING-01, BILLING-02)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free-tier org that has run 1 match this month receives 429 before matchTransfers() executes | VERIFIED | `match.ts` lines 47-81: usage check before any `withOrgContext` call. `billing.test.ts` test 2 confirms `withOrgContext` not called on 429. |
| 2 | Free-tier org running first match succeeds and counter increments to 1 | VERIFIED | Two-step transaction in `match.ts`: INSERT ON CONFLICT DO NOTHING + UPDATE WHERE count < 1 RETURNING count. `billing.test.ts` test 1 confirms 200 response. |
| 3 | Paid-tier org can run unlimited matches without 429 | VERIFIED | `match.ts` line 60: `if (planStatus !== 'paid')` gates the entire free-tier enforcement block. `billing.test.ts` test 4 confirms single transaction call (plan check only). |
| 4 | GET /api/usage returns { count, limit, plan } for authenticated org | VERIFIED | `billing.ts` lines 16-48: reads `subscriptions` + `usage_meters` via `withOrgContext`, returns `c.json({ count, limit, plan })`. |

**Plan 02 (BILLING-04)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | checkout.session.completed sets org plan to paid in subscriptions table | VERIFIED | `webhook.ts` lines 55-71: INSERT ON CONFLICT DO UPDATE with `status = 'paid'`. |
| 2 | customer.subscription.deleted reverts org plan to free | VERIFIED | `webhook.ts` lines 76-87: UPDATE subscriptions SET `status = 'free'`. |
| 3 | Webhook with invalid Stripe-Signature rejected with 400 | VERIFIED | `webhook.ts` lines 30-33 (missing sig → 400 "Missing signature"), lines 39-50 (invalid sig → 400 "Invalid signature"). |
| 4 | Webhook route is public — no Clerk auth required | VERIFIED | `index.ts` line 22: `app.route('/api', webhookRoute)` before line 27: `app.use('/api/*', clerkAuth, requireOrg)`. `webhook.test.ts` test 6 confirms no 401 without Authorization header. |
| 5 | POST /api/billing/create-checkout returns { url } pointing to Stripe Checkout | VERIFIED | `billing.ts` lines 52-76: creates Stripe session with `mode: 'subscription'`, returns `c.json({ url: session.url })`. |

**Plan 03 (BILLING-03)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free-tier org at limit: Run Match button disabled with lock icon and "Upgrade to run again" | VERIFIED | `MatchPage.tsx` lines 285-289: `{isAtLimit ? (<><Lock size={16}/><span>Upgrade to run again</span></>) : ...}`. `isAtLimit` derived at line 38. |
| 2 | POST /match 429 triggers upgrade modal | VERIFIED | `MatchPage.tsx` lines 51-55: `useEffect` on `error` state opens `showUpgradeModal`. |
| 3 | Upgrade CTA calls create-checkout and redirects via window.location.href | VERIFIED | `MatchPage.tsx` lines 77-87: `handleUpgrade` POSTs to `/api/billing/create-checkout`, `window.location.href = url`. |
| 4 | Control bar shows usage counter for free orgs, hidden for paid | VERIFIED | `MatchPage.tsx` lines 267-271: `{usage && usage.plan === 'free' && (<span>...counter...</span>)}`. |
| 5 | Usage data re-fetches after each successful match run | VERIFIED | `MatchPage.tsx` line 74: `refreshUsage()` called after `await runMatch(...)`. |
| 6 | Billing nav item enabled and links to /billing | VERIFIED | `AppShell.tsx` lines 44-49: `disabled={false}` and `href="/billing"` on Billing NavItem. |
| 7 | /billing route renders BillingPage | VERIFIED | `App.tsx` lines 34-38: `<Route path="/billing" element={<ProtectedRoute requireOrg={true}><BillingPage /></ProtectedRoute>}/>`. |
| 8 | BillingPage shows plan, usage stats, upgrade CTA (free) or "Paid plan — unlimited runs" (paid) | VERIFIED | `BillingPage.tsx`: shows 'Free Plan'/'PharmIQ Pro' (line 48), usage counter (lines 58-60), upgrade CTA for free (lines 63-71), "Paid plan — unlimited runs" for paid (line 77). |

**Total must-haves score:** 13/13 verified across all 3 plans

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/worker/src/routes/billing.ts` | GET /api/usage endpoint | VERIFIED | 79 lines, exports `billingRoute`, GET /usage + POST /billing/create-checkout both implemented |
| `apps/worker/src/routes/match.ts` | Usage check before matchTransfers() | VERIFIED | Lines 47-81: atomic usage metering with `usage_meters`, returns 429 before data queries |
| `apps/worker/src/types.ts` | Env interface with Stripe env vars | VERIFIED | Lines 5-7: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` present |
| `apps/worker/src/__tests__/billing.test.ts` | Unit tests for billing route | VERIFIED | 340 lines, 10 test cases (4 match usage, 3 GET /usage, 3 create-checkout) |
| `apps/worker/src/routes/webhook.ts` | Stripe webhook handler (public route) | VERIFIED | 93 lines, exports `webhookRoute`, handles checkout.session.completed + customer.subscription.deleted |
| `apps/worker/src/__tests__/webhook.test.ts` | Unit tests for webhook | VERIFIED | 229 lines, 6 test cases |
| `apps/web/src/hooks/useUsage.ts` | useUsage hook wrapping GET /api/usage | VERIFIED | Exports `UsageData` interface + `useUsage` function with `refresh` callback |
| `apps/web/src/pages/MatchPage.tsx` | Usage counter, lock button, upgrade modal | VERIFIED | Contains `useUsage`, `isAtLimit`, `showUpgradeModal`, `handleUpgrade`, `create-checkout`, `window.location.href` |
| `apps/web/src/pages/BillingPage.tsx` | Billing page with plan info and upgrade CTA | VERIFIED | Exports `default function BillingPage`, shows 'Free Plan'/'PharmIQ Pro', 'Paid plan — unlimited runs' |
| `apps/web/src/App.tsx` | /billing route | VERIFIED | Line 34: `path="/billing"` with ProtectedRoute wrapping BillingPage |
| `apps/web/src/components/AppShell.tsx` | Enabled Billing nav item | VERIFIED | Lines 47-48: `disabled={false}` and `href="/billing"` on Billing NavItem |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/worker/src/routes/match.ts` | NEON usage_meters table | `sql.transaction()` with INSERT ON CONFLICT + UPDATE WHERE count < limit | VERIFIED | Lines 63-79: two-step atomic transaction pattern. `freeLimit = 1`. Returns 429 when UPDATE returns 0 rows. |
| `apps/worker/src/routes/billing.ts` | NEON usage_meters + subscriptions tables | `withOrgContext` queries | VERIFIED | Lines 23-47: subscriptions SELECT + usage_meters SELECT, returns `{ count, limit, plan }` |
| `apps/worker/src/routes/webhook.ts` | NEON subscriptions table | `neon sql.transaction` with UPDATE subscriptions SET status | VERIFIED | Lines 60-70 (paid upsert) and 81-86 (free update). Pattern `subscriptions` present in both. |
| `apps/worker/src/index.ts` | `apps/worker/src/routes/webhook.ts` | `app.route` mounted before `app.use('/api/*', clerkAuth, requireOrg)` | VERIFIED | Line 22: `app.route('/api', webhookRoute)` precedes line 27: `app.use('/api/*', clerkAuth, requireOrg)` |
| `apps/web/src/hooks/useUsage.ts` | GET /api/usage | `useFetch` hook calling `fetchApi('/api/usage')` | VERIFIED | Line 19: `fetchApi('/api/usage')`. `useFetch` uses `VITE_WORKER_URL` env var + Clerk Bearer token. |
| `apps/web/src/pages/MatchPage.tsx` | POST /api/billing/create-checkout | `handleUpgrade` function | VERIFIED | Lines 79-83: `fetchApi('/api/billing/create-checkout', { method: 'POST' })`, `window.location.href = url` |
| `apps/web/src/pages/MatchPage.tsx` | `apps/web/src/hooks/useUsage.ts` | `useUsage` import and `refreshUsage` call | VERIFIED | Line 6: `import { useUsage }`, line 27: destructures `refresh: refreshUsage`, line 74: `refreshUsage()` after match run |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MatchPage.tsx` usage counter | `usage` (UsageData) | `useUsage()` → `fetchApi('/api/usage')` → GET /api/usage Worker → `withOrgContext` queries `subscriptions` + `usage_meters` in NEON | Yes — reads from real NEON tables via org-scoped queries | FLOWING |
| `BillingPage.tsx` plan display | `usage` (UsageData) | Same `useUsage()` chain | Yes — same data source | FLOWING |
| `match.ts` 429 enforcement | `updateRows` | `sql.transaction()` direct NEON query: `UPDATE usage_meters WHERE count < freeLimit RETURNING count` | Yes — atomic DB counter, not hardcoded | FLOWING |
| `webhook.ts` plan activation | Stripe event org_id | `constructEventAsync` parses real Stripe-signed payload | Yes — org_id sourced from Stripe-signed session metadata | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — tests require a live NEON connection and Stripe credentials that are not available in the current environment. The unit test suite (billing.test.ts, webhook.test.ts) provides functional coverage with mocks. End-to-end behavior routed to human verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BILLING-01 | 05-01 | Free tier: 1 match run/month enforced via atomic Postgres counter | SATISFIED | `match.ts` lines 47-81: `UPDATE usage_meters WHERE count < 1 RETURNING count`; 429 on 0 rows returned |
| BILLING-02 | 05-01, 05-03 | User can see match runs used and monthly limit | SATISFIED | GET /api/usage returns `{count, limit, plan}`; MatchPage renders counter for free orgs |
| BILLING-03 | 05-03 | When free limit reached, upgrade prompt with Stripe checkout CTA | SATISFIED | Lock button + upgrade modal + `handleUpgrade` → `create-checkout` → `window.location.href` |
| BILLING-04 | 05-02 | Stripe integration: subscription creation, webhook activation/cancellation, unlimited paid runs | SATISFIED | `billing.ts` POST /billing/create-checkout; `webhook.ts` handles checkout.session.completed + customer.subscription.deleted; paid orgs bypass usage check |

All 4 billing requirements (BILLING-01 through BILLING-04) are mapped from plans and fully satisfied by implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `MatchPage.tsx` | 507 | Comment `{/* Indent chevron placeholder */}` | Info | Pure UI comment for visual indentation in virtualized table sub-rows. Not a code stub — the element renders a visual divider `<div className="w-px h-4 bg-[#E2E8F0]" />`. No impact on functionality. |

No blockers or warnings found. One informational comment that is not a stub.

### Human Verification Required

All automated checks passed. The following items require human testing with a live environment (real Clerk session, real NEON connection, real Stripe test credentials):

#### 1. Lock Button Visual State

**Test:** Log in as a free-tier org that has already run 1 match this month. Navigate to `/match`.
**Expected:** Run Match button is amber (`#D97706`), shows a Lock icon and label "Upgrade to run again".
**Why human:** UI visual state requires a live browser session with authenticated free-tier org at `usage.count >= usage.limit`.

#### 2. Upgrade Modal on 429

**Test:** While at the match limit, click the Run Match button (or trigger a match run that returns 429).
**Expected:** Modal overlay appears with title "You've used your free run for this month", "Upgrade Now" button, and "Maybe later" dismiss option.
**Why human:** Modal trigger depends on runtime error propagation through `useMatchRun` → `error` state → `useEffect` → `setShowUpgradeModal(true)`.

#### 3. Stripe Checkout Redirect

**Test:** Click "Upgrade Now" in the modal.
**Expected:** Browser navigates away to a Stripe Checkout session URL (`https://checkout.stripe.com/...`). On the Checkout page, org metadata is visible in the session.
**Why human:** Requires real Stripe test credentials (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`) and a deployed Worker. `window.location.href` cannot be tested without a real browser.

#### 4. Webhook Plan Activation (End-to-End)

**Test:** Complete a test Stripe Checkout payment. Check the NEON `subscriptions` table for the test org.
**Expected:** `subscriptions.status = 'paid'`, `stripe_customer_id` and `stripe_subscription_id` populated. Running a match from this org should succeed without 429.
**Why human:** Requires real Stripe webhook with valid `Stripe-Signature` header and live NEON connection.

#### 5. Subscription Cancellation Webhook (End-to-End)

**Test:** Cancel the Stripe subscription (or use Stripe CLI to fire `customer.subscription.deleted`). Check NEON subscriptions table and attempt a match run.
**Expected:** `subscriptions.status = 'free'`. Next match run from that org returns 429 after the first run.
**Why human:** Same as #4 — requires live Stripe + NEON.

#### 6. Usage Counter Live Refresh

**Test:** As a free-tier org with 0 runs used, run a match. Observe the counter on the Match page.
**Expected:** Counter text updates from "0 of 1 free runs used this month" to "1 of 1 free runs used this month" without page refresh.
**Why human:** Requires observing React state change (`refreshUsage()` call result) in a live browser session.

#### 7. Billing Page — Free and Paid Views

**Test:** Navigate to `/billing` as a free-tier org (0 runs used). Then as a paid-tier org.
**Expected:** Free: shows "Free Plan", "0 of 1" usage, amber "Upgrade to PharmIQ Pro" button. Paid: shows "PharmIQ Pro", "Paid plan — unlimited runs", no upgrade CTA.
**Why human:** Requires real usage/subscription data from NEON for both plan states.

### Gaps Summary

No gaps found. All must-haves verified. The phase goal is achieved at the code level.

The 7 human verification items all relate to end-to-end runtime behavior requiring live Stripe credentials and a NEON connection — these are not code gaps but integration validation steps that cannot be performed via static analysis.

---

_Verified: 2026-04-06T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
