---
phase: "17"
plan: "01"
subsystem: "web/MatchPage"
tags: [filters, useMemo, ui, react, phase-17]
dependency_graph:
  requires: []
  provides: [filter-strip-ui, filteredResults-memo]
  affects: [apps/web/src/pages/MatchPage.tsx]
tech_stack:
  added: []
  patterns: [useMemo-filter-chain, outside-click-useEffect, controlled-select, dept-multi-select-dropdown]
key_files:
  created: []
  modified:
    - apps/web/src/pages/MatchPage.tsx
decisions:
  - Filter logic uses AND-composition across all four filters in a single useMemo
  - filteredResults feeds flatItems (virtualization) but not PostMatchChart or CostReport (those use raw results)
  - Department dropdown uses outside-click via document mousedown listener with ref guard
  - minUnits filters on bestMatch.qtyToTransfer (primary match only)
  - storeFilter matches either sourceStore or bestMatch.store (inclusive)
metrics:
  duration: "3 minutes"
  completed: "2026-05-14"
  tasks_completed: 2
  files_modified: 1
---

# Phase 17 Plan 01: Filter Strip Summary

## One-liner
Four post-match result filters wired through a filteredResults useMemo feeding the virtualized table, with filter strip UI, empty state, and "Showing X of Y" counter.

## Status
Completed

## What was done
- Added 5 filter state variables: `rangedFilter`, `selectedDepts`, `deptDropdownOpen`, `storeFilter`, `minUnits`
- Added `deptDropdownRef` + outside-click useEffect to close the department dropdown on clicks outside
- Added 3 handlers: `handleClearFilters`, `handleMinUnitsChange`, `handleDeptToggle`
- Added `filteredResults` useMemo with AND-logic across all 4 filters (ranged, dept, store, min units)
- Added `uniqueDepartments`, `uniqueStores`, `anyFilterActive` derived values
- Updated `flatItems` useMemo to iterate `filteredResults` instead of `results` (dep array updated accordingly)
- Inserted filter strip JSX with:
  - Ranged select (All / Ranged only / Non-ranged only)
  - Department multi-select dropdown with checkboxes and `Dept (N)` badge
  - Store select (All stores + dynamic options from uniqueStores)
  - Min units number input (min=0, step=1, w-16)
  - "Showing X of Y results" counter (when filter active and counts differ)
  - "Clear all" button (when any filter active)
- Added filtered-results empty state: "No results match the current filters. Try adjusting or clearing the filters."
- Updated table outer condition from `results.length > 0` to `filteredResults.length > 0`
- PostMatchChart and CostReport intentionally left on unfiltered `results` array

## Verification
- TypeScript: zero errors (npx tsc --noEmit)
- filteredResults count: 7 occurrences
- for (const result of filteredResults): confirmed
- rangedFilter count: 6 occurrences
- filteredResults.length > 0 table condition: confirmed
- "No results match the current filters" empty state: confirmed

## Deviations from Plan
None — plan executed exactly as written.

## Commits
- `6a5a580` feat(17): add filter strip and filteredResults to MatchPage

## Self-Check: PASSED
- File `apps/web/src/pages/MatchPage.tsx` exists and modified
- Commit `6a5a580` exists in git log
- No unintended file deletions
