# Phase 2: Logic Audit - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit the existing Django matching algorithm in `stock_transfer_project/api/views.py`, produce a written algorithm spec, port the algorithm to a pure-computation TypeScript function, and write passing unit tests covering all documented cases including the months-cover cap. At the end of this phase, `apps/worker/src/matcher.ts` exists with passing Vitest tests and `apps/worker/src/ALGORITHM-SPEC.md` is the authoritative algorithm reference.

This phase does NOT include: API endpoint wiring, file upload/parsing, results UI, or freemium enforcement. Those are Phases 3, 4, and 5.

</domain>

<decisions>
## Implementation Decisions

### TypeScript Function Interface
- **D-01:** The matching function is pure computation — `matchTransfers(deadStock: DeadStockItem[], rouData: RouItem[], opts: MatchOptions): MatchResult[]`. It accepts already-parsed in-memory arrays, no file I/O. Phase 4 calls it with data fetched from NEON.
- **D-02:** `DeadStockItem` carries: `{ sku: string, soh: number, description: string, cost: number }` — matching the fields the prototype parses from a FRED dead-stock export.
- **D-03:** `RouItem` carries: `{ sku: string, store: string, rou: number, isRanged: boolean }` — matching the fields stored in the `rou_data` NEON table.
- **D-04:** `MatchOptions` carries at minimum: `{ originStore: string, monthsCoverTarget: number }`. Additional options (sell-through limit months) are Claude's discretion.
- **D-05:** Function lives at `apps/worker/src/matcher.ts`. Tests live at `apps/worker/src/__tests__/matcher.test.ts`.

### Months-Cover Cap
- **D-06:** Phase 2's TypeScript function **includes the months-cover cap** — `monthsCoverTarget` is a required parameter. The Django version has no cap; the TypeScript port implements the correct behavior from the start.
- **D-07:** Cap formula (from MATCH-03): `maxTransferQty = (monthsCoverTarget × destinationROU) − destinationExistingSOH`, clamped to `≥ 0`.
- **D-08:** If a destination store's existing SOH already meets or exceeds the cap (`existingSOH >= monthsCoverTarget × rou`), that store is excluded from results entirely (MATCH-04).
- **D-09:** Full Vitest tests for the cap formula and exclusion logic are written in Phase 2 — Phase 4 does not need to add cap tests.

### Algorithm Bugs to Fix in TypeScript Port
- **D-10:** `is_ranged` parsing bug — Django only accepts `'checked'` (case-insensitive). TypeScript port must accept all truthy variants: `checked`, `yes`, `true`, `1`, `y` (case-insensitive) per MATCH-06.
- **D-11:** NaN/missing value silencing bug — Django does `pd.to_numeric(...) or 0` which silently defaults NaN to 0. TypeScript port must NOT silently default; instead the function should surface NaN/missing values as a data quality signal (exact mechanism — thrown error, flagged result, or filtered-out item — is Claude's discretion) per MATCH-07.
- **D-12:** Months-cover cap absence — Django has no cap. TypeScript port adds it (see D-06–D-09).

### Algorithm Spec
- **D-13:** Spec lives at `apps/worker/src/ALGORITHM-SPEC.md` — co-located with the code it describes, checked into the project as a living reference document.
- **D-14:** Spec must cover all 5 AUDIT-01 sections, each with a worked numeric example:
  1. Sell-through filter (`destination ROU ≥ origin SOH / 12`)
  2. Months-cover cap formula (`maxQty = coverTarget × destROU − destSOH`, clamped to 0)
  3. Ranged sort order (ranged-first, then ROU descending within each group)
  4. `is_ranged` parsing (all truthy variants)
  5. NaN/missing-value edge cases (what happens when ROU or SOH is null/NaN)
- **D-15:** Each section notes Django's actual behavior and flags bugs/deviations where the TypeScript port intentionally differs.

### Claude's Discretion
- Exact TypeScript type definitions and file names for types (`matcher.ts` may export types, or a separate `types/matcher.ts`)
- NaN/missing value mechanism: thrown error vs `{ warnings: string[] }` on the result vs filtering the item out
- Whether to use `describe`/`it` nesting structure or flat `test()` calls in the test file
- `MatchResult` shape (how many fields to return — must at minimum include fields needed for RESULTS-01: SKU, description, source store, qty to transfer, destination store, destination ROU, months cover, sell-through time)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm Audit Target
- `stock_transfer_project/api/views.py` — the Django implementation being audited; read the `find_transfer_matches` and `upload_sales_data` functions in full before writing the spec or tests

### Requirements
- `.planning/REQUIREMENTS.md` §Matching Algorithm — MATCH-01 through MATCH-07 define every correctness requirement the TypeScript port must satisfy
- `.planning/REQUIREMENTS.md` §Logic Audit — AUDIT-01, AUDIT-02 define the spec and test coverage requirements
- `.planning/ROADMAP.md` §Phase 2 — goal and success criteria for this phase

### Test Infrastructure
- `apps/worker/vitest.config.ts` — Vitest pool config (`@cloudflare/vitest-pool-workers`); tests run inside a Workers miniflare environment
- `apps/worker/src/__tests__/` — existing test files for pattern reference (`auth.test.ts`, `health.test.ts`)

### Phase 1 Code (Integration Context)
- `apps/worker/src/types.ts` — existing Worker types; `matcher.ts` types should be consistent
- `apps/worker/src/index.ts` — Worker entry point; Phase 4 will import `matchTransfers` from here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/worker/src/__tests__/auth.test.ts` — test file pattern to follow for matcher tests (import style, describe blocks, assertion style)
- `apps/worker/vitest.config.ts` — already configured; no new test config needed

### Established Patterns
- `async/await` for all async ops (Phase 1 CONTEXT.md D-11) — if `matchTransfers` is async, use `async/await`; pure sync is fine for a computation-only function
- camelCase keys in all responses (Phase 1 CONTEXT.md) — `MatchResult` fields should be camelCase: `isRanged`, `sellThrough`, `monthsCover`, `qtyToTransfer`, etc.
- TypeScript throughout — no `any` types, explicit interfaces for all inputs/outputs

### Integration Points
- Phase 4 imports `matchTransfers` from `apps/worker/src/matcher.ts` and calls it from the Hono match route
- `MatchResult` fields feed directly into the RESULTS-01 virtualized table columns: SKU, description, source store, qty to transfer, destination store, destination ROU, months cover, sell-through time

</code_context>

<specifics>
## Specific Ideas

- The Django version's `sell_through_limit_months = 12` is hardcoded. The TypeScript function should keep this as a constant internally (not a user-configurable parameter — that's a v2 requirement per REQUIREMENTS.md).
- The Django `totalCost` calculation (`item['cost'] * item['soh']`) is a display aggregate, not an algorithm decision. `matchTransfers` can include cost fields in results or leave aggregation to the caller — Claude's discretion.
- The spec should read like a reference doc, not a code comment — numbered rules, worked examples with concrete numbers, and explicit "Django behavior: X / Correct behavior: Y" notes for each bug.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-logic-audit*
*Context gathered: 2026-03-29*
