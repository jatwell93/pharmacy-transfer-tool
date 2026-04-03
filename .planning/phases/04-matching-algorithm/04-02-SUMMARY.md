---
phase: 04-matching-algorithm
plan: 02
subsystem: ui
tags: [react, typescript, virtualized-table, match-page, hono, clerk]

requires:
  - phase: 04-matching-algorithm/04-01
    provides: POST /api/match endpoint returning MatchResult[] and DataQualityWarning[]
  - phase: 03-file-upload-pipeline
    provides: useFetch hook, AppShell layout, UploadPage pattern reference
provides:
  - Match page at /match with months-cover control bar (number input + 1/2/3/6/12 presets)
  - Virtualized expandable-row results table (8 columns)
  - Amber warning banner (collapsible) and teal confirmation banner after match run
  - useMatchRun hook managing POST /api/match state
  - /match route wired in App.tsx with ProtectedRoute requireOrg=true
  - Match nav item enabled in AppShell sidebar
affects: [05-billing, 06-polish]

tech-stack:
  added: []
  patterns:
    - Custom virtualized table with flat-items array and absolute positioning (no library)
    - useMatchRun hook pattern: useFetch + useState + useCallback, exports MatchResult/DestinationMatch/DataQualityWarning types
    - hasRun gate pattern for conditional banner display (D-13)
    - Expandable rows via Set<string> keyed by sku::sourceStore composite key

key-files:
  created:
    - apps/web/src/hooks/useMatchRun.ts
    - apps/web/src/pages/MatchPage.tsx
  modified:
    - apps/web/src/App.tsx
    - apps/web/src/components/AppShell.tsx

key-decisions:
  - "overflowY via inline style (not Tailwind class) to combine with calc() maxHeight in same style block"
  - "Flat items array approach for virtualization — each item carries pre-computed top/height offsets"
  - "Sub-rows show greyed SKU/Description/SourceStore (lighter text) per D-09 discretion note"
  - "allMatches.slice(1) in expanded rows — index 0 is bestMatch already shown in parent row"

requirements-completed: [RESULTS-01]

duration: 4min
completed: "2026-04-03"
---

# Phase 04 Plan 02: Match Page UI Summary

**Match page with months-cover control bar, Run Match trigger, virtualized expandable-row results table (8 columns), and amber/teal data quality banners connected to POST /api/match**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-03T13:17:20Z
- **Completed:** 2026-04-03T13:21:27Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify — awaiting user)
- **Files modified:** 4

## Accomplishments

- Created `useMatchRun.ts` hook that calls POST /api/match with monthsCoverTarget, manages loading/error/results/warnings/hasRun state, and exports MatchResult/DestinationMatch/DataQualityWarning interfaces
- Created `MatchPage.tsx` with: horizontal control bar (months-cover label + number input + 1/2/3/6/12 preset buttons + Run Match button), virtualized expandable-row results table with 8 columns, amber collapsible warning banner, teal confirmation banner, error banner with Try Again CTA
- Wired `/match` route in App.tsx wrapped in `ProtectedRoute requireOrg={true}` alongside existing routes
- Enabled Match NavItem in AppShell.tsx: `disabled={false}` with `href="/match"`

## Task Commits

1. **Task 1: Create useMatchRun hook and MatchPage** - `2f786b0` (feat)
2. **Task 2: Wire routing and enable Match nav item** - `f633d9b` (feat)
3. **Task 3: Verify Match page end-to-end** - PENDING (checkpoint:human-verify)

## Files Created/Modified

- `apps/web/src/hooks/useMatchRun.ts` — Custom hook for POST /api/match call and state management; exports MatchResult, DestinationMatch, DataQualityWarning interfaces
- `apps/web/src/pages/MatchPage.tsx` — Complete Match page with control bar, virtualized results table, and data quality banners
- `apps/web/src/App.tsx` — Added MatchPage import and /match Route inside ProtectedRoute
- `apps/web/src/components/AppShell.tsx` — Enabled Match NavItem (disabled={false}, href="/match")

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `overflowY: 'auto'` via inline style | Needed to combine with `maxHeight: 'calc(100vh - 300px)'` in the same JSX style block |
| Flat items array for virtualization | Pre-computed top/height offsets per item enables O(1) position lookup without library dependency |
| `allMatches.slice(1)` for sub-rows | Index 0 is bestMatch already rendered in the parent collapsed row; sub-rows show alternatives only |
| greyed sub-row SKU/Description/SourceStore | Per D-09 discretion note — `text-[#94A3B8]` for repeated parent fields in expanded rows |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Match page is ready for user verification (Task 3 checkpoint)
- After approval: Phase 5 (billing) and Phase 6 (polish/export) can proceed
- No blockers from this plan's implementation

## Known Stubs

None — MatchPage fetches real data from the POST /api/match endpoint built in Plan 01. No hardcoded or placeholder values flow to the UI.

## Self-Check: PASSED

- `apps/web/src/hooks/useMatchRun.ts` — FOUND
- `apps/web/src/pages/MatchPage.tsx` — FOUND
- `apps/web/src/App.tsx` — MODIFIED (contains import MatchPage and /match route)
- `apps/web/src/components/AppShell.tsx` — MODIFIED (Match nav item disabled={false})
- Task 1 commit `2f786b0` — FOUND
- Task 2 commit `f633d9b` — FOUND
- `npx tsc --noEmit` — exit 0

---
*Phase: 04-matching-algorithm*
*Completed: 2026-04-03 (partial — awaiting Task 3 human-verify checkpoint)*
