---
phase: 16
slug: department-ranged-column-parsing
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-13
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.2 + @cloudflare/vitest-pool-workers ^0.13.5 |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` |
| **Full suite command** | `cd apps/worker && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run src/__tests__/parser.test.ts`
- **After every plan wave:** Run `cd apps/worker && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | TABLE-01 | — | Department alias not exploitable — UNNEST typed array prevents injection | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | ✅ existing | ⬜ pending |
| 16-01-02 | 01 | 1 | TABLE-01 | — | N/A | unit+compile | `cd apps/worker && npx tsc --noEmit && npx vitest run src/__tests__/parser.test.ts` | ✅ existing | ⬜ pending |
| 16-01-03 | 01 | 1 | TABLE-01, TABLE-02 | — | null→"" coercion prevents null render in JSX | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | ✅ existing | ⬜ pending |
| 16-01-04 | 01 | 1 | TABLE-01, TABLE-02 | — | N/A (schema only) | manual | Run `ALTER TABLE` in NEON SQL editor as neondb_owner | N/A | ⬜ pending |
| 16-01-05 | 01 | 2 | TABLE-01, TABLE-02 | — | UNNEST typed array prevents injection | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | ✅ existing | ⬜ pending |
| 16-01-06 | 01 | 2 | TABLE-02 | — | null→"" coercion in DeadStockItem mapping | manual | Run Match in UI and verify Ranged column | N/A | ⬜ pending |
| 16-01-07 | 01 | 2 | TABLE-01, TABLE-02 | — | N/A | manual | Run Match in UI and verify Department + Ranged columns | N/A | ⬜ pending |
| 16-02-01 | 02 | 1 | TABLE-01, TABLE-02 | — | N/A (types only) | compile+unit | `cd apps/web && npx tsc --noEmit && cd apps/worker && npx vitest run` | ✅ existing (TS compile) | ⬜ pending |
| 16-02-02 | 02 | 1 | TABLE-01, TABLE-02 | — | N/A | compile+unit | `cd apps/web && npx tsc --noEmit && cd apps/worker && npx vitest run` | ✅ existing (TS compile) | ⬜ pending |
| 16-02-03 | 02 | 2 | D-13 | — | N/A | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | ✅ existing file, new describe block | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. New tests are additive describe blocks in the existing `parser.test.ts` file — no new files, no new fixtures, no framework installation needed.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ranged column in match results shows ✓/— | TABLE-02 | Match route E2E requires live NEON connection; vitest cannot stub it | 1. Upload a dead stock file with is_ranged values, 2. Run Match, 3. Verify Ranged column shows ✓ or — for each row |
| Department column in match results shows correct value | TABLE-01 | Same — live NEON required for E2E | 1. Upload dead stock file with Department column, 2. Run Match, 3. Verify Department cell shows correct dept per row |
| Missing Department column → blank not error | Success criterion 3 | File upload E2E requires live Worker | Upload a dead stock file without a Department column; upload must succeed and department cells must be blank |
| NEON schema migration | D-11 | ALTER TABLE requires neondb_owner access in NEON SQL editor | Run: `ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;` as neondb_owner before deploying |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
