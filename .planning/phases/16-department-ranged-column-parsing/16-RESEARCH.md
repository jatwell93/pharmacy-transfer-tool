# Phase 16: Department + Ranged Column Parsing - Research

**Researched:** 2026-05-13
**Domain:** Full-stack field addition — TypeScript parser, NEON schema migration, Cloudflare Worker route, React table UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Canonical name is `Department`. Add to `HEADER_ALIASES` with aliases: `"Department"`, `"Dept"`, `"Dept."`, `"Drug Dept"`, `"Product Department"`.

**D-02:** Department is optional. When the column is absent from the dead stock file, the `department` field on `DeadStockRow` defaults to `""` (empty string) — same behaviour as `description` when absent. Frontend renders nothing in the cell.

**D-03:** `DeadStockRow` interface gains a `department: string` field. Downstream, `dead_stock` table gains `department TEXT` (nullable). Match response maps null → `""` before sending to frontend.

**D-04:** `is_ranged` is already stored in the `dead_stock` table (Phase 7). The match.ts query must be updated to `SELECT ds.sku, ds.description, ds.soh, ds.cost_ex, ds.is_ranged, ds.department, s.name AS store_name FROM dead_stock ds ...`.

**D-05:** `MatchResult` gains `isRanged: boolean` and `department: string` fields. `DeadStockItem` (matcher.ts input type) gains `isRanged: boolean` and `department: string` so these values pass through the match pipeline.

**D-06:** Ranged column renders a checkmark (`✓`) for `true` and a dash (`—`) for `false`. No colored pills — compact and scannable.

**D-07:** Ranged value comes from the source (dead stock) item and is shown in main result rows only. Sub-match rows (alt destination rows) do not repeat it — it is not a per-destination attribute.

**D-08:** Column order after adding two new columns: `SKU | Description | Department | Ranged | Source Store | Destination Store | Qty to Transfer | Dest ROU | Months Cover | Sell-Through Time`. Department and Ranged appear immediately after Description.

**D-09:** Department column width: `1fr`. Ranged column width: `60px` (fixed).

**D-10:** Grid template updates from `grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px]` to `grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]`. Must be updated in 3 places. Sub-match rows use same grid but leave Department and Ranged cells empty.

**D-11:** Migration delivered as: (a) update `apps/worker/src/db/schema.sql` canonical DDL to add `department TEXT` to the `dead_stock` table, and (b) add a `-- MIGRATION REQUIRED` comment block in `apps/worker/src/routes/upload.ts` with the exact `ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;` statement to run manually in NEON SQL editor before deploying.

**D-12:** Migration must be run as `neondb_owner` (not the `pharmiq_app` app role which lacks DDL rights). Comment in upload.ts must note this.

**D-13:** Existing parser unit tests in `apps/worker/src/__tests__/` must continue to pass unchanged. New tests must cover: (a) Department header recognised from each alias, (b) missing Department column → `department: ""` not an error, (c) Department value correctly extracted per row.

### Claude's Discretion

None declared — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Phase 17 will add filter controls for Ranged and Department — column definitions here must be stable before those filters are built.
- Sub-match row Department/Ranged display (if ever needed) requires adding `parentDepartment` and `parentIsRanged` to the `FlatItem` union type.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TABLE-01 | User can see a Department column in match results, populated from the FRED dead stock export | Confirmed: parser, DB, API route, and frontend table all need updating per the pattern already established by Cost Ex (Phase 12) |
| TABLE-02 | User can see a Ranged column in match results (true/false), parsed from FRED export | Confirmed: `is_ranged` already in `dead_stock` table; only the SELECT query, type definitions, and frontend render need adding |
</phase_requirements>

---

## Summary

Phase 16 adds two new data columns — Department and Ranged status — from the FRED dead stock export through the complete application stack. The change touches five distinct layers: (1) the TypeScript parser in the Cloudflare Worker, (2) the NEON database schema, (3) the dead stock bulk insert in `upload.ts`, (4) the match query and type definitions in `match.ts` and `matcher.ts`, and (5) the result table UI in `MatchPage.tsx`.

