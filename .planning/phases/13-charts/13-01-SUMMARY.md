---
phase: 13-charts
plan: "01"
subsystem: frontend-visualisation
tags: [recharts, pie-chart, dead-stock, upload-page, viz-01]
dependency_graph:
  requires:
    - "Phase 12: useDeadStockSummary hook + /api/dead-stock-summary endpoint"
  provides:
    - "DeadStockChart component (pie chart of dead stock units per store)"
    - "UploadPage with live chart refresh on upload completion"
  affects:
    - "apps/web/src/pages/UploadPage.tsx"
tech_stack:
  added:
    - "recharts 3.8.1 (pie chart rendering)"
  patterns:
    - "Named export functional component with hex colour palette"
    - "Custom tooltip via content prop (CSS-variable compatible for dark mode)"
    - "External SVG text labels via renderLabel function"
    - "Three-state chart section: loading spinner / pie chart / empty state"
key_files:
  created:
    - "apps/web/src/components/DeadStockChart.tsx"
  modified:
    - "apps/web/package.json"
    - "apps/web/package-lock.json"
    - "apps/web/src/pages/UploadPage.tsx"
decisions:
  - "No react-is override needed — TypeScript compiled cleanly without it after recharts 3.8.1 install"
  - "Custom tooltip component used instead of Tooltip formatter prop — enables full dark-mode CSS variable support on background and border"
  - "DeadStockChart returns null when all stores have totalUnits=0 — empty state rendered by UploadPage to keep single source of truth (D-10)"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-17"
  tasks_completed: 3
  files_changed: 4
---

# Phase 13 Plan 01: Dead Stock Pie Chart (VIZ-01) Summary

**One-liner:** Recharts 3.8.1 PieChart on UploadPage showing dead stock units per store with PharmIQ brand hex colours, external SVG labels, dark-mode tooltip, and live refetch after upload.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install recharts 3.8.1 in apps/web | 9162388 | apps/web/package.json, apps/web/package-lock.json |
| 2 | Build DeadStockChart.tsx pie chart component | 57b67f9 | apps/web/src/components/DeadStockChart.tsx |
| 3 | Mount DeadStockChart on UploadPage with summary refetch | 96ab2e3 | apps/web/src/pages/UploadPage.tsx |

## What Was Built

**DeadStockChart component** (`apps/web/src/components/DeadStockChart.tsx`):
- PieChart with 5-colour PharmIQ brand palette: `#0F766E` (teal), `#D97706` (amber), `#14B8A6` (teal-light), `#B45309` (amber-dark), `#0D5D5A` (teal-darker)
- Colours cycle for N > 5 stores via `index % CHART_COLOURS.length`
- External SVG text labels showing `StoreName: unitCount` positioned at `outerRadius + 30px`
- Store names > 20 chars truncated with ellipsis
- Custom tooltip with store name, unit count, and percentage of total — styled with CSS variables for full dark mode compatibility
- `isAnimationActive={false}` to prevent animation on re-render
- `outerRadius={100}` within 300px height to prevent label clipping
- `min-h-[300px]` wrapper div (ResponsiveContainer height floor per Pitfall 6)
- `style={{ overflow: 'visible' }}` on PieChart to allow external labels to render outside container bounds
- Returns `null` when all stores have `totalUnits === 0` (empty state handled by UploadPage)

**UploadPage modifications** (`apps/web/src/pages/UploadPage.tsx`):
- Added `useDeadStockSummary` hook call — independent from `useStores`
- Added `handleUploadComplete` function calling both `refresh()` (store cards) and `summaryRefetch()` (chart data)
- Chart section always rendered (D-09) with heading "Dead Stock by Store"
- Three states: loading spinner (Loader2), pie chart (when any store has totalUnits > 0), empty state message

## Verification

- `npx tsc --noEmit` exits 0 (clean — no react-is override needed)
- `npm run build` exits 0 (Vite production build succeeds, 2493 modules transformed)
- Build output: recharts bundled into 722 kB main chunk (expected — large-chunk warning is pre-existing from @react-pdf/renderer)

## Deviations from Plan

None — plan executed exactly as written.

The plan's research note "only add react-is override if needed" was validated: TypeScript compiled cleanly without the override after recharts 3.8.1 install.

## Known Stubs

None. DeadStockChart is fully wired to `useDeadStockSummary` which fetches live data from `/api/dead-stock-summary`. No placeholder data, no hardcoded values.

## Threat Flags

None. DeadStockChart is a pure presentational component receiving already-authenticated data from the `useDeadStockSummary` hook (fetches from `/api/dead-stock-summary` protected by Clerk middleware). No new trust boundaries, no user input, no data mutation.

## Self-Check: PASSED

Files created/modified:
- FOUND: apps/web/src/components/DeadStockChart.tsx
- FOUND: apps/web/src/pages/UploadPage.tsx (modified)
- FOUND: apps/web/package.json (modified — recharts: ^3.8.1)

Commits verified:
- FOUND: 9162388 — chore(13-01): install recharts 3.8.1 in apps/web
- FOUND: 57b67f9 — feat(13-01): build DeadStockChart pie chart component
- FOUND: 96ab2e3 — feat(13-01): mount DeadStockChart on UploadPage with summary refetch
