# Phase 7: Fix is_ranged Schema and Pipeline — Research

**Researched:** 2026-04-12
**Domain:** NEON Postgres schema migration, Hono Worker route update, TypeScript type alignment
**Confidence:** HIGH

---

## Summary

Phase 7 is a surgical, well-bounded fix for a known architectural gap (INT-01) identified in the v1.0 milestone audit. The root cause is fully understood: `rou_data` schema has no `is_ranged` column, so `match.ts` hard-codes `isRanged: false` for every `RouItem`. The `matchTransfers` sort (`dest.isRanged ? -1 : 1`) therefore never activates ranged-first grouping, meaning MATCH-05 is structurally broken and MATCH-06's parseIsRanged logic is never exercised end-to-end via the ROU upload pipeline.

The fix touches exactly four locations:
1. `schema.sql` — add `is_ranged BOOLEAN DEFAULT false` column to `rou_data` table
2. `upload.ts` — extend the ROU UNNEST INSERT to include `is_ranged` values extracted from parsed rows
3. `parser.ts` — update `RouRow` interface and `parseRouFile` to parse the `Ranged` column using `RANGED_TRUTHY`
4. `match.ts` — update the `rouRows` SELECT to include `is_ranged` and remove the hardcoded `isRanged: false`

Supporting work: update tests in `upload.test.ts`, `parser.test.ts`, and `match.test.ts` to assert the new behaviour; execute the `ALTER TABLE` migration against the live NEON database.

**Primary recommendation:** One plan is sufficient. The four file changes are tightly coupled (a schema change with no route change is broken; a route change with no schema change fails at query time). Execute them together in a single TDD plan: RED tests first, then GREEN implementation, then schema migration, then verify.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-05 | Results are sorted ranged-first, then by ROU descending within each group | Requires `is_ranged` persisted in `rou_data` so `RouItem.isRanged` is non-trivially `true` for ranged SKUs; the sort logic in `matchTransfers` already exists and is correct — it only needs real data to activate |
| MATCH-06 | `is_ranged` parsing accepts all truthy variants: `checked`, `yes`, `true`, `1`, `y` (case-insensitive) — not just `"checked"` | `RANGED_TRUTHY` set already exists in `parser.ts` for dead-stock; same set and same parsing function must be used in `parseRouFile`; RANGED_TRUTHY in `matcher.ts` is identical and correct — no change needed there |
</phase_requirements>

---

## Architecture Patterns

### Exact Gap Location (verified by direct code inspection)

**schema.sql** — `rou_data` table definition (lines 27–36):
```sql
-- CURRENT (missing is_ranged):
CREATE TABLE IF NOT EXISTS rou_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  description TEXT,
  rou         DOUBLE PRECISION,
  soh         DOUBLE PRECISION,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TARGET (add is_ranged column):
CREATE TABLE IF NOT EXISTS rou_data (
  ...
  soh         DOUBLE PRECISION,
  is_ranged   BOOLEAN NOT NULL DEFAULT false,   -- ADD THIS
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
[VERIFIED: codebase — `apps/worker/src/db/schema.sql` line 27-36]

**parser.ts** — `RouRow` interface (line 11–16) and `parseRouFile` (lines 195–238):
```typescript
// CURRENT RouRow — no is_ranged field:
export interface RouRow {
  sku: string;
  description: string;
  rou: number;
  soh: number;
}

// TARGET — add is_ranged field:
export interface RouRow {
  sku: string;
  description: string;
  rou: number;
  soh: number;
  isRanged: boolean;  // ADD: parsed from "Ranged" column via RANGED_TRUTHY
}
```

The `RANGED_TRUTHY` set is already defined at `parser.ts` line 42:
```typescript
const RANGED_TRUTHY = new Set(["checked", "yes", "true", "1", "y"]);
```
[VERIFIED: codebase — `apps/worker/src/lib/parser.ts` line 42]

The Ranged column alias is already in `HEADER_ALIASES`:
```typescript
Ranged: ["Ranged", "Is Ranged", "Ranged Item", "Range Flag"],
```
[VERIFIED: codebase — `apps/worker/src/lib/parser.ts` line 37]

The dead-stock parser already implements the identical pattern at lines 288–292:
```typescript
const rangedCol = colMap["Ranged"];
const isRanged =
  rangedCol !== undefined
    ? RANGED_TRUTHY.has((row[rangedCol]?.trim() ?? "").toLowerCase())
    : false;
