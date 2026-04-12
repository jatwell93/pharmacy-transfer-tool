---
phase: 9
slug: 09-docs-sync
status: partial
nyquist_compliant: partial
wave_0_complete: true
created: 2026-04-13
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (apps/worker) |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npx vitest run src/__tests__/webhook.test.ts` |
| **Full suite command** | `cd apps/worker && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run`
- **After every plan wave:** Run `cd apps/worker && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | RESULTS-02 | T-09-02 | PDF export code compiles without errors | smoke | `cd apps/web && npm run build` (exit 0, confirmed 2026-04-13) | N/A — build artefact | green |
| 09-01-02 | 01 | 1 | BILLING-01 | T-09-02 | Free-tier match run limit enforced in backend | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | billing.test.ts | green |
| 09-01-03 | 01 | 1 | BILLING-02 | T-09-02 | Stripe checkout session created for paid upgrade | unit | `cd apps/worker && npx vitest run src/__tests__/billing.test.ts` | billing.test.ts | green |
| 09-01-04 | 01 | 1 | BILLING-03 | — | Upgrade CTA redirects to Stripe checkout URL | manual | N/A — visual/redirect | N/A | manual-only |
| 09-01-05 | 01 | 1 | BILLING-04 | T-09-02 | Webhook reverts subscription to free on deletion | unit | `cd apps/worker && npx vitest run src/__tests__/webhook.test.ts` | webhook.test.ts | green |
| 09-01-06 | 01 | 1 | BRAND-01 | — | Brand colors and typography applied | manual | N/A — visual CSS | N/A | manual-only |
| 09-01-07 | 01 | 1 | BRAND-02 | — | Dark mode toggle persists preference | manual | N/A — UI state toggle | N/A | manual-only |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- `apps/worker/src/__tests__/billing.test.ts` — covers BILLING-01 (4 tests) and BILLING-02 (3 tests)
- `apps/worker/src/__tests__/webhook.test.ts` — covers BILLING-04 (5 tests, all passing after fix on 2026-04-13)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgrade CTA redirects to Stripe checkout URL | BILLING-03 | Visual/redirect — no DOM in worker tests | Click upgrade button in browser; verify redirect to `checkout.stripe.com` with correct price_id |
| Brand colors and typography applied correctly | BRAND-01 | Visual CSS — requires browser rendering | Load app in browser; verify PharmIQ brand palette (CSS variables `--color-primary` etc.) applied |
| Dark mode toggle persists on reload | BRAND-02 | UI state requiring `localStorage` and browser | Toggle dark mode; reload page; verify preference persisted |
| PDF export generates valid transfer report | RESULTS-02 | Requires browser + @react-pdf/renderer render pipeline | Click Export PDF on match results; verify PDF downloads with correct data. Build confirmed: `apps/web npm run build` exits 0 (confirmed 2026-04-13) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly marked manual-only
- [x] Sampling continuity: automated tests cover BILLING-01, BILLING-02, BILLING-04; no 3 consecutive tasks without automated verify
- [x] Wave 0: existing infrastructure covers all automated requirements
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` — partial: 4 automated (BILLING-01, BILLING-02, BILLING-04, RESULTS-02 build), 4 manual-only (BILLING-03, BRAND-01, BRAND-02, RESULTS-02 runtime)

**nyquist_compliant:** partial (4 automated, 4 manual-only)

**Approval:** approved 2026-04-13
