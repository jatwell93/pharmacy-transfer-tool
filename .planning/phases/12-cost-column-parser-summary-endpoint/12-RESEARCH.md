# Phase 12: Cost Column Parser + Summary Endpoint — Research

**Researched:** 2026-04-16
**Domain:** TypeScript parser extension, NEON SQL aggregation, Hono Worker route, React hook
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `"Cost Ex"` is the confirmed exact column header in FRED Stock Valuation exports — validated against `sample-data/Stock Valuation.xlsx`.
- **D-02:** Alias list `["Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"]` is retained with `"Cost Ex"` as the primary (validated). Other entries are reasonable fallbacks.
- **D-03:** Additional FRED Stock Valuation columns (Department, Category, Retail, SOH $, Alias) are silently dropped by the existing `buildColumnMap` pattern — no change needed.
- **D-04:** Cost Ex column absence is detected at the header level (check `colMap["Cost Ex"] !== undefined`), not the row level. Set a `hasCostColumn` boolean flag before iterating data rows. Do NOT infer absence from `undefined` cell values — SheetJS returns `undefined` for both a missing column and a blank cell in a present column.
- **D-05:** Summary response includes explicit `hasCostData: boolean` per store — NOT relying on `totalValue === 0` as the signal. `hasCostData` is `true` only when at least one non-null `cost_ex` row exists for that store in the DB.
- **D-06:** Response shape: `{ stores: [{ name: string, totalUnits: number, totalValue: number, hasCostData: boolean }] }`
- **D-07:** Frontend COST-04 instructional message logic: `stores.every(s => !s.hasCostData)` → show "Re-upload using FRED Stock Valuation report format to see dollar values".
- **D-08:** Zero `cost_ex` values are **valid** — they represent samples, donations, or zero-margin items in FRED. Stored as-is. Included in `SUM` aggregation.
- **D-09:** Negative `cost_ex` values are a data entry error. Surface as `DataQualityWarning` in the POST /upload response (same pattern as NaN ROU warnings). `DataQualityWarning.field` is already typed as `"rou" | "soh" | "cost"` — use `"cost"`.
- **D-10:** Summary SQL uses `SUM(cost_ex) FILTER (WHERE cost_ex IS NOT NULL)` — nulls excluded, zeros included. Plain `SUM` across mixed NULL/valued rows returns NULL, not the sum.
- **D-11:** `hasCostData` SQL: `COUNT(cost_ex) FILTER (WHERE cost_ex IS NOT NULL) > 0` — true if any non-null cost exists for the store.
- **D-12:** Per-page instantiation — UploadPage and MatchPage each call `useDeadStockSummary()` independently. No shared context or prop drilling. Two small network calls are acceptable.
- **D-13:** Hook exposes a `refetch()` function (same pattern as `useStores`). UploadPage calls `refetch()` immediately after a successful POST /upload response (`ok: true`). Pie chart updates without a page reload.
- **D-14:** MatchPage calls `useDeadStockSummary()` on mount. No re-fetch needed after match run (summary data is pre-match upload state, not match-derived).

### Claude's Discretion

