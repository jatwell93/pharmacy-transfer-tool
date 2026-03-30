---
phase: 03-file-upload-pipeline
verified: 2026-03-30T10:29:08Z
status: gaps_found
score: 11/13 must-haves verified
re_verification: false
gaps:
  - truth: "POST /api/upload with a dead-stock CSV file and storeName inserts rows into dead_stock table"
    status: partial
    reason: "The upload route was updated post-plan (cc6f3c2) to add an org FK upsert as the first withOrgContext call. The corresponding test mocks only the original N calls (SELECT, DELETE, INSERT), not the new N+1 (org upsert first). The test returns 500 from the outer catch because the mock runs out of values."
    artifacts:
      - path: "apps/worker/src/__tests__/upload.test.ts"
        issue: "Test at line 141 mocks 3 withOrgContext calls but the route now makes 4 (org upsert + SELECT existing + DELETE dead_stock + INSERT dead_stock). Mock exhaustion causes the route's outer catch to return 500."
    missing:
      - "Add a 4th mockResolvedValueOnce(undefined) before the SELECT mock in the dead-stock upload test to account for the org upsert call at upload.ts line 52-56"
  - truth: "GET /api/stores returns all stores for the org with rouUploadedAt and dsUploadedAt timestamps"
    status: failed
    reason: "All 3 GET /api/stores tests fail. The route has no try/catch wrapper, so when withOrgContext is mocked but returns an unexpected value (due to vi.clearAllMocks not resetting call counts within a describe block), the route throws an unhandled rejection and returns 500. The 'empty stores' test returns leftover mock data from a prior test call sequence."
    artifacts:
      - path: "apps/worker/src/__tests__/upload.test.ts"
        issue: "GET /stores tests at lines 175-251 all fail: 'returns stores array with camelCase keys' gets 500 (mock runs out), 'returns empty stores array' gets leftover data from prior test, 'returns null timestamps' gets undefined body.stores[0]"
      - path: "apps/worker/src/routes/upload.ts"
        issue: "GET /stores handler (line 186) has no try/catch — an exhausted mock throws an unhandled exception causing the worker pool to swallow the error as 500"
    missing:
      - "Update all 3 GET /api/stores tests to reset mock state correctly and account for the org upsert call in the POST path leaving mock state effects across tests"
      - "Consider adding a try/catch to GET /stores to produce a proper 500 JSON response instead of an unhandled exception (defensive, not strictly required for goal)"
human_verification:
  - test: "Full upload pipeline end-to-end"
    expected: "All 15 steps from 03-03-PLAN.md checkpoint pass including file upload, store card display, replace warnings, file size limits, keyboard navigation"
    why_human: "Completed and APPROVED by user during Plan 03 execution checkpoint"
---

# Phase 03: File Upload Pipeline — Verification Report

