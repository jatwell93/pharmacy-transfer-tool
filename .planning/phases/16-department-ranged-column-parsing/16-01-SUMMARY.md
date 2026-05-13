---
phase: 16-department-ranged-column-parsing
plan: 01
subsystem: api
tags: [typescript, parser, postgres, cloudflare-workers, neon, vitest, tdd]

# Dependency graph
requires:
  - phase: 07-is-ranged-schema-fix
    provides: is_ranged column on dead_stock table; is_ranged in UNNEST INSERT and rou_data SELECT
  - phase: 12-cost-column-parser-summary-endpoint
    provides: optional-column extraction pattern (cost_ex); UNNEST INSERT pattern for new columns

provides:
  - DeadStockRow.department field in parser.ts — "" when Department column absent
  - HEADER_ALIASES Department entry with 5 aliases (Department, Dept, Dept., Drug Dept, Product Department)
  - department TEXT column in dead_stock schema.sql DDL
  - department in upload.ts UNNEST INSERT — persisted to NEON on dead stock upload
  - DeadStockItem.isRanged and DeadStockItem.department in matcher.ts
  - MatchResult.isRanged and MatchResult.department in matcher.ts
  - ds.is_ranged and ds.department in match.ts dead stock SELECT query
  - null->'' coercion for pre-migration rows in match.ts items.push()
  - 8 new TDD parser tests covering Department extraction (all 5 aliases, absent column, blank cell, Test 7 extended)

affects:
  - 16-02: frontend plan depends on MatchResult.isRanged and MatchResult.department from this plan
  - 17-table-filters: Department filter (Phase 17) depends on department field being in MatchResult

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-column extraction: const deptCol = colMap[\"Department\"]; const department = deptCol !== undefined ? (row[deptCol]?.trim() ?? \"\") : \"\""
    - "MIGRATION REQUIRED comment block in upload.ts with exact ALTER TABLE statement and neondb_owner note"
    - "Type widening: add isRanged/department to DeadStockItem bridge type, propagate to MatchResult via results.push()"
    - "TDD gate: write failing tests (RED) before implementing (GREEN); verify both phases"

key-files:
  created: []
  modified:
    - apps/worker/src/lib/parser.ts
    - apps/worker/src/db/schema.sql
    - apps/worker/src/routes/upload.ts
    - apps/worker/src/matcher.ts
    - apps/worker/src/routes/match.ts
    - apps/worker/src/__tests__/parser.test.ts
    - apps/worker/src/__tests__/matcher.test.ts

key-decisions:
  - "Department column is optional in parseDeadStockFile — missing column produces department: '' not a parse error (D-02)"
  - "department TEXT in dead_stock is nullable (no DEFAULT) — existing rows get NULL, match route maps null→'' per D-03"
  - "NEON migration must run as neondb_owner via SQL editor before deploying — pharmiq_app has no DDL rights (D-12)"
  - "DeadStockItem and MatchResult both gain isRanged + department as required fields — TypeScript enforces at compile time (D-05)"
  - "matcher.test.ts DeadStockItem literals updated to include new required fields (Rule 1 fix — type widening cascade)"

patterns-established:
  - "Optional-column pattern: mirrors descCol/rangedCol/costEx — check colMap[key] !== undefined before reading"
  - "MIGRATION REQUIRED comment convention extended to Phase 16 — third migration comment in upload.ts header"
  - "TDD RED/GREEN for parser changes: write 8 failing tests first, then implement to pass"

requirements-completed: [TABLE-01, TABLE-02]

# Metrics
duration: 8min
completed: 2026-05-13
---

# Phase 16 Plan 01: Department + Ranged Backend Stack Summary

**Department and ranged status added to the full backend stack: parser HEADER_ALIASES + DeadStockRow, schema.sql DDL, upload UNNEST INSERT, matcher.ts type widening, and match.ts SELECT — all 138 Worker tests passing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-13T13:01:07Z
- **Completed:** 2026-05-13T13:09:23Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Department column is now parsed from FRED dead stock exports via HEADER_ALIASES (5 aliases per D-01) and stored in DeadStockRow.department (defaults to "" when column absent)
- schema.sql dead_stock table gains `department TEXT` nullable column; upload.ts UNNEST INSERT persists it to NEON with a MIGRATION REQUIRED comment (D-11, D-12)
- MatchResult now carries isRanged: boolean and department: string through the full backend pipeline — Plan 02 (frontend) can consume these fields directly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Department to parser.ts (TDD)** - `a00cef0` (feat)
2. **Task 2: Schema migration — schema.sql + upload.ts UNNEST expansion** - `b78d047` (feat)
3. **Task 3: Widen matcher.ts types + match.ts SELECT + items.push** - `fdabe6d` (feat)

_Note: Task 1 and Task 3 were TDD tasks (RED tests written first, GREEN implementation followed). Both are contained in single commits per task for simplicity._

## Files Created/Modified

- `apps/worker/src/lib/parser.ts` — Added Department to HEADER_ALIASES (5 aliases), department: string to DeadStockRow interface, optional-column extraction in parseDeadStockFile row loop, department in result.push()
- `apps/worker/src/db/schema.sql` — Added `department TEXT` after `is_ranged` in dead_stock CREATE TABLE (nullable, no DEFAULT)
- `apps/worker/src/routes/upload.ts` — Added MIGRATION REQUIRED (Phase 16) comment block; added departments array and department in UNNEST INSERT column list + SELECT
- `apps/worker/src/matcher.ts` — Added isRanged: boolean and department: string to DeadStockItem and MatchResult interfaces; added both to results.push() in matchTransfers()
- `apps/worker/src/routes/match.ts` — Expanded dead_stock SELECT to include ds.is_ranged and ds.department; updated type annotation; added isRanged and department ?? "" to items.push()
- `apps/worker/src/__tests__/parser.test.ts` — Added 8 new TDD tests for Department extraction (all 5 aliases, absent column default, blank cell, Test 7 extended)
- `apps/worker/src/__tests__/matcher.test.ts` — Updated all DeadStockItem literals to include required isRanged and department fields (Rule 1 fix)

## Decisions Made

- Department field is `string` (not `string | undefined`) on DeadStockRow — the parser always produces a value (either extracted or "")
- department column in dead_stock is nullable TEXT (not NOT NULL) — new column with no DEFAULT is safe on live table; existing rows receive NULL, mapped to "" in match route
- NEON migration must run as neondb_owner before deploying — pharmiq_app lacks DDL rights; documented in MIGRATION REQUIRED comment
- DeadStockItem and MatchResult gained required (non-optional) fields — TypeScript strictness becomes a correctness check for the results.push() propagation (Pitfall 3 prevention)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] matcher.test.ts DeadStockItem literals missing required isRanged and department fields**
- **Found during:** Task 3 (type widening of DeadStockItem)
- **Issue:** After adding isRanged and department as required fields to DeadStockItem interface, all existing test DeadStockItem literals in matcher.test.ts were missing these fields, causing TypeScript type errors and potential runtime undefined behavior
- **Fix:** Updated all 23 DeadStockItem object literals in matcher.test.ts to include `isRanged: false, department: ""` — the default neutral values that preserve existing test behavior
- **Files modified:** apps/worker/src/__tests__/matcher.test.ts
- **Verification:** Full vitest suite (138 tests) passes; TypeScript compile confirms no type errors in modified files
- **Committed in:** fdabe6d (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/type cascade)
**Impact on plan:** Necessary fix — type widening required updating all callsites. No scope creep; test behavior unchanged.

