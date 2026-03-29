---
phase: 03-file-upload-pipeline
plan: "02"
subsystem: worker/upload-api
tags: [upload, api, hono, neon, multipart, bulk-insert, unnest, store-management]
dependency_graph:
  requires: [03-01 (parser.ts — parseRouFile, parseDeadStockFile)]
  provides: [POST /api/upload, GET /api/stores, upload.ts, 001-add-store-number.sql]
  affects: [apps/worker/src/index.ts, apps/web upload UI (Plan 03)]
tech_stack:
  added: []
  patterns: [hono-multipart, neon-unnest-bulk-insert, delete-then-insert, store-get-or-create, camelcase-json-response]
key_files:
  created:
    - apps/worker/src/routes/upload.ts
    - apps/worker/src/db/migrations/001-add-store-number.sql
    - apps/worker/src/__tests__/upload.test.ts
  modified:
    - apps/worker/src/index.ts
decisions:
  - File size check done on file.size before arrayBuffer() per RESEARCH Pitfall 3 — prevents Workers memory overflow
  - Store get-or-create uses two sequential withOrgContext calls (select then insert) — synchronous callback constraint prevents combining
  - DELETE + UNNEST INSERT pattern used for store data replace per RESEARCH Pattern 6 — two sequential withOrgContext calls
  - Parse errors return 400 with user-friendly FRED-specific message; DB errors return 500
  - 413 tests use actual 6 MB File content (not Object.defineProperty mock) — Workers pool environment requires real file size
metrics:
  duration_seconds: 402
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 03 Plan 02: Worker Upload API Summary

Hono-based upload API with POST /api/upload (multipart form, 5 MB size guard, store get-or-create, UNNEST bulk insert) and GET /api/stores (per-org store list with rouUploadedAt/dsUploadedAt timestamps) plus migration SQL for store_number column, backed by 8 new route tests bringing the suite to 62 passing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create upload route with POST /upload and GET /stores endpoints | 05f987f | apps/worker/src/routes/upload.ts, apps/worker/src/index.ts, apps/worker/src/db/migrations/001-add-store-number.sql |
| 2 | Upload route integration tests | 3169fef | apps/worker/src/__tests__/upload.test.ts |

## What Was Built

### apps/worker/src/routes/upload.ts

Two Hono routes exported as `uploadRoute`:

**POST /upload:**
- Accepts multipart `FormData` with `storeName` (required), `storeNumber` (optional), `rouFile` (File), `dsFile` (File)
- Returns 400 if `storeName` missing; 400 if no files provided
- Returns 413 (before any `arrayBuffer()` call) if either file exceeds 5 MB — per RESEARCH Pitfall 3
- Store get-or-create: `SELECT id FROM stores` then `INSERT stores ... RETURNING id` if not found; updates `store_number` if provided for existing store
- ROU processing: `DELETE FROM rou_data WHERE store_id = ?` then `UNNEST` bulk `INSERT INTO rou_data`
- Dead-stock processing: `DELETE FROM dead_stock WHERE store_id = ?` then `UNNEST` bulk `INSERT INTO dead_stock`
- Parse errors from `parseRouFile`/`parseDeadStockFile` caught and returned as user-friendly 400
- DB errors caught in outer try/catch and returned as 500
- Returns `{ ok: true, storeId, storeName }` on success

**GET /stores:**
- Queries `stores LEFT JOIN rou_data LEFT JOIN dead_stock` grouping by store ID
- Returns `MAX(uploaded_at)` for each file type as `rouUploadedAt`/`dsUploadedAt`
- All JSON keys in camelCase per project conventions: `storeNumber`, `createdAt`, `rouUploadedAt`, `dsUploadedAt`

### apps/worker/src/db/migrations/001-add-store-number.sql

```sql
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_number TEXT;
```

### apps/worker/src/index.ts

Added `import uploadRoute from './routes/upload'` and `app.route('/api', uploadRoute)` after existing healthRoute mount.

### apps/worker/src/__tests__/upload.test.ts

8 tests across two describe blocks:

**POST /api/upload (5 tests):**
- 400 when storeName missing
- 400 when no files provided
- 413 when rouFile is 6 MB (actual file content)
- 413 when dsFile is 6 MB (actual file content)
- 200 with `{ ok: true, storeId, storeName }` for valid ROU upload (new store)
- 200 for valid dead-stock upload (existing store)

**GET /api/stores (3 tests):**
- Returns stores array with all camelCase keys (`id`, `name`, `storeNumber`, `createdAt`, `rouUploadedAt`, `dsUploadedAt`)
- Returns `{ stores: [] }` when no stores exist
- Returns null timestamps for stores with no uploads

## Verification Results

```
Test Files  5 passed (5)
Tests  62 passed (62)
Duration  5.86s
```

```
npx tsc --noEmit → exits 0
grep 'uploadRoute' apps/worker/src/index.ts → confirmed
cat apps/worker/src/db/migrations/001-add-store-number.sql → ALTER TABLE stores ADD COLUMN
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 413 test File.size mock approach**
- **Found during:** Task 2 test execution
- **Issue:** `Object.defineProperty(file, 'size', { value: 6MB })` doesn't work in the Cloudflare Workers pool environment — the overridden size is not reflected when Hono's `parseBody()` reads the File object. Tests returned 500 (caught as DB error) instead of 413.
- **Fix:** Changed both 413 tests to create an actual `File` with 6 MB string content (`"a".repeat(6 * 1024 * 1024)`) so the `.size` property is naturally correct.
- **Files modified:** `apps/worker/src/__tests__/upload.test.ts`
- **Commit:** 3169fef (included in Task 2 commit)

## Known Stubs

None — all endpoints are fully implemented. `GET /api/stores` queries the real NEON schema. The migration SQL must be run against NEON before deploying (documented in route file header comment and in migration file).

## Self-Check: PASSED

- apps/worker/src/routes/upload.ts exists: FOUND
- apps/worker/src/db/migrations/001-add-store-number.sql exists: FOUND
- apps/worker/src/__tests__/upload.test.ts exists: FOUND
- apps/worker/src/index.ts contains uploadRoute: FOUND
- Commit 05f987f: FOUND
- Commit 3169fef: FOUND
