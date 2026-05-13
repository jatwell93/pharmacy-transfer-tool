# Phase 16: Department + Ranged Column Parsing - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add two new data fields — department and ranged status — from the FRED dead stock export through the full stack: parser → DB → match API → match results table. Both fields come from the dead stock file only. Department requires a new nullable TEXT column in the dead_stock NEON table (migration). Ranged status (is_ranged) already exists in dead_stock but is not currently returned in match results — this phase exposes it. Neither field is required; missing columns produce blank/null values without upload failure.

</domain>

<decisions>
## Implementation Decisions

### Department Header Aliasing (parser.ts)
- **D-01:** Canonical name is `Department`. Add to `HEADER_ALIASES` with aliases: `"Department"`, `"Dept"`, `"Dept."`, `"Drug Dept"`, `"Product Department"`.
- **D-02:** Department is optional. When the column is absent from the dead stock file, the `department` field on `DeadStockRow` defaults to `""` (empty string) — same behaviour as `description` when absent. Frontend renders nothing in the cell.
- **D-03:** `DeadStockRow` interface gains a `department: string` field. Downstream, `dead_stock` table gains `department TEXT` (nullable). Match response maps null → `""` before sending to frontend.

### Ranged Column in Match Results
- **D-04:** `is_ranged` is already stored in the `dead_stock` table (Phase 7). The match.ts query must be updated to `SELECT ds.sku, ds.description, ds.soh, ds.cost_ex, ds.is_ranged, ds.department, s.name AS store_name FROM dead_stock ds ...`.
- **D-05:** `MatchResult` gains `isRanged: boolean` and `department: string` fields. `DeadStockItem` (matcher.ts input type) gains `isRanged: boolean` and `department: string` so these values pass through the match pipeline.

### Ranged Column Display (frontend)
- **D-06:** Ranged column renders a checkmark (`✓`) for `true` and a dash (`—`) for `false`. No colored pills — compact and scannable.
- **D-07:** Ranged value comes from the source (dead stock) item and is shown in main result rows only. Sub-match rows (alt destination rows) do not repeat it — it's not a per-destination attribute.

### Column Placement (MatchPage.tsx)
- **D-08:** Column order after adding two new columns: `SKU | Description | Department | Ranged | Source Store | Destination Store | Qty to Transfer | Dest ROU | Months Cover | Sell-Through Time`. Department and Ranged appear immediately after Description — groups all item identity fields together for at-a-glance scanning.
- **D-09:** Department column width: `1fr` (flex, same as Description). Truncates with ellipsis if overflow. Ranged column width: `60px` (fixed — only holds a single character).
- **D-10:** Grid template updates from `grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px]` to `grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]`. Both header row and main result rows must be updated. Sub-match rows use same grid but leave Department and Ranged cells empty.

### Schema Migration
- **D-11:** Migration delivered as: (a) update `apps/worker/src/db/schema.sql` canonical DDL to add `department TEXT` to the `dead_stock` table, and (b) add a `-- MIGRATION REQUIRED` comment block in `apps/worker/src/routes/upload.ts` with the exact `ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;` statement to run manually in NEON SQL editor before deploying.
- **D-12:** Migration must be run as `neondb_owner` (not the `pharmiq_app` app role which lacks DDL rights). Comment in upload.ts must note this.

### Testing
- **D-13:** Existing parser unit tests in `apps/worker/src/__tests__/` must continue to pass unchanged. New tests must cover: (a) Department header recognised from each alias, (b) missing Department column → `department: ""` not an error, (c) Department value correctly extracted per row.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm & Types
- `apps/worker/src/matcher.ts` — `MatchResult`, `DeadStockItem`, `DestinationMatch` type definitions; both interfaces need new fields
- `apps/worker/src/lib/parser.ts` — `DeadStockRow`, `HEADER_ALIASES`, `parseDeadStockFile`; all three need updating for department
- `apps/worker/ALGORITHM-SPEC.md` — Authoritative algorithm reference; check before changing matcher types

### Database
- `apps/worker/src/db/schema.sql` — Canonical DDL; add `department TEXT` to `dead_stock` table
- Phase 7 migration pattern: `apps/worker/src/routes/upload.ts` header comments — follow the `-- MIGRATION REQUIRED` convention

### API Route
- `apps/worker/src/routes/match.ts` — Dead stock query (line ~132) and `DeadStockItem` mapping (line ~177) need `is_ranged` and `department` added

### Frontend Table
- `apps/web/src/pages/MatchPage.tsx` — `columnHeaders` array (line 240), grid template cols (lines 479, 513, 552), and result row render; all need Department and Ranged columns

### Requirements
- `.planning/REQUIREMENTS.md` — TABLE-01, TABLE-02 acceptance criteria
- `.planning/ROADMAP.md` Phase 16 — Success criteria (4 items); criterion 3 (missing dept → null/blank not error) and criterion 4 (tests) are non-negotiable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HEADER_ALIASES` + `buildColumnMap` in `parser.ts` — Department slot drops in identically to how `Cost Ex` was added. Follow same optional-column pattern (check `colMap["Department"] !== undefined` before reading).
- `RANGED_TRUTHY` set in `parser.ts` — already handles the ranged boolean parse; no changes needed.
- `withOrgContext` in `db/client.ts` — all DB queries use this; match.ts dead stock query just needs additional columns selected.

### Established Patterns
- Optional column pattern: `const deptCol = colMap["Department"]; const department = deptCol !== undefined ? (row[deptCol]?.trim() ?? "") : "";` — mirrors how `descCol` and `rangedCol` work.
- `-- MIGRATION REQUIRED` comment block in `upload.ts` header — Phase 7 and Phase 10 both use this; follow exact same style.
- Grid col template + absolute-positioned rows in MatchPage — adding columns means updating the `grid-cols-[...]` string in exactly 3 places: header div, main result row div, sub-match row div.

### Integration Points
- `DeadStockItem` in `matcher.ts` is the bridge between match.ts and matchTransfers(). Adding `isRanged` and `department` to it means they flow through to `MatchResult` without touching the algorithm logic.
- The `results` array returned by `matchTransfers` is what the frontend renders — once `MatchResult` has the new fields, frontend access is straightforward.
- Sub-match rows (`type: 'subMatch'`) currently reference `item.parentSku`, `item.parentDescription`, `item.parentSourceStore` — if we need to pass department to sub-rows in future, the `FlatItem` union type in MatchPage would need a `parentDepartment` field. For Phase 16 (main row only) this is not needed.

</code_context>

<specifics>
## Specific Ideas

- Ranged column: `✓` / `—` characters only. No icon library import needed.
- Department aliases: exactly `["Department", "Dept", "Dept.", "Drug Dept", "Product Department"]` — user confirmed "Department (standard)" from real FRED exports.
- Both new columns appear between Description and Source Store in the table.

</specifics>

<deferred>
## Deferred Ideas

- Phase 17 will add filter controls for Ranged and Department — the column definitions here must be stable before those filters are built.
- Sub-match row Department/Ranged display (if ever needed) requires adding `parentDepartment` and `parentIsRanged` to the `FlatItem` union type.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-Department + Ranged Column Parsing*
*Context gathered: 2026-05-13*