- SQL index choice for the summary query aggregation
- Exact vitest integration test setup for the summary endpoint
- TypeScript return type naming for the summary response

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COST-01 | Dead stock upload accepts an optional "Cost Ex" column (unit cost excl. GST from FRED Stock Valuation report); absence detected at header level; does not cause upload errors | Parser extension pattern (D-04); `hasCostColumn` flag before row iteration; UNNEST INSERT with nullable float8 column already exists in schema |
| COST-02 | When cost data is present, dead stock dollar value is displayed per store (`SUM(Cost Ex × SOH)` per store's dead stock SKUs) | Summary endpoint with `SUM(cost_ex * soh)` — note: cost_ex is per-unit cost; multiply by soh for dollar value; D-10 SQL pattern; D-06 response shape |
| COST-04 | When cost column is absent from the upload, cost report panel shows an instructional message to re-upload using FRED Stock Valuation report format | `hasCostData: boolean` per store (D-05, D-11); `stores.every(s => !s.hasCostData)` logic (D-07); hook returns data that MatchPage and UploadPage consume |

</phase_requirements>

---

## Summary

Phase 12 extends two existing layers — the dead stock file parser and the upload route — and adds one new layer: a summary aggregation endpoint and its React hook. All three layers have clear precedent in the codebase and require no new dependencies.

The parser extension (`parser.ts`) follows an already-established pattern: `HEADER_ALIASES["Cost Ex"]` already exists at line 39, `buildColumnMap` already returns a column index map, and the only addition is reading `colMap["Cost Ex"]` during row iteration after checking `hasCostColumn`. The upload route extension (`upload.ts`) adds a `costs` array to the existing UNNEST INSERT, following the identical pattern used for `ranged` (boolean[]) and `sohs` (float8[]). The `cost_ex DOUBLE PRECISION` column already exists in `dead_stock` in `schema.sql` — no DDL migration is required.

The summary endpoint is a new Hono route file (`routes/dead-stock-summary.ts`) that makes one `withOrgContext` call returning a `GROUP BY store` aggregation. The `useDeadStockSummary` hook in `apps/web` follows the `useStores` composition pattern exactly: `useFetch` + `useState` + `useCallback` + `useEffect` + exposed `refetch()`.

**Primary recommendation:** Implement in the order specified in the two plans: parser/upload (12-01) then endpoint/hook (12-02). Both plans are largely additive; the parser and upload route are the riskiest touch points and should be unit-tested first.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xlsx` (SheetJS) | 0.20.3 (CDN tarball) | XLSX parsing | Already installed in `apps/worker`; used by `parseXLSX` |
| `@neondatabase/serverless` | installed | NEON HTTP driver | Already the DB client; `withOrgContext` wraps all queries |
| `hono` | installed | Worker HTTP framework | All routes use Hono; `new Hono<{ Bindings: Env; Variables: Variables }>()` pattern |
| `vitest` + `@cloudflare/vitest-pool-workers` | installed | Worker unit/integration tests | `vitest.config.ts` already configured with `cloudflarePool` |

[VERIFIED: codebase grep — all packages already present in `apps/worker/package.json` and `apps/worker/node_modules/`]

### No New Dependencies Required

This phase is purely additive code. No `npm install` step is needed.

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
apps/worker/src/
├── lib/
│   └── parser.ts              # EXTEND: DeadStockRow + parseDeadStockFile
├── routes/
│   ├── upload.ts              # EXTEND: dead_stock UNNEST INSERT adds cost_ex
│   └── dead-stock-summary.ts  # NEW: GET /dead-stock-summary route
├── index.ts                   # EXTEND: register summaryRoute under /api
└── __tests__/
    ├── parser.test.ts         # EXTEND: add cost_ex test cases
    └── dead-stock-summary.test.ts  # NEW: integration tests

apps/web/src/hooks/
└── useDeadStockSummary.ts     # NEW: follows useStores pattern
```

### Pattern 1: Header-Level Column Detection (D-04)

**What:** Check whether a column exists at the header row level, before iterating data rows, and set a boolean flag.

**When to use:** Any optional column in a FRED file where absence must not cause an error and must be distinguished from a present-but-empty column.

**Why this matters:** SheetJS `parseXLSX` uses `defval: ""` which means both an absent column AND a blank cell return `""`. The only reliable way to distinguish them is to check whether `colMap["Cost Ex"] !== undefined` against the header row.

**Example:**
```typescript
// Source: apps/worker/src/lib/parser.ts (adapted pattern from isRanged column)
const colMap = buildColumnMap(rows[headerIdx]);

// D-04: detect absence at header level, not row level
const hasCostColumn = colMap["Cost Ex"] !== undefined;

for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i];
  // ...
  const costEx = hasCostColumn
    ? parseFloat(row[colMap["Cost Ex"]] ?? "")
    : NaN; // NaN → stored as NULL in Postgres

  result.push({ sku, description, soh, isRanged, costEx });
}
```

[VERIFIED: codebase — `buildColumnMap` returns `Record<string, number>` where missing keys are `undefined`; `colMap["Ranged"] !== undefined` used in existing `isRanged` logic at parser.ts lines 237, 295]

### Pattern 2: UNNEST Bulk INSERT with Nullable Column

**What:** Add an additional typed array to the UNNEST INSERT SQL, including nulls for absent values.

**When to use:** Any new optional column added to an existing bulk INSERT.

**Example:**
```typescript
// Source: apps/worker/src/routes/upload.ts lines 167-186 (adapted)
const skus = rows.map((r) => r.sku);
const descriptions = rows.map((r) => r.description);
const sohs = rows.map((r) => r.soh);
const ranged = rows.map((r) => r.isRanged);
const costs = rows.map((r) =>
  Number.isNaN(r.costEx) ? null : r.costEx
);

await withOrgContext<void>(
  dbUrl,
  orgId,
  (tx) => tx`
    INSERT INTO dead_stock (org_id, store_id, sku, description, soh, is_ranged, cost_ex, uploaded_at)
    SELECT ${orgId}, ${storeId}::uuid,
           unnest(${skus}::text[]),
           unnest(${descriptions}::text[]),
           unnest(${sohs}::float8[]),
           unnest(${ranged}::boolean[]),
           unnest(${costs}::float8[]),
           NOW()
  `,
);
```

**Note on NaN → NULL:** `parseFloat` returns `NaN` for non-numeric input. Postgres `float8` can technically store NaN, but the project convention (established in Phase 3) is that NaN means "missing data" — convert to `null` before INSERT. Apply the same `Number.isNaN(r.costEx) ? null : r.costEx` pattern used for rou/soh.

[VERIFIED: codebase — existing pattern at upload.ts lines 119-139 (ROU INSERT) and lines 167-186 (dead_stock INSERT); NaN handling decision documented in STATE.md Phase 3]

### Pattern 3: DataQualityWarning for Negative Cost (D-09)

**What:** Surface negative `cost_ex` values as a `DataQualityWarning` in the upload response body, not as a 400 error.

**When to use:** Data quality issues that should not block the upload but should be visible to the user.

**Example:**
```typescript
// Source: apps/worker/src/matcher.ts lines 48-52 (DataQualityWarning interface)
// import { DataQualityWarning } from '../matcher';

const warnings: DataQualityWarning[] = [];

// In the row-processing loop, after parsing costEx:
if (!Number.isNaN(costEx) && costEx < 0) {
  warnings.push({
    sku,
    field: "cost",
    reason: "cost_ex is negative — likely a data entry error in FRED",
  });
  // Store as null rather than the negative value
  costs.push(null);
} else {
  costs.push(Number.isNaN(costEx) ? null : costEx);
}
```

**Upload response extension:** The existing `/upload` response is `{ ok: true, storeId, storeName, rouRows, dsRows }`. Add `warnings: DataQualityWarning[]` to this response so the frontend can display them. The existing `DataQualityWarning` interface in `matcher.ts` already includes `field: "cost"` [VERIFIED: matcher.ts line 51].

### Pattern 4: Summary Aggregation Endpoint (New Hono Route)

**What:** A GET route that aggregates `dead_stock` per store using `GROUP BY` with `FILTER` clauses for null-safe aggregation.

**SQL pattern (D-10, D-11):**
```sql
SELECT
  s.name,
  COALESCE(SUM(d.soh) FILTER (WHERE d.soh IS NOT NULL), 0) AS total_units,
  COALESCE(SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL), 0) AS total_value,
  COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0 AS has_cost_data
FROM stores s
LEFT JOIN dead_stock d ON d.store_id = s.id
WHERE s.org_id = ${orgId}
GROUP BY s.id, s.name
ORDER BY s.name ASC
```

**Why `SUM(cost_ex * soh)` not `SUM(cost_ex)`:** COST-02 requires dollar value per store which is `unit_cost × SOH` per SKU, summed. `cost_ex` is per-unit cost; multiplying by `soh` gives total stock value for that SKU row.

**Why `COALESCE(..., 0)`:** When a store exists but has no dead stock rows yet (LEFT JOIN returns no rows), `SUM` returns NULL. `COALESCE` converts that to `0` for a clean JSON response.

[VERIFIED: codebase — `FILTER (WHERE ...)` is standard PostgreSQL 9.4+ syntax; NEON is PostgreSQL 16; existing schema has `cost_ex DOUBLE PRECISION` nullable on `dead_stock` at schema.sql line 47]

**Route registration pattern:**
```typescript
// Source: apps/worker/src/index.ts lines 30-34
import summaryRoute from './routes/dead-stock-summary';
// ...
app.route('/api', summaryRoute);
```

### Pattern 5: useDeadStockSummary Hook

**What:** A React hook that fetches summary data, exposes loading/error state, and a `refetch()` function.

**Follows:** `useStores` pattern exactly (`useFetch` + `useState` + `useCallback` + `useEffect`).

**Example:**
```typescript
// Source: apps/web/src/hooks/useStores.ts (adapted)
import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';

export interface StoreSummary {
  name: string;
  totalUnits: number;
  totalValue: number;
  hasCostData: boolean;
}

export interface DeadStockSummary {
  stores: StoreSummary[];
}

export function useDeadStockSummary() {
  const fetchApi = useFetch();
  const [summary, setSummary] = useState<DeadStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/dead-stock-summary');
      if (!res.ok) throw new Error('Failed to load dead stock summary');
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => { refetch(); }, [refetch]);

  return { summary, loading, error, refetch };
}
```

**UploadPage integration (D-13):** `UploadModal` already calls `onUploadComplete` (mapped to `useStores.refresh`) after a successful upload. Add `useDeadStockSummary()` to `UploadPage` and call `summaryRefetch()` inside `onUploadComplete` alongside the stores refresh.

**MatchPage integration (D-14):** Call `useDeadStockSummary()` at the top of `MatchPage`. The hook auto-fetches on mount. No re-fetch trigger needed.

[VERIFIED: codebase — `useStores.ts` lines 13-37; `UploadPage.tsx` line 97 `onUploadComplete={refresh}`; `MatchPage.tsx` already imports multiple hooks at the top]

### Anti-Patterns to Avoid

- **Inferring hasCostColumn from row-level undefined values:** SheetJS `defval: ""` means absent column cells AND blank cells both return `""`. Always check `colMap["Cost Ex"] !== undefined` against the header row. [VERIFIED: parser.ts line 141 shows `defval: ""`]
- **Using plain `SUM(cost_ex)` in SQL:** A plain SUM across mixed NULL/valued rows returns NULL when all rows are NULL (e.g., no cost data for a store). Use `SUM(cost_ex) FILTER (WHERE cost_ex IS NOT NULL)` and wrap in `COALESCE(..., 0)`. [VERIFIED: PostgreSQL docs; D-10]
- **Throwing an error when cost column is absent:** COST-01 explicitly requires that absence does NOT cause an upload error. The parser must return `NaN` (or a sentinel) for `costEx` when the column is absent, and the route must store NULL.
- **Storing NaN in Postgres float8:** While Postgres float8 technically accepts NaN, project convention is to use NULL for missing/invalid data. Convert `NaN` → `null` before the UNNEST INSERT. [VERIFIED: STATE.md Phase 3 decisions]
- **Making two separate withOrgContext calls for the summary query:** The summary is a single SQL query; it should use a single `withOrgContext` call, not chained calls.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Null-safe SQL aggregation | Custom application-layer null filtering | `SUM(...) FILTER (WHERE ... IS NOT NULL)` | Standard PostgreSQL; correct semantics; single DB roundtrip |
| Column presence detection | Row-level undefined checks | Header-level `colMap["Cost Ex"] !== undefined` | SheetJS `defval: ""` makes cell-level checks unreliable |
| Authenticated fetch in React | Custom fetch wrapper | `useFetch()` hook | Already handles Clerk token injection and stable reference pattern |
| Bulk INSERT with nulls | INSERT loop | UNNEST with `::float8[]` (nulls allowed) | Existing pattern; Postgres UNNEST accepts nulls in typed arrays |

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is not a rename/refactor/migration phase. It is a feature-addition phase. No runtime state items need auditing.

---

## Common Pitfalls

### Pitfall 1: SheetJS `defval` Masking Column Absence

**What goes wrong:** Developer checks `row[colMap["Cost Ex"]]` at row level and gets `""` for both absent column AND a blank cell value. The `hasCostColumn` flag is bypassed, and `parseFloat("")` returns `NaN`, so all rows end up with `costEx: NaN` even when the column was present but blank.

**Why it happens:** `parseXLSX` passes `defval: ""` to `sheet_to_json`. This fills every cell — including cells in columns that don't exist in the sheet — with `""`. The column map only records indices for headers that appear in the actual header row.

**How to avoid:** Set `hasCostColumn = colMap["Cost Ex"] !== undefined` BEFORE the row iteration loop (D-04). Inside the loop: if `!hasCostColumn`, skip cost parsing entirely and push `NaN` (becomes NULL in DB). Do not rely on undefined/empty cell values.

**Warning signs:** All rows have `costEx: NaN` even in a file that clearly has a Cost Ex column with numeric values.

[VERIFIED: codebase — parser.ts line 141 `defval: ""`; `colMap["Ranged"] !== undefined` check at parser.ts lines 237, 295 for the identical optional-column pattern]

### Pitfall 2: withOrgContext Synchronous Callback Constraint

**What goes wrong:** Developer puts an `await` inside the `withOrgContext` callback, causing a TypeScript type error or runtime failure.

**Why it happens:** The NEON HTTP transaction API requires a synchronous callback that returns an array of `NeonQueryInTransaction` items. The `fn` parameter is typed as synchronous.

**How to avoid:** The summary route makes a single query — pass it directly: `(tx) => tx\`SELECT ...\``. No async logic inside the callback. [VERIFIED: codebase — client.ts lines 16-18; STATE.md "NEON withOrgContext uses synchronous tx callback"]

### Pitfall 3: Mock Sequence Must Match withOrgContext Call Count

**What goes wrong:** `upload.test.ts` tests fail with "No mock implementation" or return `undefined` unexpectedly after the new `cost_ex` column is added to the dead_stock INSERT.

**Why it happens:** The dead-stock INSERT doesn't change the number of `withOrgContext` calls (it's still 1 call to DELETE + 1 call to INSERT = 2 calls for the DS branch). However, the mock sequences in existing dead-stock upload tests must still match. After adding `cost_ex` to the INSERT SQL, the call count stays the same.