The codebase has strong established patterns for exactly this kind of change. The Cost Ex column (Phase 12) and the is_ranged column (Phase 7) both followed the same pipeline: add alias to `HEADER_ALIASES`, add field to `DeadStockRow`, add to bulk INSERT, add to SELECT query, add to type interfaces, render in frontend. The department field follows this pattern identically. The Ranged column in match results is simpler: `is_ranged` is already stored in `dead_stock` — it only needs to be SELECTed and surfaced.

The migration strategy is already established: a `-- MIGRATION REQUIRED` comment block at the top of `upload.ts` with the exact DDL statement, plus an update to `schema.sql`. The `pharmiq_app` role lacks DDL rights; the migration must be run as `neondb_owner` via the NEON SQL editor. Two previous phases (7 and 10) established this convention, so developers know to look for it.

**Primary recommendation:** Implement as two plans — Plan 1 covers the backend stack (parser + DB + API), Plan 2 covers the frontend table update. Plans are small and low-risk; the established patterns mean almost no design decisions remain open at implementation time.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Department header aliasing | API / Backend (CF Worker) | — | Parser runs in the Worker; all FRED parsing is server-side |
| is_ranged SELECT from dead_stock | API / Backend (CF Worker) | Database | Query change in match.ts; data already exists in NEON |
| department column in NEON | Database / Storage | — | Schema migration; DDL change to dead_stock table |
| DeadStockItem / MatchResult type widening | API / Backend (CF Worker) | — | TypeScript interfaces in matcher.ts bridge parser to API response |
| Department + Ranged column rendering | Browser / Client | — | MatchPage.tsx table grid, no server-side rendering |
| Grid template update | Browser / Client | — | Tailwind className string in MatchPage.tsx — pure frontend |

---

## Standard Stack

No new dependencies are introduced by this phase. All tools are already installed.

### Core (already installed)
| Library | Version | Purpose | Relevance to Phase 16 |
|---------|---------|---------|----------------------|
| xlsx | 0.20.3 | CSV/XLSX parsing in Worker | `parseDeadStockFile` uses this; no changes to xlsx usage |
| @neondatabase/serverless | ^1.0.2 | NEON Postgres client | `withOrgContext` used for all DB queries; unchanged |
| hono | ^4.12.9 | CF Worker HTTP framework | match.ts and upload.ts route handlers; unchanged |
| vitest | ^4.1.2 | Unit test runner | Test framework for new parser tests |
| @cloudflare/vitest-pool-workers | ^0.13.5 | Vitest Cloudflare pool | Runs tests in CF Workers context; unchanged |

[VERIFIED: apps/worker/package.json — read directly]

**Installation:** No new packages required.

---

## Architecture Patterns

### System Architecture Diagram

```
FRED dead stock file (CSV/XLSX)
        |
        v
[POST /upload — upload.ts]
  parseDeadStockFile(buf, filename)
  -> DeadStockRow[] { sku, description, soh, isRanged, costEx, department }
        |
        v
[NEON dead_stock table]
  INSERT: sku, description, soh, is_ranged, cost_ex, department (NEW)
        |
        v
[POST /match — match.ts]
  SELECT ds.sku, ds.description, ds.soh, ds.cost_ex,
         ds.is_ranged (already there), ds.department (NEW)
  FROM dead_stock ds JOIN stores s ...
        |
        v
  DeadStockItem[] { sku, soh, description, cost, isRanged (NEW), department (NEW) }
        |
        v
  matchTransfers(deadStock, rouData, opts)
  -> MatchResult[] { sku, description, soh, cost, sourceStore,
                     isRanged (NEW), department (NEW),
                     bestMatch, allMatches }
        |
        v
[React MatchPage.tsx]
  columnHeaders array (2 new entries)
  grid-cols template (updated in 3 places)
  result row: render result.department, result.isRanged ? '✓' : '—'
  sub-match row: render empty cells for Department and Ranged
```

### Recommended Change Sequence

