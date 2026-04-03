---
phase: 04-matching-algorithm
plan: 01
subsystem: worker-api
tags: [matching, api, hono, neon, tdd]
dependency_graph:
  requires: [03-file-upload-pipeline]
  provides: [POST /api/match endpoint, match route handler, match unit tests]
  affects: [apps/worker/src/routes/match.ts, apps/worker/src/index.ts, apps/worker/src/__tests__/match.test.ts]
tech_stack:
  added: []
  patterns: [Hono route handler, withOrgContext NEON queries, matchTransfers per-store loop, warning deduplication by sku+field key]
key_files:
  created:
    - apps/worker/src/routes/match.ts
    - apps/worker/src/__tests__/match.test.ts
  modified:
    - apps/worker/src/index.ts
decisions:
  - rou_data query omits is_ranged (column does not exist in schema); RouItem.isRanged set to false for all rou_data rows
  - cost defaults to 0 for dead_stock items (schema has no cost column; cost is display-only)
  - Warning deduplication uses sku+field composite key in a Set to prevent duplicate warnings across multi-store runs
metrics:
  duration: 268
  completed: "2026-04-03"
  tasks: 2
  files: 3
---

# Phase 04 Plan 01: POST /match Route Summary

## One-liner

POST /api/match route that queries NEON dead_stock + rou_data, loops matchTransfers() per store, and returns merged results and deduplicated warnings.

## What Was Built

Created the `POST /api/match` Hono route handler that:

1. Validates `monthsCoverTarget` (required, number, 1–24)
2. Fetches all dead-stock rows for the org (joined with store names)
3. Fetches all ROU data rows for the org — **without** `is_ranged` (column does not exist in `rou_data` table); sets `isRanged: false` on all `RouItem` objects
4. Groups dead-stock rows by store name into a `Map<string, DeadStockItem[]>`
5. Calls `matchTransfers()` once per dead-stock store
6. Merges all `MatchResult[]` arrays into a single combined results array
7. Deduplicates `DataQualityWarning[]` across stores using a `sku::field` composite Set key
8. Returns `{ results: MatchResult[], warnings: DataQualityWarning[] }`

The route was mounted in `apps/worker/src/index.ts` alongside the existing health and upload routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing test for POST /match | fdcafd0 | apps/worker/src/__tests__/match.test.ts |
| 1 GREEN | POST /match route + index.ts mount | 4aee984 | apps/worker/src/routes/match.ts, apps/worker/src/index.ts |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `isRanged: false` for all rou_data rows | `rou_data` table has no `is_ranged` column (schema verified); sort-by-ranged uses false for all destinations |
| `cost: 0` for dead_stock items | `dead_stock` table has no cost column; cost is display-only per ALGORITHM-SPEC Section 5 |
| Warning deduplication via `sku::field` Set | Same NaN warning can appear from multiple store runs; deduplication prevents noise in UI |
| Two separate `withOrgContext` calls | Per D-03: separate queries, not JOIN; consistent with upload route pattern |

## Deviations from Plan

### Auto-added Test Cases

**[Rule 2 - Missing critical test] Added warning deduplication test**
- **Found during:** Task 2 implementation
- **Issue:** Plan specified 6 test cases but did not include an explicit deduplication verification test (only mentioned in behavior description)
- **Fix:** Added 7th test case `"deduplicates warnings across stores"` that explicitly verifies the Set-based deduplication logic
- **Files modified:** apps/worker/src/__tests__/match.test.ts

Otherwise — plan executed exactly as written.

## Test Results

All 7 tests pass:

```
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    2.80s
```

Test cases:
1. returns 400 when monthsCoverTarget is missing from body
2. returns 400 when monthsCoverTarget is 0
3. returns 400 when monthsCoverTarget is 25 (exceeds max)
4. returns 200 with empty results when no dead-stock data exists
5. returns 200 with merged results from 2 stores
6. deduplicates warnings across stores (same sku+field appears once)
7. returns 500 on database error

## Known Stubs

None — the route fetches real data from NEON and calls the actual `matchTransfers()` function. No hardcoded or placeholder values flow to the response.

## Self-Check: PASSED