**Phase Goal:** Pharmacy managers can upload ROU and dead-stock CSV/XLSX reports for each store through a polished UI. Files are parsed, validated, and persisted to NEON with per-org isolation.
**Verified:** 2026-03-30T10:29:08Z
**Status:** gaps_found — 4 upload route tests failing due to mock desync introduced by post-plan org FK upsert (cc6f3c2)
**Re-verification:** No — initial verification
**Human Checkpoint:** APPROVED (all 15 steps passed during Plan 03 Task 3)

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                  | Status      | Evidence                                                                                                         |
|----|----------------------------------------------------------------------------------------|-------------|------------------------------------------------------------------------------------------------------------------|
| 1  | ROU CSV with BOM, CRLF, and blank title rows parses to correct sku/description/rou/soh arrays | VERIFIED | parser.ts 298 lines, 0xFEFF BOM check at line 55, CRLF normalisation, 18 parser tests all passing             |
| 2  | Dead-stock CSV parses to correct sku/description/soh/is_ranged arrays                 | VERIFIED    | parseDeadStockFile exported; 4 dead-stock tests passing including 10-variant isRanged truthy/falsy              |
| 3  | XLSX files parse identically to CSV equivalents via SheetJS                            | VERIFIED    | import * as XLSX from 'xlsx' at parser.ts line 7; xlsx 0.20.3 CDN tarball in package.json                     |
| 4  | Files over 5 MB are rejected before parsing                                            | VERIFIED    | MAX_BYTES = 5 * 1024 * 1024 at upload.ts line 17; 413 tests pass (2/2 in test suite)                          |
| 5  | Unrecognised columns are silently dropped                                              | VERIFIED    | buildColumnMap only maps known HEADER_ALIASES; no other column extraction in parseDeadStockFile                  |
| 6  | POST /api/upload with ROU CSV inserts rows into rou_data table                         | VERIFIED    | Route at upload.ts lines 88-131: DELETE + UNNEST INSERT; 200 test passes                                       |
| 7  | POST /api/upload with dead-stock CSV inserts rows into dead_stock table                | PARTIAL     | Route logic is correct (lines 134-175); test fails due to mock desync — 4th withOrgContext call not mocked     |
| 8  | GET /api/stores returns all stores with rouUploadedAt and dsUploadedAt timestamps      | FAILED      | Route logic correct (lines 186-227, camelCase keys confirmed); all 3 GET tests fail due to mock exhaustion     |
| 9  | File over 5 MB returns 413 before any parsing                                          | VERIFIED    | File.size check before arrayBuffer() call; both 413 tests pass                                                  |
| 10 | Re-uploading replaces that store's data (DELETE + INSERT)                              | VERIFIED    | DELETE FROM rou_data and DELETE FROM dead_stock present in route; pattern confirmed in code                     |
| 11 | Store created automatically on first upload                                            | VERIFIED    | get-or-create logic at upload.ts lines 58-85; org upsert at lines 50-56                                        |
| 12 | User can navigate to /upload and see the upload UI                                     | VERIFIED    | App.tsx path="/upload" route; AppShell disabled={false} href="/upload"; NavItem uses react-router Link          |
| 13 | Human end-to-end pipeline verified (file -> modal -> API -> NEON -> card refresh)      | VERIFIED    | All 15 checkpoint steps APPROVED by user in Plan 03 Task 3                                                      |

**Score:** 11/13 truths verified (2 partial/failed — both trace to same root cause: test mock desync)

---

## Required Artifacts