```
[VERIFIED: codebase — `apps/worker/src/lib/parser.ts` lines 288-292]

`parseRouFile` must add the same 3-line ranged parsing block, then push `isRanged` onto `result`.

**upload.ts** — ROU UNNEST INSERT (lines 117–134):
```typescript
// CURRENT — 6 columns, no is_ranged:
const skus = rows.map((r) => r.sku);
const descriptions = rows.map((r) => r.description);
const rous = rows.map((r) => r.rou);
const sohs = rows.map((r) => r.soh);

await withOrgContext(..., (tx) => tx`
  INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, uploaded_at)
  SELECT ${orgId}, ${storeId}::uuid,
         unnest(${skus}::text[]),
         unnest(${descriptions}::text[]),
         unnest(${rous}::float8[]),
         unnest(${sohs}::float8[]),
         NOW()
`);

// TARGET — 7 columns, add is_ranged:
const skus = rows.map((r) => r.sku);
const descriptions = rows.map((r) => r.description);
const rous = rows.map((r) => r.rou);
const sohs = rows.map((r) => r.soh);
const ranged = rows.map((r) => r.isRanged);   // ADD

await withOrgContext(..., (tx) => tx`
  INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, is_ranged, uploaded_at)
  SELECT ${orgId}, ${storeId}::uuid,
         unnest(${skus}::text[]),
         unnest(${descriptions}::text[]),
         unnest(${rous}::float8[]),
         unnest(${sohs}::float8[]),
         unnest(${ranged}::boolean[]),           // ADD
         NOW()
`);
```
[VERIFIED: codebase — `apps/worker/src/routes/upload.ts` lines 117-134]
[VERIFIED: pattern from dead-stock INSERT — same file lines 162-180]

**match.ts** — rouRows SELECT and RouItem construction (lines 103–132):
```typescript
// CURRENT — SELECT omits is_ranged, RouItem gets isRanged: false hardcoded:
const rouRows = await withOrgContext<Array<{
  sku: string; description: string; rou: number; soh: number; store_name: string;
}>>(..., (tx) => tx`
  SELECT rd.sku, rd.description, rd.rou, rd.soh,
         s.name AS store_name
  FROM rou_data rd
  JOIN stores s ON s.id = rd.store_id
  WHERE rd.org_id = ${orgId}
`);

const rouData: RouItem[] = rouRows
  .filter(...)
  .map((r) => ({
    sku: r.sku,
    store: r.store_name,
    rou: r.rou,
    isRanged: false,    // <--- HARDCODED, NEVER TRUE
    soh: r.soh,
  }));

// TARGET — SELECT includes is_ranged, RouItem reads from data:
const rouRows = await withOrgContext<Array<{
  sku: string; description: string; rou: number; soh: number;
  is_ranged: boolean;    // ADD
  store_name: string;
}>>(..., (tx) => tx`
  SELECT rd.sku, rd.description, rd.rou, rd.soh, rd.is_ranged,
         s.name AS store_name
  FROM rou_data rd
  JOIN stores s ON s.id = rd.store_id
  WHERE rd.org_id = ${orgId}
`);

const rouData: RouItem[] = rouRows
  .filter(...)
  .map((r) => ({
    sku: r.sku,
    store: r.store_name,
    rou: r.rou,
    isRanged: r.is_ranged,   // READ FROM DATA
    soh: r.soh,
  }));
```
[VERIFIED: codebase — `apps/worker/src/routes/match.ts` lines 102-132]

### Migration Strategy: ALTER TABLE vs Schema File

NEON Postgres is a managed cloud database. The `schema.sql` file is the canonical schema definition but was run once at project setup — it is NOT applied automatically. Adding `is_ranged` requires both:

1. **Update `schema.sql`** — keeps the file accurate as the source of truth
2. **Run `ALTER TABLE` directly against NEON** — applies the column to the live database

Pattern for the ALTER:
```sql
ALTER TABLE rou_data ADD COLUMN IF NOT EXISTS is_ranged BOOLEAN NOT NULL DEFAULT false;
```

`IF NOT EXISTS` is safe to re-run. `DEFAULT false` means all existing rows get `false` automatically — no data migration needed for existing rows. [VERIFIED: standard NEON/Postgres DDL behaviour]

The plan should document the ALTER statement as a required manual step with explicit instructions for the developer to run it against NEON before deploying the updated Worker. This matches the migration comment pattern already in `upload.ts` line 6-7:
```
// MIGRATION REQUIRED: ALTER TABLE stores ADD COLUMN store_number TEXT;
// Run once against NEON before deploying this route.
```
[VERIFIED: codebase — `apps/worker/src/routes/upload.ts` lines 6-7]

### withOrgContext Constraint (critical for test mocking)

`withOrgContext` uses a synchronous NEON HTTP transaction callback that returns a single query. Each `withOrgContext` call is one mock call. Existing test pattern in `upload.test.ts` shows mock sequence must be commented explicitly in the test:

```typescript
// Call sequence: org upsert, SELECT (no store), INSERT store, DELETE rou_data, INSERT rou_data
mockedWithOrgContext
  .mockResolvedValueOnce(undefined)     // org upsert
  .mockResolvedValueOnce([])            // SELECT stores → not found
  .mockResolvedValueOnce([{ id: "..." }]) // INSERT stores RETURNING id
  .mockResolvedValueOnce(undefined)     // DELETE rou_data
  .mockResolvedValueOnce(undefined);    // INSERT rou_data