```
1. parser.ts          — HEADER_ALIASES + DeadStockRow (foundation)
2. upload.ts          — bulk INSERT column + MIGRATION REQUIRED comment
3. schema.sql         — add department TEXT to dead_stock DDL
4. matcher.ts         — DeadStockItem + MatchResult type widening
5. match.ts           — SELECT query + DeadStockItem mapping
6. useMatchRun.ts     — MatchResult interface (mirror of matcher.ts)
7. MatchPage.tsx      — columnHeaders + grid template + cell rendering
8. parser.test.ts     — new Department alias and optional-column tests
```

This sequence follows dependency order: lower layers first, tests last.

### Pattern 1: Optional Column Extraction (established in parser.ts)

**What:** Check if canonical column exists in colMap before reading; default to empty value if absent.
**When to use:** All optional columns in `parseDeadStockFile` and `parseRouFile`.
**Example:**

```typescript
// Source: apps/worker/src/lib/parser.ts (existing pattern — descCol, rangedCol, costEx)
const deptCol = colMap["Department"];
const department = deptCol !== undefined ? (row[deptCol]?.trim() ?? "") : "";
```

This exactly mirrors how `descCol`, `rangedCol`, and `hasCostColumn` are handled. [VERIFIED: parser.ts lines 294-296, 303-305, 282-283]

### Pattern 2: HEADER_ALIASES Entry

**What:** Add canonical name and its FRED-export aliases as a key-value pair.
**When to use:** Any new parseable column.
**Example:**

```typescript
// Source: apps/worker/src/lib/parser.ts (HEADER_ALIASES constant)
// Add alongside existing entries:
"Department": ["Department", "Dept", "Dept.", "Drug Dept", "Product Department"],
```

[VERIFIED: parser.ts lines 29-41 — existing HEADER_ALIASES structure confirmed]

### Pattern 3: UNNEST Bulk INSERT with new column

**What:** Add the new column to both the column list and the UNNEST SELECT in upload.ts.
**When to use:** Any new parseable field that needs to be persisted.
**Example:**

```typescript
// Source: apps/worker/src/routes/upload.ts (existing UNNEST pattern, lines 196-205)
// Add alongside existing arrays:
const departments = rows.map((r) => r.department);

// In the UNNEST INSERT:
INSERT INTO dead_stock (org_id, store_id, sku, description, soh, is_ranged, cost_ex, department, uploaded_at)
SELECT ${orgId}, ${storeId}::uuid,
       unnest(${skus}::text[]),
       unnest(${descriptions}::text[]),
       unnest(${sohs}::float8[]),
       unnest(${ranged}::boolean[]),
       unnest(${costs}::float8[]),
       unnest(${departments}::text[]),   -- NEW
       NOW()
```

[VERIFIED: upload.ts lines 192-205 — existing UNNEST pattern confirmed]

### Pattern 4: MIGRATION REQUIRED Comment Block

**What:** A comment at the top of upload.ts documenting the DDL to run manually in NEON SQL editor before deploying.
**When to use:** Any ALTER TABLE needed for new columns (pharmiq_app has no DDL rights).
**Example:**

```typescript
// Source: apps/worker/src/routes/upload.ts (lines 7-12 — Phase 7 pattern)
// MIGRATION REQUIRED (Phase 16): ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;
// Run via NEON SQL editor as neondb_owner before deploying. Do NOT use DATABASE_URL (pharmiq_app has no DDL rights).
```

[VERIFIED: upload.ts lines 7-12 — existing Phase 7 and original migrations follow this exact style]

### Pattern 5: Type Widening (matcher.ts and useMatchRun.ts)

**What:** Add new fields to `DeadStockItem` and `MatchResult` interfaces so values flow through without touching algorithm logic.
**When to use:** Passing new data through the pipeline without computation.
**Example:**