| Artifact                                               | Min Lines | Actual | Status     | Details                                                                     |
|--------------------------------------------------------|-----------|--------|------------|-----------------------------------------------------------------------------|
| `apps/worker/src/lib/parser.ts`                        | —         | 298    | VERIFIED   | 6 exported functions, RouRow/DeadStockRow interfaces, HEADER_ALIASES, RANGED_TRUTHY, BOM/CRLF/quoted-field handling |
| `apps/worker/src/__tests__/parser.test.ts`             | 80        | 210    | VERIFIED   | 18 tests across 5 describe blocks; all 18 pass                              |
| `apps/worker/src/routes/upload.ts`                     | —         | 229    | VERIFIED   | POST /upload + GET /stores; org upsert; 5 MB guard; DELETE+UNNEST INSERT pattern |
| `apps/worker/src/__tests__/upload.test.ts`             | —         | 252    | PARTIAL    | 9 tests; 5 pass (400x2, 413x2, 200 ROU happy path); 4 fail (mock desync)  |
| `apps/worker/src/db/migrations/001-add-store-number.sql` | —       | 2      | VERIFIED   | ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_number TEXT              |
| `apps/web/src/hooks/useStores.ts`                      | 15        | 37     | VERIFIED   | Exports Store interface + useStores(); fetches /api/stores; exposes refresh |
| `apps/web/src/components/FileStatusBadge.tsx`          | 10        | 37     | VERIFIED   | Green dot (#10B981) + date or dash + "not uploaded" (#94A3B8)              |
| `apps/web/src/components/StoreCard.tsx`                | 30        | 52     | VERIFIED   | Store name with optional number, amber incomplete indicator, FileStatusBadge rows, Upload files button |
| `apps/web/src/components/UploadModal.tsx`              | 80        | 385    | VERIFIED   | role="dialog", aria-modal, file pickers, replace warning, focus trap, loading state, error zones |
| `apps/web/src/pages/UploadPage.tsx`                    | 60        | 101    | VERIFIED   | Card grid, empty state, Add Store CTA, modal wiring                        |

---

## Key Link Verification

| From                                           | To                   | Via                                          | Status     | Details                                                         |
|------------------------------------------------|----------------------|----------------------------------------------|------------|-----------------------------------------------------------------|
| `apps/worker/src/lib/parser.ts`                | `xlsx`               | `import * as XLSX from 'xlsx'`              | WIRED      | Line 7 of parser.ts; xlsx@0.20.3 CDN tarball in package.json  |
| `apps/worker/src/lib/parser.ts`                | `HEADER_ALIASES`     | findHeaderRow scans via aliases             | WIRED      | HEADER_ALIASES exported at line 27; used by findHeaderRow line 155 and buildColumnMap line 175 |
| `apps/worker/src/routes/upload.ts`             | `apps/worker/src/lib/parser.ts` | `import { parseRouFile, parseDeadStockFile }` | WIRED | Line 13 of upload.ts; called at lines 92 and 138 |
| `apps/worker/src/routes/upload.ts`             | `apps/worker/src/db/client.ts` | `import { withOrgContext }`               | WIRED      | Line 12 of upload.ts; called 4-6 times per POST request       |
| `apps/worker/src/index.ts`                     | `apps/worker/src/routes/upload.ts` | `app.route('/api', uploadRoute)`      | WIRED      | Lines 5 and 24 of index.ts confirmed                           |
| `apps/web/src/hooks/useStores.ts`              | `/api/stores`        | `fetchApi('/api/stores')` in useCallback   | WIRED      | Line 23 of useStores.ts; state set via setStores(data.stores) line 26 |
| `apps/web/src/components/UploadModal.tsx`      | `/api/upload`        | `fetchApi('/api/upload', { method: 'POST', body: formData })` | WIRED | Line 142 of UploadModal.tsx |
| `apps/web/src/App.tsx`                         | `apps/web/src/pages/UploadPage.tsx` | `Route path='/upload'`             | WIRED      | Lines 6 and 22 of App.tsx confirmed                            |
| `apps/web/src/components/AppShell.tsx`         | `/upload`            | `NavItem href="/upload" disabled={false}`  | WIRED      | Lines 35-36 of AppShell.tsx confirmed                          |

---

## Data-Flow Trace (Level 4)

| Artifact                    | Data Variable  | Source                             | Produces Real Data | Status     |
|-----------------------------|----------------|------------------------------------|--------------------|------------|
| `UploadPage.tsx`            | `stores`       | useStores() → fetchApi('/api/stores') → withOrgContext DB query | Yes — LEFT JOIN rou_data/dead_stock with MAX(uploaded_at) | FLOWING   |
| `StoreCard.tsx`             | `store` prop   | stores array from UploadPage        | Yes — passed from useStores result | FLOWING  |
| `FileStatusBadge.tsx`       | `uploadedAt`   | store.rouUploadedAt / dsUploadedAt from API | Yes — DB MAX(uploaded_at) | FLOWING  |
| `UploadModal.tsx`           | form state     | Controlled inputs + File picker    | User-provided — correct | FLOWING   |

---

## Behavioral Spot-Checks

| Behavior                                           | Command                                                         | Result                | Status  |
|----------------------------------------------------|-----------------------------------------------------------------|-----------------------|---------|
| 6 exported functions in parser.ts                  | `grep -c 'export function' apps/worker/src/lib/parser.ts`      | 6                     | PASS    |
| HEADER_ALIASES present in parser.ts                | `grep 'HEADER_ALIASES' apps/worker/src/lib/parser.ts`          | Found at line 27      | PASS    |
| BOM stripping in parser.ts                         | `grep '0xFEFF' apps/worker/src/lib/parser.ts`                  | Found at line 55      | PASS    |
| xlsx in worker package.json                        | `grep 'xlsx' apps/worker/package.json`                         | xlsx CDN tarball line 17 | PASS |
| uploadRoute mounted in index.ts                    | `grep 'uploadRoute' apps/worker/src/index.ts`                  | Lines 5, 24           | PASS    |
| Migration SQL contains ALTER TABLE                 | `cat 001-add-store-number.sql`                                 | ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_number TEXT | PASS |
| Worker test suite                                  | `cd apps/worker && npm test -- --run`                          | 4 failed / 58 passed  | FAIL    |
| Web TypeScript compilation                         | `cd apps/web && npx tsc --noEmit`                              | exits 0               | PASS    |
| All commits documented in summaries exist in git   | `git log --oneline \| grep <hashes>`                           | All 8 commits found   | PASS    |

---

## Requirements Coverage

| Requirement | Source Plan(s)       | Description                                                                                      | Status    | Evidence                                                                                        |
|-------------|----------------------|--------------------------------------------------------------------------------------------------|-----------|-------------------------------------------------------------------------------------------------|
| UPLOAD-01   | 03-01, 03-02, 03-03  | User can upload a FRED Office ROU report (CSV or XLSX) for a named store                        | SATISFIED | parseRouFile handles CSV/XLSX; POST /upload processes rouFile; UploadPage ROU file picker; human verified |
| UPLOAD-02   | 03-01, 03-02, 03-03  | User can upload a FRED Office dead stock report (CSV or XLSX) for a named store                 | SATISFIED | parseDeadStockFile handles CSV/XLSX; POST /upload processes dsFile; UploadModal dsFile picker; human verified |
| UPLOAD-03   | 03-02, 03-03         | Uploaded store data persists in NEON Postgres; no need to re-upload all stores for a new match  | SATISFIED | NEON UNNEST bulk insert; per-store delete+insert (not full table wipe); GET /stores shows timestamps |
| UPLOAD-04   | 03-02, 03-03         | User can see when each store's data was last uploaded and replace it individually               | SATISFIED | FileStatusBadge shows rouUploadedAt/dsUploadedAt; replace-confirmation amber banner in UploadModal; human verified |
| UPLOAD-05   | 03-01                | Parser handles FRED-specific CSV quirks (UTF-8 BOM, CRLF, blank title rows)                    | SATISFIED | BOM at 0xFEFF, CRLF→LF, blank line filter all in parseCSV; 4 parseCSV tests passing            |
| UPLOAD-06   | 03-01, 03-02         | Parser handles XLSX via SheetJS; enforces 5 MB per-file size cap                               | SATISFIED | SheetJS imported and used in parseXLSX; MAX_BYTES=5MB check before arrayBuffer(); 413 tests pass |

All 6 requirement IDs (UPLOAD-01 through UPLOAD-06) are accounted for. No orphaned requirements detected.

---

## Anti-Patterns Found

| File                                              | Line | Pattern                    | Severity | Impact                                                                            |
|---------------------------------------------------|------|----------------------------|----------|-----------------------------------------------------------------------------------|
| `apps/worker/src/__tests__/upload.test.ts`        | 141  | Mock call count mismatch   | Blocker  | Dead-stock upload test fails (500 instead of 200) — org upsert call not accounted for |
| `apps/worker/src/__tests__/upload.test.ts`        | 175  | Mock state leak across tests | Blocker | GET /stores tests fail due to mock exhaustion and state leak from POST tests     |
| `apps/worker/src/routes/upload.ts`                | 186  | GET /stores has no try/catch | Warning | Unhandled rejection in GET path produces raw 500 with no JSON body; upload.ts line 178 try/catch only wraps POST |

Note: `return null` at UploadModal.tsx line 109 is a standard `if (!isOpen)` gate guard — not a stub.

---

## Human Verification

Human verification was completed and APPROVED by the user during the Plan 03 Task 3 checkpoint. All 15 verification steps passed including:

1. Navigation to /upload via sidebar (SPA navigation, no page reload)
2. Empty state display ("No stores yet")
3. Add Store modal with editable name/number fields
4. Upload Files modal with read-only store fields
5. ROU file upload with store card timestamp update
6. Dead-stock file upload independently
7. Replace-confirmation amber warning for existing data
8. File >5 MB inline error message
9. Escape key and overlay click dismissal
10. Full end-to-end: file -> modal -> API -> NEON -> card refresh

This human verification constitutes functional acceptance of the upload pipeline goal. The failing automated tests are test desync issues introduced by the cc6f3c2 post-plan fix, not regressions in the production route logic.

---

## Gaps Summary

**Root cause:** A single post-plan fix (cc6f3c2) added an org FK upsert as the first `withOrgContext` call in the POST /upload handler. This was necessary for NEON FK constraint satisfaction (org row must exist before store insert). The fix was correctly applied to the production route but the test file was not updated to account for the additional mock call. This caused:

1. The dead-stock upload happy-path test to fail (mock runs out after 3 calls, outer catch returns 500)
2. All 3 GET /api/stores tests to fail (mock state not properly isolated due to call-count mismatch)

**What needs fixing:** Add one `mockResolvedValueOnce(undefined)` call before the existing mock sequence in the dead-stock test, and ensure the GET /api/stores tests have fresh, correctly sized mock sequences. No changes to production code required.

**Impact:** All production route logic is correct and human-verified end-to-end. The gap is test desync only.

---

_Verified: 2026-03-30T10:29:08Z_
_Verifier: Claude (gsd-verifier)_
