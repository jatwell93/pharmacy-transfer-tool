---
phase: 3
slug: file-upload-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) + Wrangler test (Worker) |
| **Config file** | `dead-stock-tranfer-app/vite.config.ts` / `wrangler.jsonc` |
| **Quick run command** | `cd dead-stock-tranfer-app && npm test -- --run` |
| **Full suite command** | `cd dead-stock-tranfer-app && npm test -- --run && cd ../worker && npx wrangler dev --test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd dead-stock-tranfer-app && npm test -- --run`
- **After every plan wave:** Run full suite command above
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | UPLOAD-01 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | UPLOAD-01 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | UPLOAD-02 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | UPLOAD-03 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | UPLOAD-04 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | UPLOAD-05 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | UPLOAD-06 | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | UPLOAD-05 | manual | See manual section | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `dead-stock-tranfer-app/src/__tests__/upload.test.ts` — stubs for UPLOAD-01, UPLOAD-02
- [ ] `dead-stock-tranfer-app/src/__tests__/csvParser.test.ts` — stubs for UPLOAD-05 (BOM/CRLF/blank-row parsing)
- [ ] `dead-stock-tranfer-app/src/__tests__/xlsxParser.test.ts` — stubs for UPLOAD-06 (SheetJS parsing, 5 MB rejection)
- [ ] `dead-stock-tranfer-app/src/__tests__/storeList.test.ts` — stubs for UPLOAD-03, UPLOAD-04 (persist & replace)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upload UI shows correct store name after upload | UPLOAD-01 | Visual DOM check required | Upload a sample ROU CSV → confirm store card appears with correct name and timestamp |
| Replace single store without affecting others | UPLOAD-04 | Multi-store state requires browser session | Upload stores A+B, replace A, verify B data unchanged |
| BOM/CRLF files parse without preprocessing | UPLOAD-05 | Real FRED export files needed for full coverage | Upload sample BOM + CRLF files provided in `sample-data/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