```typescript
// Source: apps/worker/src/matcher.ts (existing interface definitions)
export interface DeadStockItem {
  sku: string;
  soh: number;
  description: string;
  cost: number;
  isRanged: boolean;    // NEW
  department: string;   // NEW
}

export interface MatchResult {
  sku: string;
  description: string;
  soh: number;
  cost: number;
  sourceStore: string;
  isRanged: boolean;    // NEW
  department: string;   // NEW
  bestMatch: DestinationMatch;
  allMatches: DestinationMatch[];
}
```

Note: `matchTransfers()` in matcher.ts must propagate these fields in its `results.push({...})` call (line 210). Since `DeadStockItem` gains `isRanged` and `department`, the spread/explicit push must include them.

[VERIFIED: matcher.ts lines 8-13, 38-46, 210-219 — current structure confirmed]

### Pattern 6: match.ts Query and Mapping

**What:** Expand the SELECT to include `ds.is_ranged` and `ds.department`, expand the TypeScript type annotation, and map to `DeadStockItem` fields.
**When to use:** Adding stored fields to the match query result.
**Example:**

```typescript
// Source: apps/worker/src/routes/match.ts (lines 121-138, 174-178 — current structure)

// Expand the type annotation:
Array<{
  sku: string;
  description: string;
  soh: number;
  cost_ex: number | null;
  is_ranged: boolean;     // NEW
  department: string | null;  // NEW (nullable — column did not exist before migration)
  store_name: string;
}>

// Expand the SQL:
SELECT ds.sku, ds.description, ds.soh, ds.cost_ex,
       ds.is_ranged, ds.department, s.name AS store_name
FROM dead_stock ds
JOIN stores s ON s.id = ds.store_id
WHERE ds.org_id = ${orgId}

// Expand the DeadStockItem mapping (lines 174-178):
items.push({
  sku: row.sku,
  soh: row.soh,
  description: row.description,
  cost: row.cost_ex ?? 0,
  isRanged: row.is_ranged,       // NEW
  department: row.department ?? "",  // NEW — null → "" per D-03
});
```

[VERIFIED: match.ts lines 121-138, 174-178 — current query and mapping confirmed]

### Pattern 7: MatchResult propagation in matchTransfers()

**What:** When `results.push({...})` is called inside `matchTransfers()`, the new `isRanged` and `department` fields must be included from the `DeadStockItem`.
**Why this matters:** The algorithm loop uses a `validDeadStock` array that spreads `item` properties. The spread at line 135 (`validDeadStock.push({ ...item, cost })`) will carry new fields through automatically if they are typed correctly on `DeadStockItem`. However, the final `results.push({...})` at line 210 must explicitly include them.
**Example:**

```typescript
// Source: apps/worker/src/matcher.ts lines 210-219 (current push, needs expansion)
results.push({
  sku: item.sku,
  description: item.description,
  soh: item.soh,
  cost: item.cost,
  sourceStore: opts.originStore,
  isRanged: item.isRanged,     // NEW — from DeadStockItem
  department: item.department, // NEW — from DeadStockItem
  bestMatch: destinationMatches[0],
  allMatches: destinationMatches,
});
```

[VERIFIED: matcher.ts lines 210-219 — current push statement confirmed]

### Pattern 8: useMatchRun.ts MatchResult mirror

**What:** The `MatchResult` and `DestinationMatch` interfaces in `useMatchRun.ts` are client-side mirrors of the Worker types. They must be kept in sync.
**When to use:** Any time Worker interfaces change.
**Example:**

```typescript
// Source: apps/web/src/hooks/useMatchRun.ts (lines 7-28 — current mirror)
export interface MatchResult {
  sku: string;
  description: string;
  soh: number;
  cost: number;
  sourceStore: string;
  isRanged: boolean;    // NEW
  department: string;   // NEW
  bestMatch: DestinationMatch;
  allMatches: DestinationMatch[];
}
```

[VERIFIED: useMatchRun.ts lines 14-28 — current interface confirmed]

### Anti-Patterns to Avoid