```
[VERIFIED: codebase — `apps/worker/src/__tests__/upload.test.ts` lines 117-123]

After adding `is_ranged` to the INSERT, the call sequence does NOT change — same 5 calls for a ROU upload. The INSERT statement becomes a 7-column UNNEST instead of 6, but that is still one `withOrgContext` call. The existing ROU upload test does not need to change its mock sequence count.

### NEON `boolean` vs TypeScript `boolean` Wire Format

NEON `@neondatabase/serverless` returns SQL `BOOLEAN` values as JavaScript `boolean` (`true`/`false`), not strings (`"t"/"f"`) or numbers. This means `r.is_ranged` in the `rouRows` query result is already a JavaScript boolean — no coercion required. [ASSUMED — consistent with standard postgres.js/neon driver behaviour, not explicitly re-verified]

The `unnest(${ranged}::boolean[])` pattern is already used successfully for `dead_stock.is_ranged` in `upload.ts` line 177. This is the proven pattern. [VERIFIED: codebase — `apps/worker/src/routes/upload.ts` lines 162-180]

---

## Standard Stack

No new dependencies required. Phase 7 is a pure internal fix using the existing stack.

| Component | Current Version | Role in Phase 7 |
|-----------|-----------------|-----------------|
| NEON Postgres (`@neondatabase/serverless`) | ^1.0.2 | `ALTER TABLE` migration + updated INSERT/SELECT |
| Hono | ^4.12.9 | Route handler updated in `upload.ts` and `match.ts` |
| TypeScript | ^6.0.2 | `RouRow` interface update |
| Vitest | ^4.1.2 | Test framework |
| `@cloudflare/vitest-pool-workers` | ^0.13.5 | Test pool — `cloudflarePool` in `vitest.config.ts` |

[VERIFIED: codebase — `apps/worker/package.json`]

**Test run command:** `cd apps/worker && npm test` (maps to `vitest` per package.json scripts)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| `is_ranged` parsing for ROU rows | Custom parsing logic | Reuse `RANGED_TRUTHY` set already in `parser.ts` line 42 — identical to dead-stock parser |
| Bulk boolean insert | Row-by-row inserts | `unnest(${ranged}::boolean[])` — same pattern as `dead_stock` INSERT in `upload.ts` line 177 |
| Schema migration | Complex migration framework | Single `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statement — sufficient for adding a nullable/default column |

---

## Common Pitfalls

### Pitfall 1: Forgetting the ALTER TABLE before deploying the Worker
**What goes wrong:** Worker deployed with updated SELECT `rd.is_ranged` but column does not exist in NEON yet — every match run throws a DB error.
**Why it happens:** `schema.sql` is not auto-applied; it documents the schema but does not run it.
**How to avoid:** ALTER TABLE is a required task in the plan, executed before merging or deploying. The plan comment at the top of `upload.ts` (`// MIGRATION REQUIRED: ...`) establishes this pattern.
**Warning signs:** All `/api/match` calls return 500 after deploy.

### Pitfall 2: Updating the ROU INSERT column count without updating schema.sql
**What goes wrong:** Live NEON has the column (from ALTER TABLE), but `schema.sql` never gets updated — next developer spinning up a fresh NEON instance gets an INSERT failure.
**How to avoid:** Both `ALTER TABLE` (for live NEON) and `schema.sql` update (for future fresh installs) must be in the same plan.

### Pitfall 3: Existing ROU rows in NEON remain `is_ranged = false` after migration
**What happens:** `ALTER TABLE ... DEFAULT false` sets all existing rows to `false`. This is correct — existing rows pre-date the feature and did not carry ranged data.
**Impact:** Only stores where a new ROU upload happens after Phase 7 is deployed will have meaningful `is_ranged` data. This is acceptable behaviour and matches the audit expectation.
**Warning signs:** None — this is expected. Plan should document it.