**How to avoid:** Count `withOrgContext` calls in the updated upload handler and verify existing test mock sequences still match. Add a comment in the test file noting the call order (project convention from STATE.md Phase 3). [VERIFIED: codebase — upload.test.ts line 174 existing DS test mock sequence has 4 calls; call count does not change with the SQL extension]

### Pitfall 4: `SUM(cost_ex * soh)` returns NULL for stores with no dead stock rows

**What goes wrong:** A store exists in the `stores` table but has no `dead_stock` rows (uploaded ROU file only, no dead stock yet). The LEFT JOIN produces no matching rows, and `SUM(...)` returns NULL. The JSON response contains `null` instead of `0`, causing frontend type errors.

**Why it happens:** PostgreSQL `SUM` of an empty set returns NULL (not 0). `FILTER` does not change this.

**How to avoid:** Wrap all aggregates in `COALESCE(..., 0)`: `COALESCE(SUM(d.cost_ex * d.soh) FILTER (...), 0)`. [VERIFIED: PostgreSQL docs behavior; D-10 notes this pattern]

### Pitfall 5: hasCostData SQL Returns a String, Not a Boolean

**What goes wrong:** `COUNT(...) > 0` in PostgreSQL returns a `boolean`. However, the NEON driver may return this as a JavaScript string `"true"` / `"false"` depending on the serialization.

