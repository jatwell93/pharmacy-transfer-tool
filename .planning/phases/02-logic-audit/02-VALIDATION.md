---
phase: 2
slug: logic-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `apps/worker/vitest.config.ts` (exists — uses `cloudflarePool` API) |
| **Quick run command** | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` |
| **Full suite command** | `cd apps/worker && npm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts`
- **After every plan wave:** Run `cd apps/worker && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | AUDIT-01 | manual | N/A — doc review | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | AUDIT-01 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | AUDIT-02, MATCH-02 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | AUDIT-02, MATCH-03, MATCH-04 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | AUDIT-02, MATCH-05 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-04 | 02 | 2 | AUDIT-02, MATCH-06 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-05 | 02 | 2 | AUDIT-02, MATCH-07 | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/matcher.ts` — stub with exported types and empty function body
- [ ] `apps/worker/src/__tests__/matcher.test.ts` — stub with all `describe`/`it` blocks (failing)
- [ ] `apps/worker/src/ALGORITHM-SPEC.md` — algorithm reference document

*No framework installation required — Vitest infrastructure is fully configured from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ALGORITHM-SPEC.md covers all 5 sections with worked numeric examples | AUDIT-01 | Document quality review; not automatable by grep alone | Read `apps/worker/src/ALGORITHM-SPEC.md` — verify sections: sell-through filter, months-cover cap, ranged sort, is_ranged parsing, NaN/missing-value edge cases. Each must have a worked example with concrete numbers and a "Django behavior / TypeScript behavior" note. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
