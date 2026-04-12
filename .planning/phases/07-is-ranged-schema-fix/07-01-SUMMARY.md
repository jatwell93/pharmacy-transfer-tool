---
phase: 07-is-ranged-schema-fix
plan: 01
subsystem: database
tags: [postgres, neon, typescript, tdd, vitest, schema-migration]

# Dependency graph
requires:
  - phase: 04-matching-algorithm
    provides: matchTransfers ranged-first sort logic, RouItem interface, withOrgContext query pattern in match.ts

provides:
  - RouRow interface extended with isRanged boolean field
  - parseRouFile parses Ranged column via RANGED_TRUTHY set (all 5 truthy variants)
  - ROU upload route stores is_ranged per row via UNNEST boolean array INSERT
  - match route SELECT includes rd.is_ranged; RouItem.isRanged reads from DB (not hardcoded false)
  - schema.sql rou_data CREATE TABLE includes is_ranged BOOLEAN NOT NULL DEFAULT false
  - Live NEON rou_data column added via ALTER TABLE (confirmed by user)
  - Full test suite: 88 passing, 1 failing (webhook pre-existing)
affects: [08-phase04-verification, 09-requirements-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UNNEST boolean array pattern for bulk PostgreSQL INSERT with boolean column"
    - "RANGED_TRUTHY Set reuse across both parser functions (parseDeadStockFile and parseRouFile)"
    - "withOrgContext typed generic with is_ranged: boolean in result row type"

key-files:
  created: []
  modified:
    - apps/worker/src/lib/parser.ts
    - apps/worker/src/routes/upload.ts
    - apps/worker/src/routes/match.ts
    - apps/worker/src/db/schema.sql
    - apps/worker/src/__tests__/parser.test.ts
    - apps/worker/src/__tests__/upload.test.ts
    - apps/worker/src/__tests__/match.test.ts

key-decisions:
  - "isRanged read from r.is_ranged in match.ts RouItem construction — not hardcoded false (INT-01 fix)"
  - "RouRow interface extended with isRanged: boolean field — parseDeadStockRow pattern mirrored exactly"
  - "UNNEST boolean array pattern (unnest(${ranged}::boolean[])) reused from dead_stock INSERT for ROU INSERT"
  - "RANGED_TRUTHY Set (checked, yes, true, 1, y) already existed — reused in parseRouFile, not duplicated"
  - "ALTER TABLE run as neondb_owner via NEON SQL editor — pharmiq_app lacks DDL rights"
  - "Ranged-first sort test uses soh:10 instead of soh:100 — soh:100 would yield minRequiredRou≈8.33, excluding destination ROUs of 5 and 3 via sell-through filter"

patterns-established:
  - "Parser RANGED_TRUTHY reuse: both parseRouFile and parseDeadStockFile use the same RANGED_TRUTHY Set defined once at module scope"
  - "Migration comment pattern: upload.ts top-of-file comment documents required DDL with neondb_owner instruction"

requirements-completed: [MATCH-05, MATCH-06]

# Metrics
duration: 45min
completed: 2026-04-12
---

# Phase 7 Plan 01: is_ranged Schema Fix Summary

**is_ranged column added to rou_data (NEON schema + schema.sql), ROU parser extended with RANGED_TRUTHY, upload INSERT wired via UNNEST boolean array, match route reads real DB value — ranged-first sort now activates end-to-end**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-12
- **Completed:** 2026-04-12
- **Tasks:** 4 (Tasks 1-3 completed in prior session; Task 4 verification in this session)
- **Files modified:** 7

## Accomplishments

- Added `isRanged: boolean` to RouRow interface and wired RANGED_TRUTHY parsing into parseRouFile (mirrors parseDeadStockFile pattern exactly)
- ROU upload route now stores is_ranged per row using `unnest(${ranged}::boolean[])` UNNEST INSERT pattern — identical to dead_stock INSERT
- match.ts RouItem construction changed from `isRanged: false` (hardcoded) to `isRanged: r.is_ranged` (read from DB) — closes INT-01
- Live NEON database altered: `ALTER TABLE rou_data ADD COLUMN IF NOT EXISTS is_ranged BOOLEAN NOT NULL DEFAULT false` confirmed by user
- Full test suite: 88 passing, 1 failing (webhook.test.ts pre-existing failure unrelated to Phase 7)
- Ranged-first sort test passes: Store C (ranged, ROU=3) correctly sorts before Store B (non-ranged, ROU=5)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Write failing tests for is_ranged pipeline** - `14726b0` (test)
2. **Task 2: GREEN — Implement is_ranged in parser, upload, and match** - `e74c942` (feat)
3. **Task 3: Schema migration — ALTER TABLE rou_data + schema.sql** - `1f9fb15` (chore)
4. **Task 4: Full suite verification** - (no code changes; verification only)

_Note: TDD tasks — RED commit followed by GREEN commit. Task 4 confirmed suite passes with no new commits required._

## Files Created/Modified

- `apps/worker/src/lib/parser.ts` - RouRow interface + isRanged field; parseRouFile with RANGED_TRUTHY parsing
- `apps/worker/src/routes/upload.ts` - ROU INSERT extended with is_ranged column and unnest(boolean[]) array
- `apps/worker/src/routes/match.ts` - SELECT rd.is_ranged added; RouItem.isRanged reads r.is_ranged (not hardcoded)
- `apps/worker/src/db/schema.sql` - rou_data CREATE TABLE now includes is_ranged BOOLEAN NOT NULL DEFAULT false
- `apps/worker/src/__tests__/parser.test.ts` - Two new tests: RANGED_TRUTHY variants + absent Ranged column defaults false
- `apps/worker/src/__tests__/upload.test.ts` - New test: ROU upload with Ranged column returns 200 ok:true
- `apps/worker/src/__tests__/match.test.ts` - Updated existing mocks (is_ranged: false); new ranged-first sort test

## Decisions Made

- **isRanged source:** Changed from hardcoded `false` to `r.is_ranged` from the withOrgContext query result. This was the core INT-01 fix — the sort logic already existed and was correct; it just never received `true` from real data.
- **RouRow interface:** Extended with `isRanged: boolean` to match DeadStockRow (symmetry across both upload pipelines).
- **UNNEST boolean array:** Reused proven pattern from dead_stock INSERT (`unnest(${ranged}::boolean[])`) — safe because postgres casts the array to boolean[] at the driver level, preventing injection.
- **RANGED_TRUTHY reuse:** Module-level Set already defined; no duplication needed. parseRouFile now uses the same 4-line pattern as parseDeadStockFile (lines 288-294).
- **Test soh value:** Ranged-first sort test uses `soh: 10` for the source dead stock row. Using `soh: 100` would yield `minRequiredRou = 100/12 ≈ 8.33`, which would exclude both destination ROUs (5 and 3) via the sell-through filter, causing the test to return zero results. `soh: 10` yields `minRequiredRou ≈ 0.83`, allowing both destinations through.

## Deviations from Plan

None — plan executed exactly as written. The test `soh: 10` was explicitly documented in the plan as the corrected value (with explanation about the sell-through filter), so it is not a deviation.

## Issues Encountered

None. The implementation was straightforward due to the existing RANGED_TRUTHY Set and UNNEST pattern in dead_stock INSERT acting as a proven template.

## User Setup Required

**NEON DDL migration required — completed by user before Task 4.**

The user ran the following via NEON SQL editor as `neondb_owner`:
```sql
ALTER TABLE rou_data ADD COLUMN IF NOT EXISTS is_ranged BOOLEAN NOT NULL DEFAULT false;
```
This was a manual human action (Task 3 checkpoint) because `pharmiq_app` (the Workers DATABASE_URL role) has no DDL rights per schema.sql line 102.

## Next Phase Readiness

- Phase 7 complete — ranged-first sort now activates end-to-end when ROU files contain ranged items
- MATCH-05 and MATCH-06 requirements are now satisfied by the pipeline (isRanged flows from CSV to DB to sort)
- Phase 8 (Phase 04 Verification) can now create 04-VERIFICATION.md with evidence that MATCH-05 is truly end-to-end (not just algorithmic)
- No blockers for Phase 8 or Phase 9

---
*Phase: 07-is-ranged-schema-fix*
*Completed: 2026-04-12*
