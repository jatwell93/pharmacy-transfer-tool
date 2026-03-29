---
phase: 03-file-upload-pipeline
plan: "01"
subsystem: worker/parser
tags: [parsing, csv, xlsx, fred-office, tdd, sheetjs]
dependency_graph:
  requires: []
  provides: [parser.ts, RouRow, DeadStockRow, parseCSV, parseXLSX, findHeaderRow, buildColumnMap, parseRouFile, parseDeadStockFile]
  affects: [apps/worker/src/routes/upload.ts]
tech_stack:
  added: [xlsx@0.20.3 (SheetJS CDN tarball)]
  patterns: [pure-functions, tdd-red-green, header-aliasing, nan-not-zero]
key_files:
  created:
    - apps/worker/src/lib/parser.ts
    - apps/worker/src/__tests__/parser.test.ts
  modified:
    - apps/worker/package.json
    - apps/worker/package-lock.json
decisions:
  - SheetJS installed from CDN tarball (https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz) as required in plan
  - parseCSV uses 0xFEFF charCodeAt check to strip UTF-8 BOM before splitting lines
  - NaN chosen over 0 for non-numeric rou/soh to preserve data quality signal for matcher
  - HEADER_ALIASES ported verbatim from Django views.py with ROU key renamed from 'ROU Value' to 'ROU' for canonical clarity
metrics:
  duration_seconds: 182
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 03 Plan 01: CSV/XLSX Parser Module Summary

SheetJS-powered pure parser functions that convert raw CSV/XLSX ArrayBuffers into typed RouRow[] and DeadStockRow[] arrays, handling all FRED Office export quirks (UTF-8 BOM, CRLF, blank title rows, column aliasing, isRanged truthy variants) via TDD with 18 new tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Install SheetJS and create failing parser tests | 45ea91a | apps/worker/src/__tests__/parser.test.ts, package.json, package-lock.json |
| 1 (GREEN) | Implement parser module with all FRED quirks | 42a0b93 | apps/worker/src/lib/parser.ts |

## What Was Built

### apps/worker/src/lib/parser.ts

Six exported functions plus two interfaces:

- `RouRow` — typed row interface: sku, description, rou (NaN-safe), soh (NaN-safe)
- `DeadStockRow` — typed row interface: sku, description, soh, isRanged (boolean)
- `HEADER_ALIASES` — column name alias map ported from Django views.py
- `parseCSV(buffer)` — strips UTF-8 BOM, normalises CRLF, filters blank lines, handles quoted fields
- `parseXLSX(buffer)` — reads first sheet via SheetJS, coerces all cells to strings
- `findHeaderRow(rows, required)` — scans rows for required canonical names via aliases, returns -1 on miss
- `buildColumnMap(headerRow)` — maps aliased header cells to canonical column indices
- `parseRouFile(buffer, filename)` — returns RouRow[] with NaN for non-numeric values, throws on missing headers
- `parseDeadStockFile(buffer, filename)` — returns DeadStockRow[] with isRanged boolean, Ranged column optional

### apps/worker/src/__tests__/parser.test.ts

18 tests across 5 describe blocks:
- `parseCSV` — 4 tests: BOM stripping, CRLF normalisation, blank line filtering, quoted field with comma
- `findHeaderRow` — 3 tests: header at row 0, header at row 2 (with title rows above), returns -1 on miss
- `buildColumnMap` — 2 tests: canonical names, aliased names (SKU, Stock on Hand, Usage Rate)
- `parseRouFile` — 5 tests: canonical headers, aliased headers, empty Item Code skipped, NaN for non-numeric, error on missing headers
- `parseDeadStockFile` — 4 tests: canonical headers, 10-variant isRanged truthy/falsy, absent Ranged column, error on missing headers

## Verification Results

```
Test Files  4 passed (4)
Tests  53 passed (53)
Duration  1.97s
```

```
grep -c 'export function' apps/worker/src/lib/parser.ts  → 6
grep 'HEADER_ALIASES' apps/worker/src/lib/parser.ts      → present
grep '0xFEFF' apps/worker/src/lib/parser.ts              → confirmed
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all parser functions are fully wired. parseXLSX is implemented and testable via SheetJS's `XLSX.utils.book_new()` / `XLSX.utils.json_to_sheet()` helpers (not skipped). The plan note about potentially skipping XLSX tests was not needed since SheetJS works in the Workers pool.

## Self-Check: PASSED

- apps/worker/src/lib/parser.ts exists: FOUND
- apps/worker/src/__tests__/parser.test.ts exists: FOUND
- Commit 45ea91a: FOUND
- Commit 42a0b93: FOUND
