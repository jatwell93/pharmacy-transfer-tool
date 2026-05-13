# Phase 12: Cost Column Parser + Summary Endpoint - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the dead stock parser to extract the optional Cost Ex (unit cost excl. GST) column from uploaded FRED Stock Valuation reports and persist it to NEON. Build a GET /api/dead-stock-summary Worker endpoint that returns per-store unit totals and dollar values. Build the useDeadStockSummary hook in apps/web. This phase produces the data layer consumed by Charts (Phase 13) and Cost Report UI (Phase 14). No UI components are built in this phase.

</domain>

<decisions>
## Implementation Decisions

### FRED Cost Ex Header Aliases
- **D-01:** `"Cost Ex"` is confirmed as the exact column header in FRED Stock Valuation exports — validated against `sample-data/Stock Valuation.xlsx`.
- **D-02:** Alias list `["Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"]` is retained with `"Cost Ex"` as the primary (validated). Other entries are reasonable fallbacks.
- **D-03:** Additional FRED Stock Valuation columns (Department, Category, Retail, SOH $, Alias) are silently dropped by the existing `buildColumnMap` pattern — no change needed.
- **D-04:** Cost Ex column absence is detected at the header level (check `colMap["Cost Ex"] !== undefined`), not the row level. Set a `hasCostColumn` boolean flag before iterating data rows. Do NOT infer absence from `undefined` cell values — SheetJS returns `undefined` for both a missing column and a blank cell in a present column.

### Cost Presence Signal in Summary Endpoint
- **D-05:** Summary response includes explicit `hasCostData: boolean` per store — NOT relying on `totalValue === 0` as the signal. `hasCostData` is `true` only when at least one non-null `cost_ex` row exists for that store in the DB.
- **D-06:** Response shape: `{ stores: [{ name: string, totalUnits: number, totalValue: number, hasCostData: boolean }] }`
- **D-07:** Frontend COST-04 instructional message logic: `stores.every(s => !s.hasCostData)` → show "Re-upload using FRED Stock Valuation report format to see dollar values".

### Negative and Zero Cost Handling
- **D-08:** Zero `cost_ex` values are **valid** — they represent samples, donations, or zero-margin items in FRED. Stored as-is. Included in `SUM` aggregation.
- **D-09:** Negative `cost_ex` values are a data entry error. Surface as `DataQualityWarning` in the POST /upload response (same pattern as NaN ROU warnings). `DataQualityWarning.field` is already typed as `"rou" | "soh" | "cost"` — use `"cost"`.
- **D-10:** Summary SQL uses `SUM(cost_ex) FILTER (WHERE cost_ex IS NOT NULL)` — nulls excluded, zeros included. Plain `SUM` across mixed NULL/valued rows returns NULL, not the sum.
- **D-11:** `hasCostData` SQL: `COUNT(cost_ex) FILTER (WHERE cost_ex IS NOT NULL) > 0` — true if any non-null cost exists for the store.

### Summary Hook Data Flow
- **D-12:** Per-page instantiation — UploadPage and MatchPage each call `useDeadStockSummary()` independently. No shared context or prop drilling. Two small network calls are acceptable.
- **D-13:** Hook exposes a `refetch()` function (same pattern as `useStores`). UploadPage calls `refetch()` immediately after a successful POST /upload response (`ok: true`). Pie chart updates without a page reload.
- **D-14:** MatchPage calls `useDeadStockSummary()` on mount. No re-fetch needed after match run (summary data is pre-match upload state, not match-derived).

### Claude's Discretion
- SQL index choice for the summary query aggregation
- Exact vitest integration test setup for the summary endpoint
- TypeScript return type naming for the summary response

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema and DB patterns
- `apps/worker/src/db/schema.sql` — dead_stock table definition (cost_ex DOUBLE PRECISION, nullable); RLS policy pattern; UNNEST INSERT pattern not here but in upload.ts
- `apps/worker/src/db/client.ts` — withOrgContext wrapper; synchronous callback constraint

### Parser and upload (files to extend)
- `apps/worker/src/lib/parser.ts` — DeadStockRow interface to extend; HEADER_ALIASES (Cost Ex already listed at line 39); parseDeadStockFile to extend; buildColumnMap and findHeaderRow reused as-is
- `apps/worker/src/routes/upload.ts` — dead_stock UNNEST INSERT pattern (lines 167–186) to extend with cost_ex column

### Warning infrastructure
- `apps/worker/src/matcher.ts` — DataQualityWarning interface (field: "rou" | "soh" | "cost" already typed); MatchTransfersResult.warnings[] pattern — reuse for upload response warnings

### Hook patterns to follow
- `apps/web/src/hooks/useStores.ts` — refetch() pattern; useFetch composition
- `apps/web/src/hooks/useFetch.ts` — base fetch hook

### Route registration
- `apps/worker/src/index.ts` — route mount pattern; new dead-stock-summary route registered under /api

### Requirements
- `.planning/REQUIREMENTS.md` §COST-01, COST-02, COST-04 — acceptance criteria for this phase

### Validated sample data
- `sample-data/Stock Valuation.xlsx` — real FRED Stock Valuation export; confirms Cost Ex column header and data shape (columns: Item Code, Department, Category, Item Description, Cost Ex, Retail, SOH, SOH $, Alias)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataQualityWarning` interface in `matcher.ts` — already has `field: "cost"` variant; import and reuse in upload route for negative cost warnings
- `buildColumnMap` + `findHeaderRow` in `parser.ts` — reused as-is; just extend `parseDeadStockFile` to extract `colMap["Cost Ex"]`
- `withOrgContext` in `db/client.ts` — all DB calls go through this; summary endpoint follows same pattern
- `useFetch` hook — base for `useDeadStockSummary`; follow `useStores` composition pattern

### Established Patterns
- UNNEST bulk INSERT: `unnest(${array}::type[])` — used in both ROU and dead_stock INSERTs; extend dead_stock INSERT to add `cost_ex` column with `unnest(${costs}::float8[])`
- `hasCostColumn` flag set at header level before row iteration (per D-04 and roadmap pitfall)
- NaN handling: `parseFloat` produces `NaN` for non-numeric — same approach for `cost_ex`; `NaN` stored as NULL in Postgres (float8 NaN is valid but use null for missing data)
- camelCase JSON keys in all responses (e.g., `hasCostData`, `totalUnits`, `totalValue`)

### Integration Points
- `apps/worker/src/index.ts` — register new `summaryRoute` under `/api` (same pattern as uploadRoute, matchRoute)
- `apps/web/src/pages/UploadPage.tsx` — call `useDeadStockSummary()` + `refetch()` after upload
- `apps/web/src/pages/MatchPage.tsx` — call `useDeadStockSummary()` on mount

</code_context>

<specifics>
## Specific Ideas

- FRED Stock Valuation format confirmed: `Item Code, Department, Category, Item Description, Cost Ex, Retail, SOH, SOH $, Alias` — parser only needs Item Code + Cost Ex (SOH already from the dead stock upload flow; the Stock Valuation file may be uploaded as the dead-stock file or alongside it)
- The `cost_ex` values in the sample file include zeros (e.g. `NOVOFINE NDLE 30GX8 100` has `Cost Ex: 0`) — confirmed these are legitimate zero-cost items, not data errors

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-cost-column-parser-summary-endpoint*
*Context gathered: 2026-04-16*
