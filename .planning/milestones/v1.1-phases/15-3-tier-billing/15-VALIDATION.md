---
phase: 15
slug: 3-tier-billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (worker + frontend) + wrangler dev + manual Stripe test-mode flows |
| **Config file** | `apps/worker/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command (worker)** | `cd apps/worker && npx vitest run --reporter=verbose` |
| **Quick run command (web)** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/worker && npx vitest run && npx tsc --noEmit && cd ../web && npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run --reporter=verbose` (for Plan 01 tasks) or `cd apps/web && npx vitest run --reporter=verbose` (for Plan 02 tasks)
- **After every plan wave:** Run full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | BILLING-05 | — | PLAN_LIMITS enforces tier caps | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-02 | 01 | 1 | BILLING-06 | — | Atomic counter UPDATE returns row only if below limit | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-03 | 01 | 1 | BILLING-07 | — | Store gate fires at match time, not upload | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-04 | 01 | 1 | BILLING-08 | T-15-01 | Pro->Enterprise checkout detects existing subscription, no duplicate | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-05 | 01 | 1 | BILLING-09 | T-15-11 | GET /billing/checkout-session/:sessionId confirms payment and upserts plan_tier | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-06 | 01 | 1 | BILLING-10 | T-15-03 | Webhook deduplication via stripe_event_id ON CONFLICT under direct neon() connection | unit | `cd apps/worker && npx vitest run src/__tests__/webhook.test.ts` | W0 | pending |
| 15-01-07 | 01 | 1 | BILLING-10 | — | create-checkout stores stripe_customer_id before redirect | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-01-08 | 01 | 1 | BILLING-10 | — | customer.subscription.updated writes plan_tier | unit | `cd apps/worker && npx vitest run src/__tests__/webhook.test.ts` | W0 | pending |
| 15-01-09 | 01 | 1 | BILLING-12 | T-15-04 | create-portal-session returns url without exposing customer_id | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | W0 | pending |
| 15-02-01 | 02 | 2 | BILLING-11 | — | BillingPage renders 3 cards | unit | `cd apps/web && npx vitest run src/__tests__/BillingPage.test.tsx` | W0 | pending |
| 15-02-02 | 02 | 2 | BILLING-11 | — | Current plan card has "Current plan" badge | unit | `cd apps/web && npx vitest run src/__tests__/BillingPage.test.tsx` | W0 | pending |
| 15-02-03 | 02 | 2 | BILLING-11 | — | "Manage subscription" link hidden for free users | unit | `cd apps/web && npx vitest run src/__tests__/BillingPage.test.tsx` | W0 | pending |
| 15-02-04 | 02 | 2 | BILLING-11 | — | Upgrade modal shows correct copy per upgrade_to field | unit | `cd apps/web && npx vitest run src/__tests__/UpgradeModal.test.tsx` | W0 | pending |
| 15-02-05 | 02 | 2 | BILLING-11 | — | Modal CTA text differs by target tier | unit | `cd apps/web && npx vitest run src/__tests__/UpgradeModal.test.tsx` | W0 | pending |
| 15-02-06 | 02 | 2 | BILLING-09 | T-15-09 | Checkout success calls GET /billing/checkout-session/:sessionId (not polling) | manual | Stripe test mode | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/__tests__/billing.test.ts` — exists (from prior phases); will be extended with new test cases in Plan 01
- [ ] `apps/worker/src/__tests__/webhook.test.ts` — exists (from prior phases); will be extended with new test cases in Plan 01
- [ ] `apps/web/src/__tests__/BillingPage.test.tsx` — created in Plan 02, Task 1
- [ ] `apps/web/src/__tests__/UpgradeModal.test.tsx` — created in Plan 02, Task 2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgrade Free->Pro via Stripe Checkout (test mode) updates plan_tier synchronously | BILLING-09 | Requires live Stripe test mode session | 1. Create Free org, 2. Click "Upgrade to Pro", 3. Complete checkout with Stripe test card, 4. Verify redirect shows "You're now on PharmIQ Pro" toast, 5. Run a match — succeeds without 429 |
| Pro->Enterprise upgrade does not create duplicate subscription | BILLING-08 | Requires existing Pro subscription in Stripe | 1. Start with Pro org, 2. Click "Upgrade to Enterprise", 3. Complete checkout, 4. Check Stripe dashboard — only one active subscription |
| customer.subscription.updated webhook updates plan_tier | BILLING-10 | Requires live Stripe webhook delivery | Use `stripe listen --forward-to` in test mode; trigger subscription update via Stripe dashboard |
| Customer Portal subscription management | BILLING-12 | Requires live Stripe Customer Portal session | Click "Manage subscription", verify portal opens, cancel subscription, verify plan_tier resets to 'free' |
| Enterprise org: unlimited runs, no store gate | BILLING-06 | Requires test plan_tier = 'enterprise' in DB | Set plan_tier='enterprise' in subscriptions table; run 20+ match runs — all succeed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