- **Forgetting the `results.push()` in `matchTransfers()`:** The TypeScript type annotation on `MatchResult` will force a compile error if the push is incomplete — but only if TypeScript strict mode is active. Always update the push explicitly, not just the interface.
- **Using null for department in match response:** Per D-03, null from the DB must be mapped to `""` before it reaches the frontend. Do this in `match.ts` at the `DeadStockItem` mapping stage, not in the frontend.
- **Running the ALTER TABLE as `pharmiq_app`:** This role has no DDL rights. Always use `neondb_owner` in the NEON SQL editor. The migration comment in `upload.ts` must include this warning explicitly.
- **Adding Department to sub-match rows:** Sub-match rows render blank Department and Ranged cells — the FlatItem union type does not gain `parentDepartment` in Phase 16. Do not add it.
- **Forgetting the 3rd grid-template location:** `grid-cols-[...]` appears in 3 div classNames: line ~479 (header), line ~513 (main result row), line ~552 (sub-match row). All three must be updated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column aliasing | Custom string matcher | `HEADER_ALIASES` + `buildColumnMap` | Already handles trim, case-sensitive match, multiple aliases per canonical name |
| Boolean Ranged parsing | Custom truthy check | `RANGED_TRUTHY` set already in parser.ts | Covers all FRED variants: "checked", "yes", "true", "1", "y" |
| Bulk DB insert | Row-by-row INSERT | UNNEST pattern in upload.ts | Already handles large file uploads efficiently |
| DB query context | Raw neon() calls | `withOrgContext` from db/client.ts | Handles RLS context injection; all queries must go through this |

---

## Runtime State Inventory

Step 2.5 applies — this is an additive column migration to a live table. Not a rename/refactor; runtime state is limited.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `dead_stock` table in NEON — existing rows have no `department` column yet | ALTER TABLE ADD COLUMN (nullable — existing rows get NULL automatically) |
| Live service config | None — no n8n workflows or external service config reference department | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars introduced | None |
| Build artifacts | None — no compiled artifacts to invalidate | None |

**Key insight:** PostgreSQL `ADD COLUMN IF NOT EXISTS department TEXT` with no DEFAULT is safe on a live table. Existing rows will have `department = NULL`; the match route maps `null → ""`. No data migration of existing rows is required — they will simply show blank department cells in match results until re-uploaded. [VERIFIED: schema.sql — dead_stock table structure confirmed; NULL-safe mapping confirmed in D-03]

---

## Common Pitfalls

### Pitfall 1: Schema migration timing
**What goes wrong:** Deploying the Worker before running the ALTER TABLE causes the INSERT in upload.ts to fail with "column department does not exist".
**Why it happens:** NEON DDL changes are not auto-applied from schema.sql.
**How to avoid:** Run `ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;` as `neondb_owner` in NEON SQL editor BEFORE deploying. The `-- MIGRATION REQUIRED` comment in upload.ts is the reminder.
**Warning signs:** 500 error on POST /upload after deploy; check Worker logs for "column department does not exist".

### Pitfall 2: Forgetting the 3rd grid-template occurrence
**What goes wrong:** Header or main rows display correctly, but sub-match rows have misaligned columns.
**Why it happens:** `grid-cols-[...]` appears in 3 separate div classNames (header, result row, sub-match row). Only 2 are updated.
**How to avoid:** Search for `grid-cols-[36px_1fr_1.2fr` in MatchPage.tsx — all 3 occurrences must be updated.
**Warning signs:** Sub-match rows appear shifted relative to the header after Phase 16.

### Pitfall 3: matchTransfers() results.push() omission
**What goes wrong:** `MatchResult` has `isRanged` and `department` in the TypeScript interface, but they are `undefined` at runtime because the `results.push({...})` call inside `matchTransfers()` was not updated.
**Why it happens:** TypeScript interface widening does not automatically update the literal object in the push call.
**How to avoid:** Explicitly add `isRanged: item.isRanged, department: item.department` to the push. TypeScript strict mode will catch this as a type error if all fields in `MatchResult` are required (not optional).
**Warning signs:** `result.isRanged` renders as `undefined` in the frontend, showing no `✓` or `—`.

