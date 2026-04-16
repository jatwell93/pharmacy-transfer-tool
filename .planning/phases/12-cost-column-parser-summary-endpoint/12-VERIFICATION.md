---
phase: 12-cost-column-parser-summary-endpoint
verified: 2026-04-17T00:00:00Z
status: human_needed
score: 11/11 must-haves verified
human_verification:
  - test: "Upload a FRED Stock Valuation XLSX with a Cost Ex column to the running app; query NEON: SELECT sku, cost_ex FROM dead_stock WHERE org_id = '<your-org>' LIMIT 5"
    expected: "cost_ex values are non-null and match the Cost Ex column in the uploaded file"
    why_human: "Requires a live NEON instance, real FRED export file, and a running Worker deployment — cannot verify DB writes without a live connection"
  - test: "Upload a FRED dead-stock report WITHOUT a Cost Ex column; query NEON: SELECT COUNT(*), COUNT(cost_ex) FROM dead_stock WHERE org_id = '<your-org>'"
    expected: "COUNT(*) > 0, COUNT(cost_ex) = 0 (all NULLs); upload completes with no error and body.warnings === []"
    why_human: "Requires live deployment and NEON access to confirm NULL writes — the unit tests mock withOrgContext so they cannot verify actual DB state"
  - test: "Authenticated GET /api/dead-stock-summary against the deployed Worker after uploading dead stock data with and without Cost Ex columns"
    expected: "Response shape { stores: [{ name, totalUnits, totalValue, hasCostData }] } with correct aggregated figures; hasCostData === false and totalValue === 0 for stores without cost data"
    why_human: "Requires a live Clerk JWT, live Worker, and live NEON — integration tests mock the DB layer; end-to-end shape must be verified against the real NEON HTTP driver boolean/numeric serialization"
---

# Phase 12: Cost Column Parser + Summary Endpoint Verification Report