## Issues Encountered

- Pre-existing TypeScript error in `apps/worker/src/__tests__/webhook.test.ts` (line 11): `Property 'transaction' does not exist on type 'Mock<Procedure>'`. Confirmed pre-existed before this plan. Out of scope per deviation rules — logged to deferred items.

## User Setup Required

**NEON Schema Migration Required Before Deploying:**

Run the following as `neondb_owner` in the NEON SQL editor before deploying the Phase 16 Worker:

```sql
ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;
```

Do NOT use `DATABASE_URL` (the `pharmiq_app` role lacks DDL rights). This must be run via the NEON dashboard SQL editor logged in as `neondb_owner`.

After the migration, new dead stock uploads will store the Department column value. Pre-migration rows will have `department = NULL` which the match route maps to `""` automatically.

## Known Stubs

None — all backend fields are fully wired. Plan 02 (frontend) will display these fields; that is not a stub, it is the next planned step.

## Threat Flags

All threat surfaces are covered by the plan's threat model (T-16-01 through T-16-05). No new surfaces were introduced beyond what was planned:
- T-16-01: UNNEST parameterized array prevents SQL injection (mitigated)
- T-16-02: RLS org_isolation policy on dead_stock automatically covers new department column (accepted)
- T-16-03: HEADER_ALIASES exact match; no regex injection surface (accepted)
- T-16-04: department is org-scoped via RLS; null→"" coercion prevents null leaking (accepted)
- T-16-05: TEXT column with no length limit is acceptable for FRED department values (accepted)

## Self-Check: PASSED

All files confirmed present. All task commits confirmed in git log.

## Next Phase Readiness

- Backend is ready for Plan 02 (frontend): MatchResult.isRanged and MatchResult.department are available in the API response
- NEON migration (`ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;`) must be run manually as neondb_owner before deploying
- useMatchRun.ts (client-side MatchResult mirror) needs updating in Plan 02 — see Pattern 8 in RESEARCH.md

---
*Phase: 16-department-ranged-column-parsing*
*Completed: 2026-05-13*
