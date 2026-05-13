---
phase: 14
slug: cost-report-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 with @cloudflare/vitest-pool-workers 0.13.5 |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npm test -- --reporter=verbose src/__tests__/match.test.ts` |
| **Full suite command** | `cd apps/worker && npm test` |
| **Estimated runtime** | ~15 seconds (Worker unit tests only) |

Note: `apps/web` has no test framework — no Jest, Vitest, or Testing Library detected. UI behaviour is manual-only.

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npm test -- src/__tests__/match.test.ts`
- **After every plan wave:** Run `cd apps/worker && npm test`
- **Before `/gsd-verify-work`:** Full Worker suite must be green + manual UAT checklist complete
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | COST-05 (backend) | — | cost_ex read from org-isolated dead_stock table (RLS enforced) | unit | `cd apps/worker && npm test -- src/__tests__/match.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 14-01-02 | 01 | 1 | D-10 | — | SQL adds ds.cost_ex to SELECT; type annotation updated | unit | `cd apps/worker && npm test -- src/__tests__/match.test.ts` | ✅ (needs new cases) | ⬜ pending |
| 14-01-03 | 01 | 2 | COST-03 | — | SOH input uses isFinite + > 0 guard before division | manual UAT | Browser inspection | No web test framework | ⬜ pending |
| 14-01-04 | 01 | 2 | COST-03 | — | Amber/red/teal threshold logic correct | manual UAT | Browser inspection | No web test framework | ⬜ pending |
| 14-01-05 | 01 | 2 | COST-05 (UI) | — | Recoverable KPI shown only when hasRun && cost > 0 | manual UAT | Browser inspection | No web test framework | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/__tests__/match.test.ts` — add 2 new test cases:
  - Case A: dead stock row with `cost_ex` present (e.g. `cost_ex: 5.99`) → `MatchResult.cost` is `5.99`
  - Case B: dead stock row with `cost_ex: null` → `MatchResult.cost` is `0` (nullish coalesce)

*No new test files need to be created — existing `match.test.ts` infrastructure covers both cases.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SOH input empty → no percentage displayed | COST-03 / D-07 | No web test framework | Clear SOH input; verify percentage bar is hidden and placeholder shown |
| SOH = 0 → no percentage displayed | COST-03 / D-07 | No web test framework | Enter 0; verify bar hidden, no Infinity% or NaN% |
| Dead stock % 8% → teal bar | COST-03 / D-06 | No web test framework | Enter SOH that yields ~8% ratio; verify teal fill |
| Dead stock % 15% → amber bar | COST-03 / D-06 | No web test framework | Enter SOH that yields ~15% ratio; verify amber fill |
| Dead stock % 30% → red bar | COST-03 / D-06 | No web test framework | Enter SOH that yields ~30% ratio; verify red fill |
| No cost data → instructional message shown | D-02 | No web test framework | Upload dead stock without Cost Ex column; verify "Re-upload dead stock using FRED Stock Valuation report format to see dollar values." appears |
| Partial coverage note shown | Pitfall 2 | No web test framework | Upload stores with mixed cost data presence; verify "X of Y stores have cost data" note appears |
| Recoverable KPI shown after match run | COST-05 | No web test framework | Run a match with cost data present; verify "Recoverable value" KPI card appears |
| Recoverable KPI suppressed when cost = 0 | D-12 | No web test framework | Run match without cost data; verify KPI card absent (no $0.00 shown) |
| Pre-match vs post-match labels unambiguous | Pitfall (CONTEXT) | No web test framework | Verify both figures have distinct section labels |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