**How to avoid:** Cast explicitly or check the returned type in tests. Either `(COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0)::boolean` or handle the string-to-boolean conversion in the route handler. Validate in the integration test that `hasCostData` is a JavaScript `boolean`, not a string. [ASSUMED — verify in test; NEON HTTP driver typically returns PostgreSQL `boolean` as JS `boolean`, but this should be confirmed with a test assertion]

### Pitfall 6: Upload Response Shape Break for Existing Tests

**What goes wrong:** Adding `warnings: []` to the upload response body breaks existing upload tests that assert `{ ok: true, storeId, storeName, rouRows, dsRows }` exactly.

**How to avoid:** If tests use `expect(body.ok).toBe(true)` style (field-level assertions), adding `warnings` is safe. If any test uses `expect(body).toEqual({ ok: true, ... })` (deep equality), those tests will need updating. Check existing upload tests before extending the response. [VERIFIED: codebase — upload.test.ts lines 136-138 use `body.ok`, `body.storeId`, `body.storeName` — field-level assertions; safe to extend]

---

## Code Examples

### Verified: DeadStockRow Interface Extension

```typescript
// Source: apps/worker/src/lib/parser.ts (line 19, to be extended)
export interface DeadStockRow {
  sku: string;
  description: string;
  soh: number;       // NaN if non-numeric
  isRanged: boolean;
  costEx: number;    // NEW: NaN if non-numeric or column absent
}
```

