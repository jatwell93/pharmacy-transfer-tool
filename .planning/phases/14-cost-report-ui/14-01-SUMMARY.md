---
phase: 14-cost-report-ui
plan: "01"
subsystem: web-frontend + worker-backend
tags: [cost-report, dead-stock, match, tdd, react, typescript]
dependency_graph:
  requires:
    - Phase 12: cost_ex column present in dead_stock table (cost-column-parser-summary-endpoint)
    - Phase 13: PostMatchChart section exists on MatchPage (insertion point)
  provides:
    - CostReport.tsx component with per-store cost cards, SOH input, progress bar, recoverable KPI
    - match.ts reads cost_ex from dead_stock and delivers it as MatchResult.cost
  affects:
    - apps/web/src/pages/MatchPage.tsx (new CostReport section below PostMatchChart)
    - apps/worker/src/routes/match.ts (dead_stock SELECT and items.push)
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN) for backend cost_ex plumbing
    - Prop-driven component (no internal hook calls in CostReport)
    - isFinite guard for division-by-zero prevention on SOH input
    - Nullish coalesce (cost_ex ?? 0) for null DB values
key_files:
  created:
    - apps/web/src/components/CostReport.tsx
  modified:
    - apps/worker/src/routes/match.ts
    - apps/worker/src/__tests__/match.test.ts
    - apps/web/src/pages/MatchPage.tsx
decisions:
  - CostReport receives all data as props — no internal hook calls — keeps it testable and avoids duplicate API requests
  - isFinite(sohValue) && sohValue > 0 guard makes Infinity% and NaN% structurally impossible
  - recoverableValue > 0 gate ensures $0.00 Recoverable Value KPI is never shown
  - Only stores with hasCostData=true rendered in store cards — stores without cost data excluded from grid
metrics:
  duration_minutes: 35
  completed_date: "2026-04-19"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 4
---

# Phase 14 Plan 01: CostReport UI and match.ts cost_ex fix Summary

**One-liner:** Dead stock dollar value panel with per-store cost cards, SOH % bar with amber/red thresholds, and post-match recoverable value KPI — backed by match.ts now reading real cost_ex from DB instead of hardcoded 0.

## What Was Built

### Task 1 — match.ts cost_ex plumbing (TDD)

- Added `cost_ex: number | null` to the `withOrgContext<Array<{...}>>` type annotation for the dead_stock query
- Added `ds.cost_ex` to the SELECT SQL template literal
- Replaced `cost: 0` with `cost: row.cost_ex ?? 0` in the `items.push()` call inside the store grouping loop
- Removed stale comment "dead_stock table has no cost column (display-only per ALGORITHM-SPEC Section 5)"
- Added 2 TDD unit tests: one asserts cost_ex: 5.99 flows through to MatchResult.cost; one asserts cost_ex: null coalesces to 0
- Full worker suite: 10/10 tests in match.test.ts, 109/109 across 9 test files

**Commit:** d464dc3

### Task 2 — CostReport.tsx component and MatchPage mount

- Created `apps/web/src/components/CostReport.tsx` (197 lines):
  - No-cost-data state: instructional message referencing FRED Stock Valuation report format
  - Partial coverage note: "{X} of {Y} stores have cost data" when only a subset of stores have cost_ex data
  - Per-store dead stock dollar cards: one card per store with hasCostData=true, shows `formatAUD(s.totalValue)`
  - SOH input: labelled number input, placeholder "e.g. 500000", clears to show placeholder text
  - Progress bar: teal below 10%, amber 10–25%, red above 25%; threshold marker lines at exactly 10% and 25%
  - Division-by-zero guard: `isFinite(sohValue) && sohValue > 0` — bar hidden when input is 0, blank, or negative
  - Recoverable Value KPI: appears only when `hasRun && hasCostData && recoverableValue > 0`
- Updated `apps/web/src/pages/MatchPage.tsx`:
  - Added `import { CostReport } from '../components/CostReport'`
  - Inserted `<section>` with "Dead Stock Value" heading, summaryLoading spinner guard, and `<CostReport>` mount below PostMatchChart section (always visible — not gated on hasRun)
- TypeScript: `npx tsc --noEmit` exits 0

**Commit:** 3344564

## Deviations from Plan

None — plan executed exactly as written.

The worktree path discovery (worktree files in `.claude/worktrees/agent-a95c556a/apps/` vs main repo at `apps/`) required applying edits twice initially (to main repo first, then corrected to worktree path). No plan deviation — this is a worktree execution environment detail.

## Task 3 Status

Task 3 is `type="checkpoint:human-verify"` — paused for human UAT. See checkpoint details below.

## Known Stubs

None. All data flows through real props:
- `stores` prop: real `StoreSummary[]` from `useDeadStockSummary` hook (via `summary?.stores ?? []`)
- `results` prop: real `MatchResult[]` from `useMatchRun`
- `cost` on each `MatchResult`: now reads real `cost_ex` from NEON dead_stock table (Task 1 fix)

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. The SOH input is client-side only (never sent to Worker). T-14-01 mitigation (isFinite guard) is applied as specified in the plan threat model.

## Self-Check: PASSED

- apps/web/src/components/CostReport.tsx: FOUND (197 lines)
- apps/web/src/pages/MatchPage.tsx: contains "CostReport" — FOUND
- apps/worker/src/routes/match.ts: contains "ds.cost_ex" — FOUND
- apps/worker/src/__tests__/match.test.ts: contains "cost_ex" — FOUND (6 occurrences)
- Commit d464dc3: FOUND
- Commit 3344564: FOUND
- TypeScript: npx tsc --noEmit exits 0 — PASSED
- Worker suite: 109 tests pass — PASSED
