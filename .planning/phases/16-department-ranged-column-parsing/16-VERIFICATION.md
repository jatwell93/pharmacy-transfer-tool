---
phase: 16-department-ranged-column-parsing
verified: 2026-05-13T14:00:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 16: Department + Ranged Column Parsing — Verification Report

**Phase Goal:** Add Department and Ranged columns to the full stack: parser extraction, DB schema, upload INSERT, matcher types, match query, frontend type mirror, and 11-column match table rendering.
**Verified:** 2026-05-13T14:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dead stock file with a Department column produces DeadStockRow[] where each row has a non-empty department string | VERIFIED | `parser.ts` line 319: `const department = deptCol !== undefined ? (row[deptCol]?.trim() ?? "") : ""` — test "recognises canonical 'Department' header" asserts `rows[0].department === "Pharmacy"` |
| 2 | Dead stock file without a Department column produces DeadStockRow[] where department: '' — no parse error thrown | VERIFIED | `parser.ts` same conditional: returns "" when `deptCol === undefined`. Test "defaults department to '' when Department column is absent" passes |
| 3 | After running match, each MatchResult contains isRanged: boolean and department: string | VERIFIED | `matcher.ts` lines 40-50: MatchResult interface has `isRanged: boolean` and `department: string`. `results.push()` lines 214-224 includes both fields |
| 4 | null department from DB rows uploaded before migration maps to '' in API response — never null | VERIFIED | `match.ts` line 186: `department: row.department ?? ""` — null coerced to "" at the items.push() call site |
| 5 | schema.sql dead_stock table definition includes the department TEXT column | VERIFIED | `schema.sql` line 49: `department  TEXT,` after `is_ranged` |
| 6 | upload.ts UNNEST INSERT includes the department column and array | VERIFIED | `upload.ts` line 200: column list includes `department`; line 207: `unnest(${departments}::text[])` in SELECT |
| 7 | useMatchRun.ts MatchResult interface has isRanged: boolean and department: string fields | VERIFIED | `useMatchRun.ts` lines 22-23: `isRanged: boolean` and `department: string` present after `sourceStore` |
| 8 | MatchPage.tsx columnHeaders array contains 'Department' and 'Ranged' between 'Description' and 'Source Store' | VERIFIED | `MatchPage.tsx` lines 240-251: 10-element array with 'Department' at index 2, 'Ranged' at index 3 |
| 9 | MatchPage.tsx grid template is grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] in all 3 grid divs | VERIFIED | Lines 490, 524, 571 — all 3 use new 11-column template. Old 9-column template has 0 occurrences in file |
| 10 | Main result rows render result.department in a Department cell and result.isRanged ternary in a Ranged cell | VERIFIED | `MatchPage.tsx` lines 540-546: `{result.department}` with `truncate` class; `{result.isRanged ? '\u2713' : '\u2014'}` — no icon library, no colored background |
| 11 | Sub-match rows render empty Department and Ranged cells (no value text) | VERIFIED | `MatchPage.tsx` lines 583-585: `<div className="px-3 text-[13px] text-[var(--color-text-muted)] truncate" />` and `<div className="px-3 text-[13px] text-[var(--color-text-secondary)]" />` — self-closing, no content |
| 12 | describe block 'parseDeadStockFile department extraction' exists in parser.test.ts with 7+ tests covering all 5 aliases, missing column, and blank cell | VERIFIED | `parser.test.ts` lines 312-372: 8 tests in the block — all 5 aliases (Department, Dept, Dept., Drug Dept, Product Department), missing column, blank cell, plus "Test 7 extended" for FRED full-column CSV |
| 13 | All worker vitest tests pass | VERIFIED | `npx vitest run` in apps/worker: 138 tests / 9 test files — all passed (0 failures) |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/worker/src/lib/parser.ts` | DeadStockRow.department field + HEADER_ALIASES Department entry + optional-column extraction | VERIFIED | Line 25: `department: string`. Line 42: 5-alias entry. Lines 318-319: extraction. Line 321: result.push includes department |
| `apps/worker/src/db/schema.sql` | Canonical DDL with department TEXT on dead_stock | VERIFIED | Line 49: `department  TEXT,` after `is_ranged` — nullable, no DEFAULT |
| `apps/worker/src/routes/upload.ts` | MIGRATION REQUIRED (Phase 16) comment + department in UNNEST INSERT | VERIFIED | Lines 13-14: comment with exact ALTER TABLE statement. Lines 194, 200, 207: departments array and UNNEST |
| `apps/worker/src/matcher.ts` | DeadStockItem and MatchResult type widening | VERIFIED | Lines 8-15: DeadStockItem has both fields. Lines 40-50: MatchResult has both fields. Lines 220-221: results.push() includes both |
| `apps/worker/src/routes/match.ts` | SELECT ds.is_ranged, ds.department + DeadStockItem mapping + MatchResult propagation | VERIFIED | Lines 135-136: SELECT includes both columns. Lines 127-128: type annotation. Lines 185-186: items.push() maps both |
| `apps/web/src/hooks/useMatchRun.ts` | MatchResult mirror interface with isRanged and department | VERIFIED | Lines 22-23: both fields present as required (non-optional) |
| `apps/web/src/pages/MatchPage.tsx` | Updated columnHeaders, 3x grid template, Department+Ranged cell rendering | VERIFIED | Lines 240-251: 10-element headers. Lines 490/524/571: all 3 grid templates. Lines 540-546: main row rendering. Lines 583-585: empty sub-row cells |
| `apps/worker/src/__tests__/parser.test.ts` | New department describe block with 7+ tests | VERIFIED | Lines 310-372: describe block "parseDeadStockFile department extraction" with 8 tests |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `parser.ts` DeadStockRow.department | `upload.ts` UNNEST INSERT | `departments = rows.map(r => r.department)` | WIRED | Line 194: `const departments = rows.map((r) => r.department)` — directly consumes DeadStockRow.department |
| `match.ts` DeadStockItem construction | `matcher.ts` matchTransfers() | `isRanged` + `department` fed into DeadStockItem | WIRED | Lines 185-186: both fields set on items.push(); matcher.ts DeadStockItem interface requires both |
| `matcher.ts` results.push() | `match.ts` allResults | `MatchResult.isRanged` + `MatchResult.department` returned | WIRED | Lines 220-221: both fields included in results.push(); MatchResult interface requires both |
| `useMatchRun.ts` MatchResult | `MatchPage.tsx` result rendering | `result.department` and `result.isRanged` consumed as JSX text nodes | WIRED | Lines 541, 545: `{result.department}` and `{result.isRanged ? '\u2713' : '\u2014'}` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MatchPage.tsx` Department cell | `result.department` | `useMatchRun.ts` → API `/match` → `match.ts` SELECT `ds.department` → `dead_stock.department` (uploaded from FRED via `upload.ts` UNNEST) | Yes — DB column populated from parsed file; null coerced to "" for pre-migration rows | FLOWING |
| `MatchPage.tsx` Ranged cell | `result.isRanged` | `useMatchRun.ts` → API `/match` → `match.ts` SELECT `ds.is_ranged` → `dead_stock.is_ranged` (Phase 7 column) | Yes — existing Phase 7 column; always populated via UNNEST INSERT | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 138 worker tests pass including 8 new department extraction tests | `npx vitest run` in apps/worker | 138 passed / 9 test files / 0 failures | PASS |
| All 35 parser tests pass including the department describe block | `npx vitest run src/__tests__/parser.test.ts` | 35 passed / 1 test file | PASS |
| Old 9-column grid template has zero occurrences in MatchPage.tsx | grep `grid-cols-[36px_1fr_1.2fr_1fr_1fr` | 0 matches | PASS |
| New 11-column grid template appears exactly 3 times in MatchPage.tsx | grep `grid-cols-[36px` | 3 matches, all use `60px_1fr_1fr` segment | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TABLE-01 | 16-01, 16-02 | Department column in dead stock parsing and match table | SATISFIED | HEADER_ALIASES entry, DeadStockRow.department, schema.sql, upload UNNEST, match SELECT, MatchPage column |
| TABLE-02 | 16-01, 16-02 | Ranged column propagated through match pipeline and displayed in table | SATISFIED | is_ranged in DeadStockItem, MatchResult, match SELECT, MatchPage Ranged cell |

