---
phase: 13
slug: charts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose 2>&1 \| head -60` |
| **Full suite command** | `cd apps/web && npx vitest run 2>&1` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx vitest run --reporter=verbose 2>&1 | head -60`
- **After every plan wave:** Run `cd apps/web && npx vitest run 2>&1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 0 | VIZ-01 | — | N/A | unit | `cd apps/web && npx vitest run src/components/charts/ 2>&1` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | VIZ-01 | — | N/A | unit | `cd apps/web && npx vitest run src/components/charts/DeadStockChart 2>&1` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | VIZ-01 | — | N/A | integration | `cd apps/web && npx vitest run src/pages/UploadPage 2>&1` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | VIZ-02 | — | N/A | unit | `cd apps/web && npx vitest run src/components/charts/PostMatchChart 2>&1` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | VIZ-03 | — | N/A | unit | `cd apps/web && npx vitest run src/components/charts/KpiCard 2>&1` | ❌ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | VIZ-02 | — | N/A | integration | `cd apps/web && npx vitest run src/pages/MatchPage 2>&1` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/components/charts/__tests__/DeadStockChart.test.tsx` — stubs for VIZ-01 (pie chart renders, empty state, dark mode)
- [ ] `apps/web/src/components/charts/__tests__/PostMatchChart.test.tsx` — stubs for VIZ-02 (bar chart renders, before/after aggregation logic)
- [ ] `apps/web/src/components/charts/__tests__/KpiCard.test.tsx` — stubs for VIZ-03 (KPI card renders net units recovered)

*No new test framework install required — vitest is already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pie chart slices use PharmIQ teal/amber palette (visual) | VIZ-01 | SVG color hex values require visual inspection | Open UploadPage after upload, inspect pie slices are teal/amber |
| Both charts render correctly in dark mode | VIZ-01, VIZ-02 | Requires browser dark mode toggle, CSS variable rendering | Toggle dark mode in browser; confirm chart text/bg tokens render; SVG fills stay hex |
| Re-upload clears and redraws pie chart without page reload | VIZ-01 | Requires real browser interaction with file upload | Upload first file, see pie, upload second file, confirm pie updates in-place |
| "Projected if all transfers complete" label is visible | VIZ-02 | UI text inspection | Run a match on MatchPage; confirm subtitle text appears below/above bar chart |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