### Verified: parseDeadStockFile — cost_ex extraction

```typescript
// Source: pattern from apps/worker/src/lib/parser.ts lines 277-305
const colMap = buildColumnMap(rows[headerIdx]);

// D-04: detect Cost Ex column presence at header level
const hasCostColumn = colMap["Cost Ex"] !== undefined;

for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i];
  // ... existing sku, description, soh, isRanged logic ...

  // Cost Ex: NaN when column absent OR cell non-numeric
  const costEx = hasCostColumn
    ? parseFloat(row[colMap["Cost Ex"]] ?? "")
    : NaN;

  result.push({ sku, description, soh, isRanged, costEx });
}
```

### Verified: UNNEST INSERT Extension for cost_ex

```typescript
// Source: apps/worker/src/routes/upload.ts lines 167-186 (to be extended)
const costs = rows.map((r) =>
  // D-09: negative cost → null (with warning emitted earlier)
  // NaN → null (missing/non-numeric)
  (Number.isNaN(r.costEx) || r.costEx < 0) ? null : r.costEx
);

await withOrgContext<void>(dbUrl, orgId, (tx) => tx`
  INSERT INTO dead_stock (org_id, store_id, sku, description, soh, is_ranged, cost_ex, uploaded_at)
  SELECT ${orgId}, ${storeId}::uuid,
         unnest(${skus}::text[]),
         unnest(${descriptions}::text[]),
         unnest(${sohs}::float8[]),
         unnest(${ranged}::boolean[]),
         unnest(${costs}::float8[]),
         NOW()
