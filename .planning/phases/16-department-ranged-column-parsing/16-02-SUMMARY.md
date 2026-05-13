---
phase: 16-department-ranged-column-parsing
plan: 02
subsystem: ui
tags: [typescript, react, vitest, tailwind, match-table]

# Dependency graph
requires:
  - phase: 16-01
    provides: MatchResult.isRanged and MatchResult.department from the backend API; parseDeadStockFile department extraction with HEADER_ALIASES

provides:
  - MatchResult interface mirror in useMatchRun.ts with isRanged: boolean and department: string fields
  - MatchPage.tsx 11-column table with Department and Ranged columns between Description and Source Store
  - Department and Ranged cell rendering in main result rows (result.department, Unicode check/dash ternary)
  - Empty Department and Ranged cells in sub-match rows per D-07

affects:
  - 17-table-filters: Department filter and Ranged filter in Phase 17 can use MatchResult.department and MatchResult.isRanged directly

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "11-column grid template: grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] — Ranged uses fixed 60px, Department uses 1fr flex"
    - "Ranged cell rendering: result.isRanged ? '\\u2713' : '\\u2014' — literal Unicode, no icon library, no pill"
    - "Sub-match empty cells: self-closing <div /> with className only — no value text per D-07"

key-files:
  created: []
  modified:
    - apps/web/src/hooks/useMatchRun.ts
    - apps/web/src/pages/MatchPage.tsx

key-decisions:
  - "isRanged and department added as required (non-optional) fields on MatchResult — TypeScript enforces sync with backend matcher.ts (D-05)"
  - "Department column uses 1fr (flex, truncates with ellipsis); Ranged uses 60px fixed (single char) per D-09"
  - "Sub-match rows render empty self-closing divs for Department and Ranged — no values since these are per-item attributes not per-destination per D-07"
  - "Task 2 (parser tests) was pre-completed by Plan 01 TDD RED phase — tests already committed in a00cef0 with 8 test cases"

patterns-established:
  - "MatchResult type mirror pattern: useMatchRun.ts MatchResult must mirror apps/worker/src/matcher.ts MatchResult — update both when API shape changes"
  - "Grid template update pattern: MatchPage.tsx has exactly 3 occurrences of the grid-cols template — header div (no onClick), main result row div (has onClick), sub-match row div (no onClick); all 3 must be updated together"

requirements-completed: [TABLE-01, TABLE-02]

# Metrics
duration: 12min
completed: 2026-05-13
---

# Phase 16 Plan 02: Department + Ranged Column Parsing — Frontend Summary

**MatchResult type mirror updated with isRanged and department, MatchPage.tsx expanded to 11-column table rendering Department and Ranged per result row using Unicode check/dash glyphs**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-13T13:15:42Z
- **Completed:** 2026-05-13T13:28:02Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- `useMatchRun.ts` MatchResult interface now carries `isRanged: boolean` and `department: string` — TypeScript enforces API shape sync with backend matcher.ts
- `MatchPage.tsx` table expanded from 9 to 11 columns: Department (1fr flex with truncate) and Ranged (60px fixed, Unicode ✓/— glyph) inserted between Description and Source Store
- All 3 grid template classNames updated to `grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]`; zero occurrences of old 9-column template
- Sub-match rows render empty self-closing divs for Department/Ranged per D-07 (these are item attributes, not destination attributes)
- 138 Worker tests + all TypeScript compile checks pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Update useMatchRun.ts MatchResult interface + MatchPage.tsx headers, grid template, and cell rendering** - `d0fdc8d` (feat)
2. **Task 2: Add department describe block to parser.test.ts** - `a00cef0` (pre-completed by Plan 01 TDD RED phase — commit from wave 1)

## Files Created/Modified

- `apps/web/src/hooks/useMatchRun.ts` — Added `isRanged: boolean` and `department: string` to MatchResult interface after sourceStore, before bestMatch
- `apps/web/src/pages/MatchPage.tsx` — Updated columnHeaders (8 → 10 elements), all 3 grid templates (9→11 columns), added Department+Ranged cells to main result rows and empty cells to sub-match rows

## Decisions Made

- isRanged and department are required (non-optional) fields on MatchResult — this matches the backend matcher.ts widening from Plan 01 and keeps TypeScript strict
- Unicode literals used directly in JSX ternary (`'\u2713'` and `'\u2014'`) — no icon library import, no colored background per D-06
- Empty sub-match cells rendered as self-closing divs `<div className="..." />` — produces an empty grid cell that occupies the correct column slot without any visible content per D-07

## Deviations from Plan

### Pre-completed Work

**Task 2 (parser tests) was already committed by Plan 01's TDD RED phase**
- **Found during:** Task 2 review
- **Issue:** `apps/worker/src/__tests__/parser.test.ts` already contained the full `"parseDeadStockFile department extraction"` describe block with 8 tests (7 required + 1 "Test 7 extended") committed in `a00cef0` as part of Plan 01's TDD RED/GREEN cycle
- **Action:** Verified all tests pass (35/35 including all 8 department extraction tests), confirmed the describe block is last in the file, confirmed zero regressions — no changes needed
- **Outcome:** Done criteria for Task 2 fully satisfied with no new commit required

---

**Total deviations:** 1 (pre-completion from Plan 01 — not a bug or error, just TDD overlap)
**Impact on plan:** No scope creep. Task 2 was satisfied by Plan 01's TDD work which covered the same test cases specified in this plan.

## Issues Encountered

None — both tasks executed cleanly with zero TypeScript errors and all 138 Worker tests passing.

## Known Stubs

None — all fields are wired end-to-end. result.department and result.isRanged are populated from the API response (backend Plan 01). The only case where department renders as blank is when the uploaded dead stock file lacked a Department column — this is correct behavior per D-02, not a stub.

## Threat Flags

No new security surfaces introduced beyond those in the plan's threat model (T-16-06 through T-16-09). result.department is rendered in a React JSX text node (automatic entity encoding), result.isRanged drives a ternary selecting between two source-code string literals — no user data influences the output character.

## Self-Check: PASSED

- `apps/web/src/hooks/useMatchRun.ts` — file confirmed present, contains `isRanged: boolean` and `department: string` in MatchResult interface
- `apps/web/src/pages/MatchPage.tsx` — file confirmed present, contains 'Department' and 'Ranged' in columnHeaders, 3x new 11-column grid template, result.department and isRanged ternary
- Commit `d0fdc8d` confirmed in git log (Task 1)
- 138 worker tests pass, 0 TypeScript errors

## Next Phase Readiness

- Full-stack pipeline is complete: Department and Ranged flow from FRED dead stock upload → parser → NEON DB → match API → MatchResult → MatchPage table
- Phase 17 (table filters) can add Department and Ranged filter controls directly against MatchResult.department and MatchResult.isRanged — the stable column definitions required by D-08/D-09 are now in place
- NEON migration still required before production deployment (documented in Plan 01 SUMMARY and upload.ts MIGRATION REQUIRED comment)

---
*Phase: 16-department-ranged-column-parsing*
*Completed: 2026-05-13*
