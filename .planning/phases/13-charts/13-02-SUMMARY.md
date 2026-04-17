---
phase: 13-charts
plan: "02"
subsystem: frontend-visualisation
tags: [recharts, bar-chart, kpi-card, match-page, viz-02, viz-03]
dependency_graph:
  requires:
    - "Phase 13 Plan 01: recharts 3.8.1 installed, DeadStockChart pattern established"
    - "Phase 12: useMatchRun hook + useDeadStockSummary hook"
  provides:
    - "PostMatchChart component (grouped bar chart Before/After + Net Units Recovered KPI card)"
    - "MatchPage with PostMatchChart mounted below results table, gated on hasRun"
  affects:
    - "apps/web/src/pages/MatchPage.tsx"
tech_stack:
  added: []
  patterns:
    - "outgoingByStore Map for per-source-store transfer aggregation"
    - "Math.max(0, before - outgoing) clamp to prevent negative After values"
    - "results.reduce for net units recovered KPI"
    - "hasRun && results.length > 0 gate for chart visibility"
    - "summaryLoading spinner fallback before chart renders"
key_files:
  created:
    - "apps/web/src/components/PostMatchChart.tsx"
  modified:
    - "apps/web/src/pages/MatchPage.tsx"
decisions:
  - "Per D-03: stores appearing as both source and destination are treated as source only — outgoingByStore Map only reads r.sourceStore"
  - "Per D-14: useDeadStockSummary called on mount only — no refetch on match completion (summary is pre-match data for Before bars)"
  - "chartData.length === 0 edge case: KPI card still renders (netUnitsRecovered can be > 0 from destination matches); bar chart section conditionally absent"
  - "Build failure (@rollup/rollup-win32-x64-msvc missing) is pre-existing Windows npm optional-dep bug — not caused by plan changes; tsc --noEmit passes cleanly"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 2
---

# Phase 13 Plan 02: PostMatchChart Grouped Bar Chart + KPI Card (VIZ-02, VIZ-03) Summary

**One-liner:** Recharts grouped BarChart on MatchPage showing Before (amber) / After (teal) dead stock units per source store with a Net Units Recovered KPI card, gated on hasRun.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build PostMatchChart.tsx with grouped bar chart and KPI card | 90ac728 | apps/web/src/components/PostMatchChart.tsx |
| 2 | Mount PostMatchChart on MatchPage gated by hasRun | 06fc747 | apps/web/src/pages/MatchPage.tsx |

## What Was Built

**PostMatchChart component** (`apps/web/src/components/PostMatchChart.tsx`):
- Grouped BarChart with Before bar (amber `#D97706`) and After bar (teal `#0F766E`) per source store
- Source-store-only filtering: `outgoingByStore` Map built from `results[].sourceStore` — destination-only stores excluded (D-01)
- Per-source aggregation: sums `bestMatch.qtyToTransfer` across all results for the same sourceStore (D-02)
- D-03: stores that appear as both source and destination are treated as source only
- D-04 clamp: `Math.max(0, s.totalUnits - outgoing)` ensures After bar never goes negative
- D-05 KPI card: `results.reduce((sum, r) => sum + r.bestMatch.qtyToTransfer, 0)` sums across ALL match results
- Net Units Recovered KPI card rendered above chart with teal typography, Space Grotesk font
- Chart subtitle: "Projected if all transfers complete"
- `isAnimationActive={false}` on both Bar components
- `min-h-[300px]` wrapper div (ResponsiveContainer height floor, Pitfall 6)
- CSS variables on all non-SVG elements for full dark mode compatibility
- Edge case: when `chartData.length === 0` (no source stores), only KPI card renders

**MatchPage modifications** (`apps/web/src/pages/MatchPage.tsx`):
- Added `import { useDeadStockSummary }` from hooks
- Added `import { PostMatchChart }` from components
- Added `const { summary, loading: summaryLoading } = useDeadStockSummary()` hook call (per D-14: mount-only, no refetch)
- PostMatchChart section added after results table div, before upgrade modal overlay
- Gated: `{hasRun && results.length > 0 && (...)}` (D-06: no empty chart before first run)
- Loading fallback: Loader2 spinner (already imported) while `summaryLoading` is true
- Section heading: "Transfer Impact" with Space Grotesk font

## Verification

- `npx tsc --noEmit` exits 0 (TypeScript compiles cleanly — no type errors)
- `npm run build` fails with pre-existing Windows platform issue (`@rollup/rollup-win32-x64-msvc` missing — npm optional dep bug, not caused by plan changes)
- All acceptance criteria strings verified present in modified files via grep

## Deviations from Plan

None — plan executed exactly as written.

The plan's aggregation logic (D-01 through D-05), CSS patterns from Plan 01, and MatchPage integration structure were all followed precisely.

## Known Stubs

None. PostMatchChart is fully wired to:
- `results` from `useMatchRun` (live match run data)
- `summary` from `useDeadStockSummary` (live `/api/dead-stock-summary` endpoint data)

No placeholder data, no hardcoded values.

## Threat Flags

None. PostMatchChart is a pure presentational component receiving already-authenticated data from both hooks. No new trust boundaries, no user input, no data mutation. Per threat register T-13-02: all data is the user's own org data already fetched via authenticated API.

## Self-Check: PASSED

Files created/modified:
- FOUND: apps/web/src/components/PostMatchChart.tsx
- FOUND: apps/web/src/pages/MatchPage.tsx (modified)

Commits verified:
- FOUND: 90ac728 — feat(13-02): build PostMatchChart grouped bar chart and KPI card
- FOUND: 06fc747 — feat(13-02): mount PostMatchChart on MatchPage gated by hasRun