`);
```

### Verified: Summary SQL Query

```sql
-- Source: pattern from apps/worker/src/routes/upload.ts GET /stores query
-- NEON Postgres 16 — FILTER clause is standard PostgreSQL 9.4+
SELECT
  s.name,
  COALESCE(SUM(d.soh) FILTER (WHERE d.soh IS NOT NULL), 0)                          AS total_units,
  COALESCE(SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL
                                              AND d.soh IS NOT NULL), 0)            AS total_value,
  (COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0)                       AS has_cost_data
FROM stores s
LEFT JOIN dead_stock d ON d.store_id = s.id
WHERE s.org_id = ${orgId}
GROUP BY s.id, s.name
ORDER BY s.name ASC
```

### Verified: Summary Route Structure

```typescript
// Source: apps/worker/src/routes/upload.ts GET /stores handler (adapted)
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';

const summaryRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

summaryRoute.get('/dead-stock-summary', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;

    const rows = await withOrgContext<Array<{
      name: string;
      total_units: number;
      total_value: number;
      has_cost_data: boolean;
    }>>(dbUrl, orgId, (tx) => tx`
      SELECT
        s.name,
        COALESCE(SUM(d.soh) FILTER (WHERE d.soh IS NOT NULL), 0) AS total_units,
        COALESCE(SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL), 0) AS total_value,
        (COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0) AS has_cost_data
      FROM stores s
      LEFT JOIN dead_stock d ON d.store_id = s.id
      WHERE s.org_id = ${orgId}
      GROUP BY s.id, s.name
      ORDER BY s.name ASC
    `);

    // camelCase JSON keys per project conventions
    return c.json({
      stores: rows.map((r) => ({
        name: r.name,
        totalUnits: Number(r.total_units),
        totalValue: Number(r.total_value),
        hasCostData: Boolean(r.has_cost_data), // defensive boolean coercion
      })),
    });
  } catch (err) {
    console.error('[dead-stock-summary] handler error:', err);
    return c.json({ error: 'Failed to load dead stock summary. Please try again.' }, 500);
  }
});

export default summaryRoute;
```

### Verified: Route Registration in index.ts

```typescript
// Source: apps/worker/src/index.ts lines 30-34 (to be extended)
import summaryRoute from './routes/dead-stock-summary';
// ... existing imports ...
app.route('/api', summaryRoute);  // add after existing routes
```

