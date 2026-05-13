---
phase: 11
slug: schema-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via `@cloudflare/vitest-pool-workers`) |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npm test` |
| **Full suite command** | `cd apps/worker && npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npm test`
- **After every plan wave:** Run `cd apps/worker && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | (schema prereq) | — | Migration SQL uses `IF NOT EXISTS`; no data loss | manual | `\d dead_stock` in psql/NEON console | N/A | ⬜ pending |
| 11-01-02 | 01 | 1 | (schema prereq) | — | `plan_tier NOT NULL DEFAULT 'free'` avoids null constraint errors | manual | `\d subscriptions` in psql/NEON console | N/A | ⬜ pending |
| 11-01-03 | 01 | 1 | (schema prereq) | — | No paid rows remain at `plan_tier = 'free'` | manual | `SELECT status, plan_tier FROM subscriptions` | N/A | ⬜ pending |
| 11-01-04 | 01 | 1 | (schema prereq) | — | schema.sql matches live NEON | manual | visual diff / grep | ✅ | ⬜ pending |
| 11-01-05 | 01 | 1 | (schema prereq) | — | Placeholder values only in `.dev.vars.example` (no real price IDs) | automated | `grep STRIPE_PRICE_ID_PRO apps/worker/.dev.vars.example` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or framework installs needed — Phase 11 has no application code changes, only DDL and file edits.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `cost_ex DOUBLE PRECISION` on `dead_stock` | Schema prereq for Phase 12 | Column existence is a live-DB state, not testable in vitest mocks | Run `\d dead_stock` in NEON SQL console or psql; confirm `cost_ex` row shows `double precision` type |
| `plan_tier TEXT NOT NULL DEFAULT 'free'` on `subscriptions` | Schema prereq for Phase 15 | Same — live DB state | Run `\d subscriptions`; confirm `plan_tier` row shows `text`, `not null`, default `'free'` |
| `stripe_price_id TEXT` (nullable) on `subscriptions` | Schema prereq for Phase 15 | Live DB state | Run `\d subscriptions`; confirm `stripe_price_id` row shows `text`, nullable |
| No `status='paid'` rows with `plan_tier='free'` | Data migration correctness | Live DB state | Run `SELECT status, plan_tier FROM subscriptions`; confirm no rows with `status='paid'` AND `plan_tier='free'` |
| schema.sql matches live NEON | Onboarding correctness | Requires comparing file to live DB | Read `apps/worker/src/db/schema.sql`; confirm `dead_stock` has `cost_ex` column and `subscriptions` has `plan_tier` and `stripe_price_id` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