### Pitfall 4: null vs "" for department in API response
**What goes wrong:** Frontend receives `null` for rows uploaded before the migration, causing `{null}` to render visibly in the cell.
**Why it happens:** Postgres returns `null` for the new column on pre-migration rows; JavaScript renders null as the string "null" in JSX.
**How to avoid:** Map at the `DeadStockItem` construction in match.ts: `department: row.department ?? ""`. This is the null-coalescing guard per D-03.
**Warning signs:** Cells show literal "null" text in department column.

### Pitfall 5: Test 7 in parser.test.ts already passes Department column
**What goes wrong:** Test 7 (`FRED Stock Valuation full-column CSV`) already includes a `Department` column in the CSV input — but the current `DeadStockRow` has no `department` field, so it is silently dropped. After Phase 16, the same CSV will populate `department: "GEN"`. The test currently asserts `result[0].isRanged === false` and will pass. But the test does NOT assert `result[0].department` — new tests must assert it explicitly.
**How to avoid:** New tests in parser.test.ts must cover department extraction separately from Test 7. Do not modify Test 7; it validates existing behaviour and must pass unchanged (D-13).
**Warning signs:** All existing tests pass but new department tests are missing.

---

## Code Examples

### Complete parser.ts additions

```typescript
// Source: apps/worker/src/lib/parser.ts

// 1. Add to HEADER_ALIASES:
"Department": ["Department", "Dept", "Dept.", "Drug Dept", "Product Department"],

// 2. Add to DeadStockRow interface:
export interface DeadStockRow {
  sku: string;
  description: string;
  soh: number;
  isRanged: boolean;
  costEx: number;
  department: string;  // NEW — "" when column absent (D-02)
}

// 3. Add inside parseDeadStockFile row loop (after costEx extraction):
const deptCol = colMap["Department"];
const department = deptCol !== undefined ? (row[deptCol]?.trim() ?? "") : "";

// 4. Add to result.push():
result.push({ sku, description, soh, isRanged, costEx, department });
```

### Schema migration statement

```sql
-- Run as neondb_owner in NEON SQL editor BEFORE deploying Phase 16 Worker
-- pharmiq_app has no DDL rights (BYPASSRLS=false, no CREATE/ALTER privilege)
ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;
```

### upload.ts bulk INSERT expansion

```typescript
// Source: apps/worker/src/routes/upload.ts (dead stock section)

const departments = rows.map((r) => r.department);

await withOrgContext<void>(
  dbUrl,
  orgId,
  (tx) => tx`
    INSERT INTO dead_stock (org_id, store_id, sku, description, soh, is_ranged, cost_ex, department, uploaded_at)
    SELECT ${orgId}, ${storeId}::uuid,
           unnest(${skus}::text[]),
           unnest(${descriptions}::text[]),
           unnest(${sohs}::float8[]),
           unnest(${ranged}::boolean[]),
           unnest(${costs}::float8[]),
           unnest(${departments}::text[]),
           NOW()
  `,
);
```

### New parser tests (illustrative — these are the tests D-13 requires)