### Pitfall 4: Mock sequence count in upload.test.ts may need updating if comments are stale
**What goes wrong:** The existing `upload.test.ts` "returns 200 with ok:true for valid ROU upload" test passes a CSV without a Ranged column. After the parser change, rows will parse `isRanged: false`. The INSERT still fires once (same `withOrgContext` call count). The test should continue to pass without mock changes.
**Validation:** Confirm the test still passes by running `npm test` after each change.

### Pitfall 5: match.test.ts mock data for rouRows needs `is_ranged` field
**What goes wrong:** After `match.ts` is updated to type the `rouRows` result with `is_ranged: boolean`, the existing mock data objects in `match.test.ts` (line 152-154) omit `is_ranged`. TypeScript may not error at the test layer (mocks are untyped), but the test documents incorrect expectations.
**How to avoid:** Update the `match.test.ts` mock `rouRows` objects to include `is_ranged: false` in the existing test and add a new test that passes `is_ranged: true` and asserts ranged-first sort activates.

---

## Code Examples

### Pattern 1: Mirroring dead-stock isRanged parse in parseRouFile
```typescript
// Source: parser.ts lines 288-294 (dead-stock pattern to replicate)
// Add to parseRouFile after soh parsing, before result.push():
const rangedCol = colMap["Ranged"];
const isRanged =
  rangedCol !== undefined
    ? RANGED_TRUTHY.has((row[rangedCol]?.trim() ?? "").toLowerCase())
    : false;

result.push({ sku, description, rou, soh, isRanged });
```

### Pattern 2: UNNEST boolean array in NEON (proven pattern from dead_stock INSERT)
```typescript
// Source: upload.ts lines 165-166 and 177 (dead_stock INSERT)
const ranged = rows.map((r) => r.isRanged);

(tx) => tx`
  INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, is_ranged, uploaded_at)
  SELECT ${orgId}, ${storeId}::uuid,
         unnest(${skus}::text[]),
         unnest(${descriptions}::text[]),
         unnest(${rous}::float8[]),
         unnest(${sohs}::float8[]),
         unnest(${ranged}::boolean[]),
         NOW()
`
```

### Pattern 3: Reading is_ranged from rouRows in match.ts
```typescript
// Source: match.ts lines 123-132 (current pattern to update)
// In the withOrgContext TypeScript type annotation, add is_ranged: boolean
// In the .map(), replace isRanged: false with isRanged: r.is_ranged

const rouData: RouItem[] = rouRows
  .filter((r) => !storeFilter || storeFilter.includes(r.store_name))
  .map((r) => ({
    sku: r.sku,
    store: r.store_name,
    rou: r.rou,
    isRanged: r.is_ranged,  // read from DB, not hardcoded
    soh: r.soh,
  }));
```

### Pattern 4: Test asserting ranged-first sort activates via match route
```typescript
// New test to add to match.test.ts after implementation
it("returns results with ranged items sorted first when is_ranged=true in rou_data", async () => {
  const mock = vi.mocked(withOrgContext);
  mock.mockResolvedValueOnce([
    { sku: "SKU1", description: "Item 1", soh: 100, store_name: "Store A" },
  ]);
  mock.mockResolvedValueOnce([
    { sku: "SKU1", description: "Item 1", rou: 5, soh: 5, is_ranged: false, store_name: "Store B" },
    { sku: "SKU1", description: "Item 1", rou: 3, soh: 5, is_ranged: true,  store_name: "Store C" },
  ]);
  // Store C (ranged, rou=3) must appear before Store B (non-ranged, rou=5) despite lower ROU
  const res = await app.request(...);
  const body = await res.json();
  expect(body.results[0].bestMatch.store).toBe("Store C");
  expect(body.results[0].bestMatch.isRanged).toBe(true);
});
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npm test -- --reporter=verbose` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MATCH-05 | Ranged-first sort activates when `is_ranged=true` from `rou_data` | integration (route) | `cd apps/worker && npm test -- match.test.ts` | New test in existing file |
| MATCH-06 | `parseRouFile` parses "checked", "yes", "true", "1", "y" → `isRanged: true` | unit | `cd apps/worker && npm test -- parser.test.ts` | New test in existing file |
| MATCH-06 | `is_ranged` value persisted in `rou_data` via ROU upload | integration (route) | `cd apps/worker && npm test -- upload.test.ts` | New test in existing file |