### Verified: DataQualityWarning Reuse in Upload Route

```typescript
// Source: apps/worker/src/matcher.ts lines 48-57 (import and reuse)
import type { DataQualityWarning } from '../matcher';

// In upload.ts dead-stock processing block:
const warnings: DataQualityWarning[] = [];
const costs: (number | null)[] = [];

for (const row of rows) {
  if (!Number.isNaN(row.costEx) && row.costEx < 0) {
    warnings.push({
      sku: row.sku,
      field: "cost",
      reason: "cost_ex is negative — likely a data entry error in FRED; stored as null",
    });
    costs.push(null);
  } else {
    costs.push(Number.isNaN(row.costEx) ? null : row.costEx);
  }
}

// Return warnings in upload response:
return c.json({ ok: true, storeId, storeName, rouRows: rouRowCount, dsRows: dsRowCount, warnings });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No `cost_ex` in dead_stock table | `cost_ex DOUBLE PRECISION` nullable column in schema | Phase 11 schema migration | Column already exists; no DDL needed in Phase 12 |
| Dead stock parser returns `DeadStockRow` without cost | `DeadStockRow` to be extended with `costEx: number` | Phase 12 (this phase) | Parser tests need cost_ex cases |
| Upload response has no `warnings` field | Upload response extended with `warnings: DataQualityWarning[]` | Phase 12 (this phase) | Frontend can surface negative cost warnings |

**Schema note:** `cost_ex DOUBLE PRECISION` in `dead_stock` was added in the Phase 11 schema migration (confirmed in `schema.sql` line 47). No `ALTER TABLE` is needed in this phase. [VERIFIED: schema.sql line 47]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NEON HTTP driver returns PostgreSQL `boolean` as JavaScript `boolean` (not string "true"/"false") | Pitfall 5 | `hasCostData` values in JSON response would be strings; frontend `!s.hasCostData` check would always be false; tests would surface this immediately |
| A2 | `SUM(DOUBLE PRECISION * DOUBLE PRECISION)` in PostgreSQL returns a value compatible with JSON serialization via the NEON driver (not a string representation) | Code Examples — Summary SQL | Numeric precision issues in JSON; use `Number(r.total_value)` coercion defensively |

**If this table is short:** The locked decisions in CONTEXT.md (D-01 through D-14) are based on validated sample data and codebase inspection, not assumptions. The two items above are the only unverified claims.

---

## Open Questions

1. **hasCostData boolean vs string serialization**
   - What we know: PostgreSQL boolean columns; NEON HTTP driver serializes results to JSON
   - What's unclear: Whether NEON HTTP driver returns JS `boolean` or string for PostgreSQL `boolean` type
   - Recommendation: Add a defensive `Boolean(r.has_cost_data)` coercion in the route handler (already in Code Examples above). The integration test should assert `typeof hasCostData === 'boolean'`.

---

## Environment Availability

Step 2.6: SKIPPED — no external tools, services, or CLI utilities beyond those already installed and used. All dependencies (NEON, vitest, hono, SheetJS) are already available and in use by prior phases.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest + @cloudflare/vitest-pool-workers |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && rtk vitest run` |
| Full suite command | `cd apps/worker && rtk vitest run` (all 89 tests run in ~11s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COST-01 | `parseDeadStockFile` extracts `costEx` when Cost Ex column present | unit | `cd apps/worker && rtk vitest run --reporter=verbose` | ❌ Wave 0 |
| COST-01 | `parseDeadStockFile` returns `costEx: NaN` when Cost Ex column absent | unit | same | ❌ Wave 0 |
| COST-01 | POST /upload with Cost Ex column stores non-null `cost_ex` in response | integration | same | ❌ Wave 0 |
| COST-01 | POST /upload without Cost Ex column returns `ok: true`, no error | integration | same | ❌ Wave 0 (existing test extended) |
| COST-02 | GET /dead-stock-summary returns `totalValue > 0` when cost data present | integration | same | ❌ Wave 0 |
| COST-02 | GET /dead-stock-summary `totalValue` is `SUM(cost_ex * soh)`, not just `SUM(cost_ex)` | integration | same | ❌ Wave 0 |
| COST-04 | GET /dead-stock-summary returns `hasCostData: false` for all stores when no cost | integration | same | ❌ Wave 0 |
| COST-04 | GET /dead-stock-summary returns `hasCostData: true` for stores with cost data | integration | same | ❌ Wave 0 |
| D-09 | POST /upload with negative `cost_ex` value returns `warnings` array with `field: "cost"` | integration | same | ❌ Wave 0 |
| D-08 | POST /upload with zero `cost_ex` stores 0, not null | unit/integration | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd apps/worker && rtk vitest run`
- **Per wave merge:** `cd apps/worker && rtk vitest run`
- **Phase gate:** Full suite green (89 existing + new tests) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/worker/src/__tests__/parser.test.ts` — extend with `cost_ex` test cases (add to existing file, do not create new file)
- [ ] `apps/worker/src/__tests__/upload.test.ts` — extend with dead-stock + cost_ex test cases (add to existing file)
- [ ] `apps/worker/src/__tests__/dead-stock-summary.test.ts` — new integration test file for GET /dead-stock-summary route

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Clerk JWT middleware already applied to all `/api/*` routes in `index.ts`; `summaryRoute` inherits this |
| V3 Session Management | no | Stateless JWT; no sessions |
| V4 Access Control | yes | `withOrgContext` + RLS on `dead_stock` and `stores` tables; org_id from verified JWT only (never from request body) |
| V5 Input Validation | yes (low risk) | Summary endpoint is GET with no user-controlled input beyond the JWT-derived orgId; upload extension validates `costEx` via `parseFloat` |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-org data leakage | Information Disclosure | `withOrgContext` sets `request.jwt.claims` + RLS `org_isolation` policy on `dead_stock` and `stores`; all queries are already scoped |
| Arithmetic overflow in `cost_ex * soh` | Tampering | `DOUBLE PRECISION` multiplication in PostgreSQL; overflow produces `Infinity` in JS; `Number(r.total_value)` in route handler + frontend display logic should handle this gracefully (out of scope for this phase) |

**No new security concerns:** The summary endpoint follows the exact same auth + RLS pattern as all existing authenticated routes. No new input surfaces are introduced.

---

## Sources

### Primary (HIGH confidence)

- `apps/worker/src/lib/parser.ts` — parseDeadStockFile, buildColumnMap, HEADER_ALIASES verified in codebase
- `apps/worker/src/routes/upload.ts` — UNNEST INSERT pattern verified at lines 167-186
- `apps/worker/src/matcher.ts` — DataQualityWarning interface verified at lines 48-52
- `apps/web/src/hooks/useStores.ts` — hook composition pattern verified at lines 13-37
- `apps/web/src/hooks/useFetch.ts` — base fetch hook verified
- `apps/worker/src/db/schema.sql` — `cost_ex DOUBLE PRECISION` on `dead_stock` verified at line 47
- `apps/worker/src/db/client.ts` — `withOrgContext` synchronous callback constraint verified
- `apps/worker/src/index.ts` — route registration pattern verified at lines 30-34
- `apps/worker/src/__tests__/parser.test.ts` — test patterns verified
- `apps/worker/src/__tests__/upload.test.ts` — mock sequence patterns verified
- `sample-data/Stock Valuation.xlsx` — FRED column name `Cost Ex` confirmed (D-01 in CONTEXT.md)
- `.planning/phases/12-cost-column-parser-summary-endpoint/12-CONTEXT.md` — all locked decisions D-01 through D-14

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — NaN → NULL convention (Phase 3 decision), NEON synchronous callback (Phase 1 decision)
- `.planning/REQUIREMENTS.md` — COST-01, COST-02, COST-04 acceptance criteria

### Tertiary (LOW confidence)

- A1: NEON HTTP driver boolean serialization behavior — assumed from general PostgreSQL driver conventions; not verified against NEON-specific docs in this session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in codebase; no new installs
- Architecture patterns: HIGH — all patterns verified against existing source files
- SQL aggregation: HIGH — PostgreSQL `FILTER` clause is standard; `cost_ex` column existence verified in schema.sql
- Pitfalls: HIGH (4 of 6) / MEDIUM (2 of 6, per assumptions log) — sourced from codebase inspection and CONTEXT.md decisions
- Hook pattern: HIGH — `useStores` template verified line by line

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days; stable stack, no moving parts)