**Phase Goal:** A dead stock file uploaded with a Cost Ex column has its per-unit cost stored in NEON, and the GET /api/dead-stock-summary endpoint returns per-store unit totals and dollar values that both the charts and cost report can consume.
**Verified:** 2026-04-17T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | parseDeadStockFile extracts costEx from a Cost Ex column when present (D-01, D-04) | VERIFIED | `parser.ts` line 311-313: `const hasCostColumn = colMap["Cost Ex"] !== undefined;` + `const costEx = hasCostColumn ? parseFloat(row[colMap["Cost Ex"]] ?? "") : NaN;`. 7 unit tests in `parseDeadStockFile cost_ex extraction` describe block all cover this path. |
| 2 | parseDeadStockFile returns costEx: NaN for every row when Cost Ex header is absent — no error thrown (COST-01, D-04) | VERIFIED | `parser.ts` line 282: `const hasCostColumn = colMap["Cost Ex"] !== undefined;` — header-level absence detection; NaN branch falls through `parseFloat("")` or `hasCostColumn === false`. Test 2 in parser.test.ts asserts `Number.isNaN(result[0].costEx) === true` for absent column. |
| 3 | POST /upload writes non-null cost_ex values to dead_stock for files with a Cost Ex column | VERIFIED | `upload.ts` lines 185-203: `costs` array built with `NaN → null, negative → null, otherwise r.costEx`; INSERT includes `cost_ex` column with `unnest(${costs}::float8[])`. Test A confirms `mockedWithOrgContext` called 5 times and `body.warnings === []`. |
| 4 | POST /upload writes NULL cost_ex for files without a Cost Ex column (no upload error) | VERIFIED | `upload.ts` costs array: `if (Number.isNaN(r.costEx)) return null;` — NaN (column absent) maps to null. Test B confirms 200 + `warnings === []` for CSV with no Cost Ex column. |
| 5 | POST /upload emits a DataQualityWarning with field: 'cost' for negative cost_ex rows and stores those rows as NULL (D-09) | VERIFIED | `upload.ts` lines 163-172: loop emits `{ sku, field: "cost", reason: "cost_ex is negative..." }` for `row.costEx < 0`; costs array maps negative to null (line 188). Test C confirms `body.warnings.find(w => w.sku === "NEG").field === "cost"` and `ABC` has no warning. |
| 6 | Zero cost_ex values are stored as 0 (not NULL) per D-08 | VERIFIED | `upload.ts` cost mapping: `if (Number.isNaN(r.costEx)) return null; if (r.costEx < 0) return null; return r.costEx;` — zero passes through. Test D confirms `body.warnings === []` for zero-cost row. Parser Test 4 confirms `result[0].costEx === 0`. |
| 7 | GET /api/dead-stock-summary returns { stores: [{ name, totalUnits, totalValue, hasCostData }] } per D-06 | VERIFIED | `dead-stock-summary.ts` lines 47-54: `c.json({ stores: rows.map((r) => ({ name, totalUnits: Number(...), totalValue: Number(...), hasCostData: Boolean(...) })) })`. Tests 1-3 in `dead-stock-summary.test.ts` confirm shape and values. |
| 8 | totalValue equals SUM(cost_ex * soh) per store, computed via FILTER (COST-02) | VERIFIED | `dead-stock-summary.ts` line 35: `COALESCE(SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL), 0) AS total_value`. Test 1 confirms `totalValue: 1102.5` for mocked Balwyn row. |
| 9 | hasCostData is JS boolean true iff at least one non-null cost_ex row exists for that store per D-11 | VERIFIED | `dead-stock-summary.ts` line 36: `(COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0) AS has_cost_data`; wrapped with `Boolean(r.has_cost_data)`. Test 5 verifies string "true" is coerced to boolean `true`. |
| 10 | When no store has cost data, every store entry has hasCostData === false and totalValue === 0 (no error) per COST-04 | VERIFIED | Test 2 in `dead-stock-summary.test.ts` asserts `body.stores.every(s => s.hasCostData === false)` and `body.stores.every(s => s.totalValue === 0)`. |
| 11 | useDeadStockSummary hook exposes { summary, loading, error, refetch } (D-13) | VERIFIED | `useDeadStockSummary.ts` line 47: `return { summary, loading, error, refetch };`. `refetch` is `useCallback`; `fetchApi('/api/dead-stock-summary')` exact endpoint. TypeScript compilation exits 0. |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/worker/src/lib/parser.ts` | DeadStockRow.costEx field; parseDeadStockFile cost extraction | VERIFIED | Line 24: `costEx: number;` in DeadStockRow. Line 282: `const hasCostColumn = ...`. Line 311: `parseFloat(row[colMap["Cost Ex"]] ?? "")`. Line 315: `result.push({ sku, description, soh, isRanged, costEx })`. |
| `apps/worker/src/routes/upload.ts` | dead_stock INSERT with cost_ex column; warnings array in response | VERIFIED | Line 17: `import type { DataQualityWarning } from '../matcher';`. Line 29: `const warnings: DataQualityWarning[] = [];`. Lines 163-172: negative-cost warning loop. Lines 196-204: INSERT with `cost_ex` + `unnest(${costs}::float8[])`. Line 209: response includes `warnings`. |
| `apps/worker/src/__tests__/parser.test.ts` | Cost Ex column unit tests (present, absent, negative, zero) | VERIFIED | Lines 246-308: `describe("parseDeadStockFile cost_ex extraction", ...)` with 7 named `it(...)` tests covering all specified cases. |
| `apps/worker/src/__tests__/upload.test.ts` | Updated mock sequences + warnings assertions for cost paths | VERIFIED | Lines 198-322: `describe("POST /api/upload — Cost Ex column", ...)` with 4 tests (A, B, C, D). Tests assert `body.warnings` in every case. |
| `apps/worker/src/routes/dead-stock-summary.ts` | GET /dead-stock-summary Hono route handler | VERIFIED | 62 lines. Exports `summaryRoute` default. Contains FILTER aggregation SQL. Defensive `Number()` and `Boolean()` coercions. Error handler returns static string. |
| `apps/worker/src/index.ts` | Registers summaryRoute under /api | VERIFIED | Line 8: `import summaryRoute from './routes/dead-stock-summary';`. Line 35: `app.route('/api', summaryRoute);` — positioned AFTER `app.use('/api/*', clerkAuth, requireOrg)` on line 28. |
| `apps/worker/src/__tests__/dead-stock-summary.test.ts` | Integration tests for summary endpoint (cost present, absent, mixed, empty) | VERIFIED | 7 `it(...)` cases: happy path, no-cost (COST-04), mixed, empty, string-boolean coercion, string-number coercion, DB error. Contains `typeof ... === "boolean"`, `typeof ... === "number"`, and `mockRejectedValueOnce`. |
| `apps/web/src/hooks/useDeadStockSummary.ts` | React hook returning DeadStockSummary + refetch | VERIFIED | Exports `useDeadStockSummary`, `DeadStockSummary`, `StoreSummary`. `refetch` is `useCallback`. Auto-fetch via `useEffect`. TypeScript compilation exits 0. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `parser.ts parseDeadStockFile` | `upload.ts dead_stock UNNEST INSERT` | `DeadStockRow.costEx → costs array → unnest(${costs}::float8[])` | WIRED | `upload.ts` line 185-203 builds `costs` from `r.costEx`; INSERT at line 196 includes `cost_ex` column with `unnest(${costs}::float8[])`. Grep confirmed exact pattern. |
| `upload.ts response` | Frontend (Phase 13/14) | `JSON warnings: DataQualityWarning[]` | WIRED | `upload.ts` line 209: `return c.json({ ok: true, storeId, storeName, rouRows: rouRowCount, dsRows: dsRowCount, warnings });` — `warnings` field present in every response path. |
| `dead-stock-summary.ts` | NEON dead_stock + stores tables | `withOrgContext SQL with FILTER aggregation` | WIRED | Line 35: `SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL)` confirmed in file. |
| `index.ts` | `summaryRoute` | `app.route('/api', summaryRoute)` | WIRED | Line 8 import + line 35 registration. Registered after auth middleware line 28. |
| `useDeadStockSummary.ts` | `/api/dead-stock-summary` | `fetchApi('/api/dead-stock-summary')` | WIRED | Line 34: `const res = await fetchApi('/api/dead-stock-summary');` — exact endpoint path match. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `dead-stock-summary.ts` | `rows` (stores aggregate) | `withOrgContext` SQL LEFT JOIN `dead_stock` | Yes — `SUM(cost_ex * soh)` + `COUNT(cost_ex)` with FILTER clauses; COALESCE(0) for empty stores | FLOWING |
| `upload.ts` (dead-stock branch) | `costs` array | `rows.map(r => r.costEx)` from `parseDeadStockFile` | Yes — maps real parsed values; NaN and negative → null; zero and positive → stored value | FLOWING |
| `useDeadStockSummary.ts` | `summary` state | `fetchApi('/api/dead-stock-summary')` → `setSummary(data)` | Yes — data sourced from Worker endpoint; `null` only before first fetch settles | FLOWING |

---

### Behavioral Spot-Checks

All checks verified via 107-test vitest suite (0 failures). Server-dependent checks routed to human verification.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 107 worker tests pass | `cd apps/worker && rtk vitest run` | PASS (107) FAIL (0), 11140ms | PASS |
| apps/web TypeScript compiles cleanly | `cd apps/web && rtk tsc --noEmit` | 0 errors | PASS |
| 7 parser cost_ex tests in dedicated describe block | Grep `describe("parseDeadStockFile cost_ex extraction"` in parser.test.ts | Lines 246-308 found, 7 `it(...)` cases | PASS |
| 4 upload Cost Ex tests in dedicated describe block | Grep `describe("POST /api/upload — Cost Ex column"` in upload.test.ts | Lines 198-322 found, 4 `it(...)` cases | PASS |
| 7 summary tests in dedicated describe block | Grep `describe("GET /api/dead-stock-summary"` in dead-stock-summary.test.ts | Lines 44-165 found, 7 `it(...)` cases | PASS |
| summaryRoute registered after auth middleware | Line ordering in index.ts | auth middleware line 28, summaryRoute line 35 | PASS |
| Live NEON write verification (cost_ex column) | Manual DB query post-deploy | Not runnable — requires live Worker + NEON | SKIP |
| End-to-end GET /api/dead-stock-summary (live JWT) | curl with Clerk JWT against deployed Worker | Not runnable — requires live deployment | SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COST-01 | 12-01-PLAN.md | Dead stock upload accepts optional "Cost Ex" column; absence detected at header level; no upload error | SATISFIED | `hasCostColumn = colMap["Cost Ex"] !== undefined` (parser.ts line 282); NaN → null in costs array; Tests B + parser Test 2 confirm no error when column absent |
| COST-02 | 12-02-PLAN.md | When cost data present, dead stock dollar value displayed per store (`SUM(Cost Ex × SOH)`) | SATISFIED | `SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL)` in dead-stock-summary.ts line 35; `totalValue: Number(r.total_value)` in response; Test 1 confirms value |
| COST-04 | 12-02-PLAN.md | When cost column absent from upload, cost report shows instructional message to re-upload using FRED Stock Valuation format | PARTIAL (data layer satisfied, UI wiring deferred) | `hasCostData: Boolean(r.has_cost_data)` provides the signal; Phase 12 delivers the data contract; UI consumption deferred to Phase 14 per D-12. Test 2 confirms hasCostData === false when no cost data |

**Note on COST-04:** The requirement has two parts: (a) the backend signal — `hasCostData: false` in the summary response — and (b) the frontend rendering of the instructional message. Part (a) is fully satisfied in Phase 12. Part (b) is explicitly Phase 14 work per ROADMAP.md Phase 14 goal and REQUIREMENTS.md Phase assignment. This is not a gap.

---

### Anti-Patterns Found

No anti-patterns detected across all Phase 12 modified files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODOs, FIXMEs, placeholder returns, empty handlers, or hardcoded stubs detected | — | — |

Additional checks:
- `parseRouFile` unchanged — no Cost Ex logic added (confirmed: no `costEx` in ROU branch)
- `HEADER_ALIASES` unchanged — existing `"Cost Ex"` entry preserved (line 40)
- GET /stores handler unchanged — no cost_ex or warnings logic in that branch
- ROU upload branch unchanged — `warnings` array only populated in dead-stock branch

---

### Human Verification Required

#### 1. Live DB Write — Cost Ex Column Present

**Test:** Upload a FRED Stock Valuation XLSX file containing a "Cost Ex" column via the app's upload page for any store. In NEON SQL editor, run: `SELECT sku, soh, cost_ex FROM dead_stock WHERE org_id = '<your-org>' LIMIT 5`
**Expected:** `cost_ex` values are non-null floating point numbers matching the Cost Ex column values in the uploaded file.
**Why human:** Requires a live NEON connection, real FRED export, and deployed Worker. Unit tests mock `withOrgContext` and cannot verify actual DB state.

#### 2. Live DB Write — Cost Ex Column Absent

**Test:** Upload a FRED dead-stock report that does NOT include a Cost Ex column. In NEON SQL editor, run: `SELECT COUNT(*), COUNT(cost_ex) FROM dead_stock WHERE org_id = '<your-org>'`
**Expected:** `COUNT(*) > 0` (rows exist), `COUNT(cost_ex) = 0` (all cost_ex values are NULL). Upload completes with HTTP 200 and `warnings: []`.
**Why human:** Same as above — DB NULL writes cannot be asserted without a live connection.

#### 3. Live Endpoint — GET /api/dead-stock-summary

**Test:** With stores that have dead stock data (some with Cost Ex, some without), make an authenticated GET to `/api/dead-stock-summary` using a valid Clerk JWT.
**Expected:** Response body matches `{ stores: [{ name: string, totalUnits: number, totalValue: number, hasCostData: boolean }] }`. Stores with cost data have `hasCostData: true` and non-zero `totalValue`. Stores without cost data have `hasCostData: false` and `totalValue: 0`. All numeric fields are JS numbers (not strings); `hasCostData` is a JS boolean (not a string). No error.
**Why human:** Requires live deployment. Also validates the `Boolean()` / `Number()` defensive coercions work correctly against the real NEON HTTP driver's actual serialization behaviour — the unit tests mock the DB layer and cannot confirm this.

---

### Gaps Summary

No gaps found. All 11 must-haves are verified at the code level.

The only open items are live-environment checks (human verification items above) that are standard final-UAT steps for any backend + DB phase. These cannot be automated without a live deployment.

**COST-04 UI rendering** (instructional message on cost panel when hasCostData === false) is intentionally deferred to Phase 14 per ROADMAP.md and REQUIREMENTS.md. The data signal (`hasCostData` field) is fully implemented and tested in Phase 12.

---

_Verified: 2026-04-17T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