### Sampling Rate
- **Per task commit:** `cd apps/worker && npm test -- --reporter=verbose`
- **Per wave merge:** `cd apps/worker && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure (Vitest + `@cloudflare/vitest-pool-workers`) covers all phase requirements. All new tests are additions to existing test files, not new files.

---

## Environment Availability

Schema migration requires a live NEON connection. This is a manual step — the plan should document the `ALTER TABLE` statement and instruct the developer to run it via the NEON SQL editor or `psql`.

| Dependency | Required By | Available | Notes |
|------------|-------------|-----------|-------|
| NEON Postgres | ALTER TABLE migration | Must be confirmed | Developer must run ALTER manually against the live NEON instance |
| `vitest` / `npm test` | Test validation | Confirmed | 84/85 tests passing (1 pre-existing webhook failure unrelated to Phase 7) |
| Cloudflare Workers (wrangler) | Deployment | Confirmed | Existing wrangler.jsonc; paid plan already active |

**Pre-existing failing test (not Phase 7 scope):**
`webhook.test.ts > returns 200 and reverts subscriptions to free on customer.subscription.deleted` — fails with 500 response. This failure existed before Phase 7 and is unrelated. [VERIFIED: `rtk vitest run` output]

---

## Security Domain

Phase 7 makes no authentication, authorisation, or input sanitisation changes. The `is_ranged` column is:
- Set from parsed CSV/XLSX file content (boolean already coerced by `RANGED_TRUTHY` set — no SQL injection surface)
- Scoped to `org_id` via existing RLS policies that already cover `rou_data`
- Not exposed as a user-controlled filter parameter

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V2 Authentication | No | No change to auth flow |
| V3 Session Management | No | No session changes |
| V4 Access Control | No — existing RLS covers `rou_data` | `org_id` RLS policy already on `rou_data` |
| V5 Input Validation | Yes — `is_ranged` parsed from file | `RANGED_TRUTHY` set limits to safe values; UNNEST cast to `boolean[]` prevents injection |
| V6 Cryptography | No | No crypto changes |

---

## State of the Art

This phase is entirely internal to the project. No ecosystem changes apply. The patterns used (UNNEST bulk insert, `withOrgContext` RLS transaction, `cloudflarePool` Vitest) are all established and validated in prior phases.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NEON `@neondatabase/serverless` returns SQL `BOOLEAN` as JS `boolean` (not string) | Architecture Patterns | If it returns `"t"/"f"` strings, `r.is_ranged` in match.ts would always be truthy — a coercion step would be needed. Verify by adding `console.log(rouRows[0].is_ranged, typeof rouRows[0].is_ranged)` in a local smoke test after the ALTER. |

---

## Open Questions

1. **Does the live NEON instance require special access to run the ALTER TABLE?**
   - What we know: The `pharmiq_app` role has `SELECT, INSERT, UPDATE, DELETE` — no DDL permissions per `schema.sql` line 102.
   - What's unclear: The ALTER must be run by `neondb_owner` (the superuser role). The developer must use the NEON SQL editor or a `neondb_owner` connection string, not the `DATABASE_URL` env var (which connects as `pharmiq_app`).
   - Recommendation: Plan explicitly states "run via NEON SQL editor or a neondb_owner connection — do not use the Workers DATABASE_URL."

---

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/worker/src/db/schema.sql` — verified `rou_data` table definition (no `is_ranged` column)
- Codebase: `apps/worker/src/lib/parser.ts` — verified `RANGED_TRUTHY` set, `HEADER_ALIASES` Ranged entry, dead-stock `isRanged` parsing pattern
- Codebase: `apps/worker/src/routes/upload.ts` — verified ROU UNNEST INSERT, dead-stock INSERT pattern with `is_ranged`
- Codebase: `apps/worker/src/routes/match.ts` — verified hardcoded `isRanged: false` at line 130, comment at line 102
- Codebase: `apps/worker/src/__tests__/match.test.ts` — verified mock patterns, existing tests unaffected
- Codebase: `apps/worker/src/__tests__/upload.test.ts` — verified mock sequence ordering pattern
- `.planning/v1.0-MILESTONE-AUDIT.md` — INT-01 finding and exact fix description
- `.planning/phases/04-matching-algorithm/04-01-SUMMARY.md` — decision log confirming `isRanged: false` was deliberate deferral

### Secondary (MEDIUM confidence)
- `vitest run` output — confirmed 84/85 tests passing; 1 pre-existing failure in `webhook.test.ts` unrelated to Phase 7

---

## Metadata

**Confidence breakdown:**
- Gap location and fix: HIGH — code verified line by line; no ambiguity
- Schema migration approach (ALTER TABLE): HIGH — standard Postgres DDL; IF NOT EXISTS guard is safe
- Test mock strategy: HIGH — established pattern from upload.test.ts
- NEON boolean wire format: MEDIUM (A1 assumption) — consistent with driver behaviour but not re-confirmed in this session

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (no fast-moving dependencies; pure internal change)
