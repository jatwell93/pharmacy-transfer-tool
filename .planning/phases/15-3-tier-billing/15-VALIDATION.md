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
| **Framework** | vitest (frontend) + wrangler dev + manual Stripe test-mode flows |
| **Config file** | `clerk-react/vitest.config.ts` (if exists) or inline |
| **Quick run command** | `cd clerk-react && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd clerk-react && npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd clerk-react && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd clerk-react && npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | BILLING-05 | — | PLAN_LIMITS enforces tier caps | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | BILLING-06 | — | Atomic counter UPDATE returns row only if below limit | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | BILLING-07 | — | Store gate fires at match time, not upload | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-04 | 01 | 1 | BILLING-08 | — | 429 response includes upgrade_to field | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-05 | 01 | 1 | BILLING-09 | — | Webhook deduplication via stripe_event_id ON CONFLICT | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-06 | 01 | 1 | BILLING-10 | — | create-checkout stores stripe_customer_id before redirect | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-07 | 01 | 2 | BILLING-11 | — | customer.subscription.updated writes plan_tier | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-01-08 | 01 | 2 | BILLING-12 | — | create-portal-session returns url without exposing customer_id | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | BILLING-05 | — | BillingPage renders 3 cards | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | BILLING-08 | — | Upgrade modal shows correct copy per upgrade_to field | unit | `vitest run` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 2 | BILLING-09 | — | Checkout success shows spinner then toast | manual | Stripe test mode | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `clerk-react/src/__tests__/plans.test.ts` — stubs for PLAN_LIMITS unit tests
- [ ] `clerk-react/src/__tests__/billing-worker.test.ts` — stubs for Worker endpoint tests
- [ ] `clerk-react/src/__tests__/BillingPage.test.tsx` — stubs for BillingPage component tests
- [ ] `clerk-react/src/__tests__/UpgradeModal.test.tsx` — stubs for upgrade modal tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgrade Free→Pro via Stripe Checkout (test mode) updates plan_tier synchronously | BILLING-09 | Requires live Stripe test mode session | 1. Create Free org, 2. Click "Upgrade to Pro", 3. Complete checkout with Stripe test card, 4. Verify redirect shows "You're now on PharmIQ Pro" toast, 5. Run a match — succeeds without 429 |
| customer.subscription.updated webhook updates plan_tier | BILLING-11 | Requires live Stripe webhook delivery | Use `stripe listen --forward-to` in test mode; trigger subscription update via Stripe dashboard |
| Customer Portal subscription management | BILLING-12 | Requires live Stripe Customer Portal session | Click "Manage subscription →", verify portal opens, cancel subscription, verify plan_tier resets to 'free' |
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
