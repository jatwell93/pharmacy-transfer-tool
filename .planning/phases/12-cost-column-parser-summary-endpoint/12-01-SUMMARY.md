---
phase: 12
plan: 01
subsystem: worker/parser + worker/upload
tags: [parser, upload, cost-ex, data-quality, tdd]
dependency_graph:
  requires:
    - "apps/worker/src/lib/parser.ts (DeadStockRow interface — extended)"
    - "apps/worker/src/matcher.ts (DataQualityWarning interface — imported)"
    - "apps/worker/src/db/schema.sql (dead_stock.cost_ex column — already present)"
  provides:
    - "DeadStockRow.costEx: number — NaN when column absent or non-numeric"
    - "parseDeadStockFile cost extraction with header-level absence detection"
    - "dead_stock INSERT with cost_ex column via UNNEST"
    - "DataQualityWarning { field: 'cost' } for negative costEx values"
    - "POST /upload response includes warnings: DataQualityWarning[]"
  affects:
    - "apps/worker/src/routes/upload.ts (dead_stock INSERT + response)"
    - "apps/worker/src/__tests__/parser.test.ts (+7 tests)"
    - "apps/worker/src/__tests__/upload.test.ts (+4 tests)"
tech_stack:
  added: []
  patterns:
    - "hasCostColumn flag: colMap[Cost Ex] !== undefined — header-level absence detection (D-04)"
    - "parseFloat(row[colMap[Cost Ex]] ?? '') — NaN for blank/absent, 0 for zero, negative preserved"
    - "costs: (number | null)[] mapping: NaN → null, negative → null, zero → 0, positive → value"
    - "unnest(costs::float8[]) in NEON UNNEST INSERT pattern"
    - "DataQualityWarning import type from matcher.ts — reused, not redefined"
key_files:
  created: []
  modified:
    - "apps/worker/src/lib/parser.ts"
    - "apps/worker/src/routes/upload.ts"
    - "apps/worker/src/__tests__/parser.test.ts"
    - "apps/worker/src/__tests__/upload.test.ts"
decisions:
  - "Negative costEx preserved at parse layer (parser.ts); NULL conversion and DataQualityWarning emitted in upload route — single responsibility separation"
  - "hasCostColumn flag checked at header level before row loop — avoids false NaN from blank cells when column present (D-04)"
  - "Zero costEx stored as 0 not NULL — valid FRED scenario for samples/donations (D-08)"
  - "DataQualityWarning import type (not value) from matcher.ts — no runtime cost, correct type reuse"
metrics:
  duration_seconds: 289
  completed_date: "2026-04-16T23:43:45Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 12 Plan 01: Cost Ex Parser + Upload Route Summary

**One-liner:** costEx field added to DeadStockRow with header-level NaN detection, UNNEST INSERT extended with cost_ex column, and negative-cost DataQualityWarning surfaced in upload response.

## What Was Built

### Task 1: DeadStockRow.costEx field + parseDeadStockFile extraction (commit 643ddc7)

Extended `DeadStockRow` interface in `apps/worker/src/lib/parser.ts` to include `costEx: number`. The parser detects Cost Ex column presence at the header level using `const hasCostColumn = colMap["Cost Ex"] !== undefined;` (D-04 pattern). Per-row extraction uses `parseFloat(row[colMap["Cost Ex"]] ?? "")` which naturally produces:

- `NaN` for blank cells and absent columns (NULL in DB)
- `0` for zero values (valid per D-08 — samples/donations in FRED)
- Negative values passed through unchanged (warning emitted in upload route per D-09)
- Numeric values as-is

The existing `HEADER_ALIASES["Cost Ex"]` entry (already present at line 39) covers aliases: `"Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"`.

`parseRouFile` was not modified — Cost Ex applies only to dead-stock files per plan scope.

### Task 2: Upload route cost_ex INSERT + DataQualityWarning (commit a08a5f4)

Extended `apps/worker/src/routes/upload.ts`:

1. Added `import type { DataQualityWarning } from '../matcher';` — reuses existing interface
2. Declared `const warnings: DataQualityWarning[] = [];` at start of try block
3. Added negative-cost warning loop after `parseDeadStockFile` call — emits `{ sku, field: "cost", reason: "..." }` for each row where `!isNaN(costEx) && costEx < 0`
4. Built `costs: (number | null)[]` array: NaN → null, negative → null, zero → 0, positive → value
5. Extended dead_stock UNNEST INSERT to include `cost_ex` column: `unnest(${costs}::float8[])`
6. Updated success response from `{ ok, storeId, storeName, rouRows, dsRows }` to `{ ok, storeId, storeName, rouRows, dsRows, warnings }`

The ROU branch, GET /stores handler, store-upsert logic, size checks, and validation blocks were not modified.

## Test Results

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| parser.test.ts | 20 | 27 | +7 |
| upload.test.ts | 10 | 14 | +4 |
| Full worker suite | 89 | 100 | +11 |

**Full suite: 100/100 tests pass.**

New parser tests cover: numeric Cost Ex values, absent column (NaN), blank cell (NaN), zero (0 not NaN), negative (preserved at parse layer), header alias "Cost", and FRED Stock Valuation full-column format.

New upload tests cover: DS upload with Cost Ex (cost_ex array written, warnings empty), DS upload without Cost Ex (still succeeds, warnings empty), negative cost (warning emitted with field: "cost"), zero cost (no warning, valid per D-08).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The `cost_ex` values are extracted from the uploaded file and written to the database. The column was already present in `schema.sql` (Phase 11). Plan 12-02 will read these values for the dead-stock-summary endpoint.

## Threat Flags

No new threat surface introduced. All mitigations from the plan threat model were implemented:

- T-12-01: `parseFloat` returns NaN for non-numeric input; NaN and negative values converted to NULL before INSERT
- T-12-02: INSERT runs through `withOrgContext` with org_id from verified Clerk JWT; RLS enforced at DB layer
- T-12-03: 5 MB file size cap checked before `arrayBuffer()` — existing protection covers new column
- T-12-04/T-12-05: Warnings echo only the user's own SKUs; no cross-org leakage

## Self-Check

Files created/modified:

- [x] `apps/worker/src/lib/parser.ts` — contains `costEx: number`, `hasCostColumn`, `parseFloat(row[colMap["Cost Ex"]]`, `costEx }` in push
- [x] `apps/worker/src/routes/upload.ts` — contains `DataQualityWarning` import, `warnings` array, `field: "cost"`, `cost_ex` in INSERT, `unnest(${costs}::float8[])`, `warnings` in response
- [x] `apps/worker/src/__tests__/parser.test.ts` — contains `describe("parseDeadStockFile cost_ex extraction"` with 7 `it()` cases
- [x] `apps/worker/src/__tests__/upload.test.ts` — contains `describe("POST /api/upload — Cost Ex column"` with 4 `it()` cases

Commits:
- [x] `643ddc7` — Task 1 parser extension
- [x] `a08a5f4` — Task 2 upload route extension

## Self-Check: PASSED