```typescript
// Source: to be added to apps/worker/src/__tests__/parser.test.ts

describe("parseDeadStockFile department extraction", () => {
  it("recognises canonical 'Department' header and extracts value per row", () => {
    const csv = "Item Code,SOH,Department\nSKU001,10,Pharmacy\nSKU002,5,Cosmetics\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("Pharmacy");
    expect(rows[1].department).toBe("Cosmetics");
  });

  it("recognises alias 'Dept' and extracts value", () => {
    const csv = "Item Code,SOH,Dept\nSKU001,10,Pharmacy\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("Pharmacy");
  });

  it("recognises alias 'Dept.' (with period) and extracts value", () => {
    const csv = "Item Code,SOH,Dept.\nSKU001,10,General\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("General");
  });

  it("recognises alias 'Drug Dept' and extracts value", () => {
    const csv = "Item Code,SOH,Drug Dept\nSKU001,10,PBS\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("PBS");
  });

  it("recognises alias 'Product Department' and extracts value", () => {
    const csv = "Item Code,SOH,Product Department\nSKU001,10,OTC\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("OTC");
  });

  it("defaults department to '' when Department column is absent — no error thrown", () => {
    const csv = "Item Code,SOH\nSKU001,10\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("");
  });

  it("returns empty string for blank department cells", () => {
    const csv = "Item Code,SOH,Department\nSKU001,10,\nSKU002,5,Pharmacy\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows[0].department).toBe("");
    expect(rows[1].department).toBe("Pharmacy");
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| isRanged on rou_data only | is_ranged on dead_stock too (Phase 7) | Phase 7 | is_ranged already exists in dead_stock; no new column needed, just SELECT it |
| Cost Ex not in dead_stock | cost_ex on dead_stock (Phase 12) | Phase 12 | Confirmed the UNNEST pattern works for new optional columns; department follows same pattern |

**Deprecated/outdated:**
- The original Django codebase parsed only `is_ranged` from dead stock but did not expose it in results. The Cloudflare rewrite stores it but Phase 16 is the first phase to read it back from dead_stock in the match route.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FRED dead stock exports use exactly the alias strings listed in D-01 ("Department", "Dept", "Dept.", "Drug Dept", "Product Department") | Standard Stack / HEADER_ALIASES | Department column not parsed for some stores; department stays blank. Low risk: D-02 makes blank safe. |
| A2 | Existing `dead_stock` rows in NEON will not need backfilling — blank department is acceptable for historical rows | Runtime State Inventory | Department shows blank for all pre-Phase-16 upload rows until re-uploaded. Acceptable per D-02. |

**Note:** Both assumptions are low-risk because D-02 explicitly makes the blank/null case safe.

---

## Open Questions

None. All decisions are locked in CONTEXT.md and verified against the current codebase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Worker build and test | Yes | v22.20.0 | — |
| vitest | Parser unit tests | Yes | ^4.1.2 (package.json) | — |
| @cloudflare/vitest-pool-workers | vitest CF pool | Yes | ^0.13.5 (package.json) | — |
| NEON SQL editor (neondb_owner) | ALTER TABLE migration | Manual (human step) | — | No fallback — must be run by developer before deploy |

[VERIFIED: package.json — vitest and CF pool versions confirmed; Node version confirmed via bash]

**Missing dependencies with no fallback:**
- NEON SQL editor access as `neondb_owner` — this is a manual human prerequisite, not automatable. The plan must include an explicit "run this migration" task before the deploy task.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 + @cloudflare/vitest-pool-workers ^0.13.5 |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` |
| Full suite command | `cd apps/worker && npx vitest run` |

### Phase Requirements — Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TABLE-01 | Department header alias recognised from each of 5 variants | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | Existing file, new describe block needed |
| TABLE-01 | Missing Department column → `department: ""` not an error | unit | same | Same — new test case needed |
| TABLE-01 | Department value extracted per row | unit | same | Same — new test case needed |
| TABLE-02 | Ranged column in match results (`isRanged: boolean`) | integration/manual | Run Match in UI and check Ranged column | Manual UAT only — match route E2E requires live NEON |
| D-13 | All existing parser tests pass unchanged | unit | `cd apps/worker && npx vitest run src/__tests__/parser.test.ts` | Existing — must not regress |

### Sampling Rate

