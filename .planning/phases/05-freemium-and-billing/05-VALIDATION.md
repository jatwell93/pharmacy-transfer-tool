---
phase: 5
slug: freemium-and-billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 with `@cloudflare/vitest-pool-workers` 0.13.5 |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/worker && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/worker && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | BILLING-01 | T-5-01 | 429 returned before matchTransfers() when limit reached | unit | `cd apps/worker && npx vitest run --reporter=verbose billing.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 0 | BILLING-01 | — | 200 + counter increment when org under limit | unit | `cd apps/worker && npx vitest run --reporter=verbose billing.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 0 | BILLING-01 | — | First match run (no row) creates row and succeeds | unit | `cd apps/worker && npx vitest run --reporter=verbose billing.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-04 | 01 | 1 | BILLING-02 | — | GET /api/usage returns { count, limit, plan } | unit | `cd apps/worker && npx vitest run --reporter=verbose billing.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-05 | 01 | 1 | BILLING-03 | — | 429 from POST /match causes modal to display | manual | — | ❌ W0 (UI only) | ⬜ pending |
| 5-01-06 | 01 | 1 | BILLING-04 | — | POST /api/billing/create-checkout returns { url } | unit | `cd apps/worker && npx vitest run --reporter=verbose billing.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-07 | 01 | 2 | BILLING-04 | T-5-02 | Webhook: checkout.session.completed → plan=paid | unit | `cd apps/worker && npx vitest run --reporter=verbose webhook.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-08 | 01 | 2 | BILLING-04 | T-5-02 | Webhook: customer.subscription.deleted → plan=free | unit | `cd apps/worker && npx vitest run --reporter=verbose webhook.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-09 | 01 | 2 | BILLING-04 | T-5-03 | Webhook: invalid signature → 400 | unit | `cd apps/worker && npx vitest run --reporter=verbose webhook.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/__tests__/billing.test.ts` — stubs for BILLING-01, BILLING-02, BILLING-04 (create-checkout)
- [ ] `apps/worker/src/__tests__/webhook.test.ts` — stubs for BILLING-04 (webhook event handling + signature verification)
- [ ] `cd apps/worker && npm install stripe` — install Stripe SDK v22
- [ ] Stripe Dashboard manual setup: create product + recurring price (test mode), record `STRIPE_PRICE_ID`
- [ ] `wrangler secret put STRIPE_SECRET_KEY` — set in Worker secrets
- [ ] `wrangler secret put STRIPE_WEBHOOK_SECRET` — set in Worker secrets
- [ ] `wrangler secret put STRIPE_PRICE_ID` — set in Worker secrets

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgrade modal displays when POST /match returns 429 | BILLING-03 | Frontend UI behavior requires visual inspection | Exhaust free tier limit, attempt match run, verify modal appears with upgrade CTA |
| Stripe Checkout redirect navigates to Stripe-hosted page | BILLING-03 | Requires live Stripe test mode; no unit test can cover full redirect | Click upgrade CTA, verify redirect to `checkout.stripe.com` in test mode |
| Successful payment activates paid plan | BILLING-04 | Requires Stripe test mode card (4242...) and live webhook delivery | Complete test checkout, verify plan updates to `paid` in database and UI |
| Subscription cancellation reverts to free tier | BILLING-04 | Requires Stripe Dashboard cancellation and webhook delivery | Cancel subscription in Stripe Dashboard (test), verify plan reverts to `free` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
