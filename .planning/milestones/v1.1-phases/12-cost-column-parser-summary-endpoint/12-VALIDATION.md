---
phase: 12
slug: cost-column-parser-summary-endpoint
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/worker/vitest.config.ts` / `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `npx vitest run 2>&1 | tail -30` (from repo root) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `npx vitest run 2>&1 | tail -30`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | COST-01 | — | N/A | unit | `cd apps/worker && npx vitest run src/lib/parser.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | COST-01 | — | cost_ex stored as-is, not inflated | unit | `cd apps/worker && npx vitest run src/lib/parser.test.ts` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | COST-01 | — | absent column → NULL, no upload error | unit | `cd apps/worker && npx vitest run src/lib/parser.test.ts` | ✅ | ⬜ pending |
| 12-01-04 | 01 | 1 | COST-01 | — | N/A | unit | `cd apps/worker && npx vitest run src/routes/upload.test.ts` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 0 | COST-02 | — | N/A | integration | `cd apps/worker && npx vitest run src/routes/dead-stock-summary.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | COST-02 | — | aggregates per org_id only | integration | `cd apps/worker && npx vitest run src/routes/dead-stock-summary.test.ts` | ✅ | ⬜ pending |
| 12-02-03 | 02 | 1 | COST-02 | — | zero totalValue when cost_ex all NULL | integration | `cd apps/worker && npx vitest run src/routes/dead-stock-summary.test.ts` | ✅ | ⬜ pending |
| 12-02-04 | 02 | 1 | COST-04 | — | N/A | unit | `cd apps/web && npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/lib/parser.test.ts` — add cost_ex extraction stubs (extend existing file)
- [ ] `apps/worker/src/routes/dead-stock-summary.test.ts` — new file, stubs for COST-02 aggregation

*Existing vitest infrastructure covers all other requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FRED Cost Ex header alias validated against real export | COST-01 | Requires live FRED export file | Upload actual FRED Stock Valuation file; verify cost_ex column parsed correctly |
| `SELECT cost_ex FROM dead_stock WHERE org_id = $1 LIMIT 5` returns non-null values | COST-01 | Requires NEON DB access | Run query in NEON console after upload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