---

## Anti-Patterns Found

None found. Checked all 8 modified files for TODO/FIXME/placeholder patterns, empty implementations, and hardcoded stub values. No issues.

Notable observations:
- `department: string` is required (non-optional) on both `DeadStockItem` and `MatchResult` — TypeScript enforces correctness at compile time
- Sub-match row empty cells use self-closing `<div />` syntax — correct, no null/undefined leak
- The `departments` array in upload.ts is extracted and passed to `::text[]` UNNEST — matches established pattern for `skus`, `descriptions`, `costs`

---

## Human Verification Required

None. All success criteria are verifiable programmatically.

The only item that cannot be fully verified programmatically is the **NEON live database migration**:

`ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;`

This must be run as `neondb_owner` before deploying. It is documented in:
- `upload.ts` lines 13-14 (MIGRATION REQUIRED comment)
- Phase 16-01 SUMMARY.md "User Setup Required" section

This is a deployment pre-condition, not a code gap. The schema.sql DDL is correct. The upload UNNEST and match SELECT are both wired for the column. The code is production-ready; the migration is a manual operational step.

---

## Gaps Summary

No gaps. All 13 must-have truths are VERIFIED.

**Plan 16-01 success criteria — all 6 met:**
1. HEADER_ALIASES has "Department" key with exactly 5 aliases. DeadStockRow.department: string. parseDeadStockFile extracts department, defaults to "". — VERIFIED
2. schema.sql dead_stock includes `department TEXT` after `is_ranged`. — VERIFIED
3. upload.ts has MIGRATION REQUIRED (Phase 16) comment. Dead stock UNNEST INSERT includes department. — VERIFIED
4. matcher.ts DeadStockItem has isRanged: boolean and department: string. MatchResult has both. results.push() includes both. — VERIFIED
5. match.ts SELECT includes ds.is_ranged, ds.department. Type annotation updated. items.push() maps both. — VERIFIED
6. `npx vitest run` passes all 138 tests. — VERIFIED

**Plan 16-02 success criteria — all 7 met:**
1. useMatchRun.ts MatchResult has isRanged: boolean and department: string after sourceStore. — VERIFIED
2. columnHeaders has 10 elements including 'Department' and 'Ranged' at positions 2 and 3. — VERIFIED
3. All 3 grid template classNames use the 11-column string. Zero old 9-column templates. — VERIFIED
4. Main result rows render `{result.department}` with truncate class and isRanged ternary with Unicode check/dash. — VERIFIED
5. Sub-match rows render two empty self-closing divs for Department and Ranged. — VERIFIED
6. `"parseDeadStockFile department extraction"` describe block present as last block with 8 tests (7 required + 1 "Test 7 extended" bonus). — VERIFIED (exceeds minimum)
7. All 35 parser tests pass. All 138 worker tests pass. — VERIFIED

---

_Verified: 2026-05-13T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