- **Per task commit:** `cd apps/worker && npx vitest run src/__tests__/parser.test.ts`
- **Per wave merge:** `cd apps/worker && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. New tests are additive describe blocks in the existing `parser.test.ts` file, not new files. No new fixtures or framework config needed.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not touched — Clerk auth unchanged |
| V3 Session Management | No | Not touched |
| V4 Access Control | No | Not touched — RLS policies unchanged; new column inherits existing `org_isolation` policy on `dead_stock` |
| V5 Input Validation | Yes | Optional column: empty string default prevents null injection; `trim()` on all column values (existing pattern) |
| V6 Cryptography | No | Not touched |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Column injection via UNNEST | Tampering | UNNEST with typed arrays (`::text[]`) prevents SQL injection; existing pattern |
| org_id leakage via new column | Information Disclosure | RLS `org_isolation` policy on `dead_stock` covers all columns including new `department`; no per-column policy change needed |

**RLS note:** The PostgreSQL RLS policy `org_isolation ON dead_stock FOR ALL` covers all columns on the table automatically. Adding `department TEXT` does not require a new policy. [VERIFIED: schema.sql lines 111, 84-86 — policy and dead_stock indexes confirmed]

---

## Sources

### Primary (HIGH confidence)
- `apps/worker/src/lib/parser.ts` — HEADER_ALIASES structure, DeadStockRow interface, buildColumnMap, parseDeadStockFile, optional column pattern (descCol, rangedCol, costEx)
- `apps/worker/src/routes/upload.ts` — UNNEST bulk INSERT pattern, MIGRATION REQUIRED comment convention, dead stock processing
- `apps/worker/src/routes/match.ts` — Dead stock SELECT query, DeadStockItem mapping, withOrgContext usage
- `apps/worker/src/matcher.ts` — DeadStockItem, MatchResult, matchTransfers() results.push()
- `apps/worker/src/db/schema.sql` — dead_stock table DDL (missing department TEXT — confirmed)
- `apps/worker/src/__tests__/parser.test.ts` — Existing test structure, Test 7 confirms Department column already appears in real FRED exports
- `apps/web/src/pages/MatchPage.tsx` — columnHeaders array, grid-cols template in 3 locations, FlatItem type
- `apps/web/src/hooks/useMatchRun.ts` — MatchResult mirror interface
- `apps/worker/vitest.config.ts` + `apps/worker/package.json` — Test framework versions

### Secondary (MEDIUM confidence)
- `.planning/phases/16-department-ranged-column-parsing/16-CONTEXT.md` — All locked decisions (D-01 through D-13)
- `.planning/phases/16-department-ranged-column-parsing/16-UI-SPEC.md` — Grid template before/after, exact column header text, cell rendering patterns
- `.planning/REQUIREMENTS.md` — TABLE-01, TABLE-02 acceptance criteria
- `.planning/ROADMAP.md` — Phase 16 success criteria

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified from package.json; no new dependencies
- Architecture: HIGH — all five change sites verified from source files; patterns confirmed from previous phase implementations (Phase 7, Phase 12)
- Pitfalls: HIGH — derived directly from reading the actual source code and identifying the 3-location grid template, the results.push() gap, and the migration timing requirement
- Tests: HIGH — existing test file structure read directly; new test cases follow exact same helper pattern (csvToBuffer)

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable stack — 30-day validity)

---

## RESEARCH COMPLETE

**Phase:** 16 - Department + Ranged Column Parsing
**Confidence:** HIGH

### Key Findings

- All five change sites are fully verified from source: `parser.ts`, `upload.ts` / `schema.sql`, `matcher.ts`, `match.ts`, and `MatchPage.tsx` / `useMatchRun.ts`.
- The department column follows the identical optional-column pattern used for `description`, `rangedCol`, and `Cost Ex` — no new patterns are introduced.
- `is_ranged` already exists in the `dead_stock` table (Phase 7); only a SELECT query change, type widening, and frontend render are needed.
- Test 7 in the existing `parser.test.ts` (`FRED Stock Valuation full-column CSV`) already exercises a CSV that contains a `Department` column — this column was silently dropped before; after Phase 16 it will populate `result[0].department = "GEN"`. The test asserts other fields and will still pass; new explicit department assertions go in a new describe block.
- The NEON migration must be run as `neondb_owner` before deploy — this is a known constraint from Phases 7 and 10, already understood by the project team.

### File Created

`C:\Users\josha\pharmacy-transfer-tool\.planning\phases\16-department-ranged-column-parsing\16-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | package.json read directly; no new deps |
| Architecture | HIGH | All 5 change sites read from source; patterns verified from previous phases |
| Pitfalls | HIGH | Derived from actual source code; not assumed |
| Tests | HIGH | Existing test file structure confirmed; new tests follow established pattern |

### Open Questions

None — all decisions locked in CONTEXT.md.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
