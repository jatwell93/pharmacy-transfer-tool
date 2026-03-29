# Phase 2: Logic Audit - Research

**Researched:** 2026-03-29
**Domain:** Algorithm audit, TypeScript pure-function port, Vitest unit testing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The matching function is pure computation — `matchTransfers(deadStock: DeadStockItem[], rouData: RouItem[], opts: MatchOptions): MatchResult[]`. Accepts already-parsed in-memory arrays, no file I/O.
- **D-02:** `DeadStockItem` carries: `{ sku: string, soh: number, description: string, cost: number }`.
- **D-03:** `RouItem` carries: `{ sku: string, store: string, rou: number, isRanged: boolean }`.
- **D-04:** `MatchOptions` carries at minimum: `{ originStore: string, monthsCoverTarget: number }`.
- **D-05:** Function lives at `apps/worker/src/matcher.ts`. Tests live at `apps/worker/src/__tests__/matcher.test.ts`.
- **D-06:** Phase 2's TypeScript function includes the months-cover cap — `monthsCoverTarget` is a required parameter.
- **D-07:** Cap formula: `maxTransferQty = (monthsCoverTarget × destinationROU) − destinationExistingSOH`, clamped to `>= 0`.
- **D-08:** If a destination store's existing SOH already meets or exceeds the cap, that store is excluded from results entirely.
- **D-09:** Full Vitest tests for cap formula and exclusion logic are written in Phase 2.
- **D-10:** `is_ranged` parsing must accept all truthy variants: `checked`, `yes`, `true`, `1`, `y` (case-insensitive).
- **D-11:** NaN/missing value silencing bug — TypeScript port must NOT silently default; surface as a data quality signal (mechanism is Claude's discretion).
- **D-12:** Months-cover cap absence in Django — TypeScript port adds it.
- **D-13:** Spec lives at `apps/worker/src/ALGORITHM-SPEC.md`.
- **D-14:** Spec must cover all 5 AUDIT-01 sections with worked numeric examples.
- **D-15:** Each spec section notes Django's actual behavior and flags bugs/deviations.

### Claude's Discretion

- Exact TypeScript type definitions and file names for types (`matcher.ts` may export types, or a separate `types/matcher.ts`)
- NaN/missing value mechanism: thrown error vs `{ warnings: string[] }` on the result vs filtering the item out
- Whether to use `describe`/`it` nesting structure or flat `test()` calls in the test file
- `MatchResult` shape (minimum fields: SKU, description, source store, qty to transfer, destination store, destination ROU, months cover, sell-through time)
- `MatchOptions` additional option: sell-through limit months (hardcoded internally per specifics, or optionally configurable)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | Existing Django matching logic audited — document with test cases covering: sell-through filter, months-cover cap, ranged sort, BOM parsing, NaN edge cases | Django algorithm fully reverse-engineered below; all 5 spec sections mapped to algorithm lines |
| AUDIT-02 | Ported TypeScript matching function has unit test coverage for all documented algorithm cases | Vitest 4.1.2 + cloudflare pool already configured; test patterns established in existing test files |
</phase_requirements>

---

## Summary

Phase 2 is an audit-and-port phase, not a library-research phase. The primary research artifact is a forensic reading of `stock_transfer_project/api/views.py` — specifically the `upload_sales_data` and `find_transfer_matches` functions. The Django code is 190 lines and contains the complete matching algorithm. Three concrete bugs have been identified by reading the source: (1) `is_ranged` only accepts `"checked"` (line 82), (2) `pd.to_numeric(...) or 0` silently swallows NaN (lines 81, 126, 132-133), and (3) there is no months-cover cap whatsoever. The TypeScript port must fix all three.

The Vitest + `@cloudflare/vitest-pool-workers` test stack is already configured and working. Vitest 4.1.2 with pool-workers 0.13.5 runs tests inside Miniflare. For `matcher.ts`, which is a pure computation function with no bindings, no special Miniflare setup is needed — but the existing pool config handles it transparently. The test pattern is established: `describe`/`it` blocks, explicit type assertions, `vi.mock` where needed (not needed for a pure function).

The algorithm, when correctly specified, is straightforward: index ROU data by SKU, for each dead-stock item find destination stores with matching SKU and sufficient ROU, apply sell-through filter and months-cover cap, sort results ranged-first then ROU-descending, and return. The TypeScript implementation will be synchronous and has no external dependencies.

**Primary recommendation:** Read the Django source directly (already done in research), write ALGORITHM-SPEC.md first as numbered rules with worked examples, then implement `matcher.ts` to satisfy those rules, then write tests that cover every rule including the three bug-fix behaviors. Do not interleave spec and implementation — spec first, tests second, code third enables true TDD.

---

## Django Algorithm — Complete Forensic Audit

This section captures the full behavior of the existing Django implementation, line by line, as the basis for ALGORITHM-SPEC.md.

### Source: `stock_transfer_project/api/views.py`

#### Stage 1 — Dead Stock File Parsing (`find_transfer_matches`, lines 124-134)

```python
dead_stock_items = []
for _, row in df.iterrows():
    if pd.isna(row.get('Item Code')) or (pd.to_numeric(row.get('SOH'), errors='coerce') or 0) <= 0:
        continue

    dead_stock_items.append({
        'sku': str(row['Item Code']).strip(),
        'description': str(row['Item Description']).strip(),
        'soh': int(pd.to_numeric(row['SOH'], errors='coerce') or 0),
        'cost': float(pd.to_numeric(str(row['Cost Ex']).replace('$', '').replace(',', ''), errors='coerce') or 0)
    })
```

**Behavior:**
- Rows with null SKU are skipped.
- Rows with SOH = 0 or negative are skipped (this is the dead-stock filter: item must have stock to transfer).
- NaN SOH is treated as 0 by `or 0`, so a row with NaN SOH is skipped (SOH 0 <= 0). This is accidentally correct but for the wrong reason.
- NaN cost is silently set to 0 — BUG: `or 0` on float NaN silences missing cost data.
- `Cost Ex` has `$` and `,` stripped before numeric conversion.

**Bug (D-11):** `pd.to_numeric(...) or 0` means NaN cost = 0.0 silently. The TypeScript port should flag items with missing cost as a data quality warning rather than silently zero them.

#### Stage 2 — ROU Data Lookup (lines 138-153)

```python
potential_matches_from_db = Sale.objects.filter(
    sku__in=skus_to_check,
    rou__gt=0
).exclude(
    store__iexact=origin_store
)
```

**Behavior:**
- Fetches all stores (excluding origin) that have a record for the given SKUs with `rou > 0`.
- In the TypeScript port this becomes: filter `rouData` to items where `sku` is in `deadStock` SKU list AND `rou > 0` AND `store` (case-insensitive) is not `originStore`.
- Results grouped by SKU into `sales_by_sku` dict.
- `isRanged` flag comes from the stored `sale.is_ranged` value (already parsed at upload time).

#### Stage 3 — Sell-Through Filter (lines 160-166)

```python
sell_through_limit_months = 12
min_required_rou = item['soh'] / sell_through_limit_months

valid_matches = [
    match for match in potential_matches_for_item
    if match['rou'] >= min_required_rou
]
```

**Behavior:**
- A destination store qualifies only if `rou >= soh / 12`.
- This ensures the destination store will sell through the transferred stock within 12 months.
- `sell_through_limit_months` is hardcoded to 12 — not user-configurable. Per CONTEXT.md specifics, keep as internal constant.
- **No months-cover cap exists at all** — this is the Django version's omission (D-12).

**Correct behavior for TypeScript (MATCH-02):** Keep the sell-through filter as-is: `rou >= soh / 12`.

**Missing in Django (MATCH-03, MATCH-04):** After sell-through filter, apply cap: exclude stores where `existingSOH >= monthsCoverTarget * rou`. For passing stores, compute `maxTransferQty = Math.max(0, monthsCoverTarget * rou - existingSOH)`.

**Important:** In the TypeScript port, `existingSOH` for destination stores comes from `RouItem.soh` — but wait. Looking at CONTEXT.md D-03: `RouItem` carries `{ sku, store, rou, isRanged }` — **no SOH field**. This is a design gap that must be resolved.

**Gap resolution (see Open Questions):** The months-cover cap formula (D-07) requires `destinationExistingSOH`. Since `RouItem` has no `soh` field, either: (a) the cap formula uses 0 as destSOH (conservative: always transfer up to `monthsCoverTarget * rou`), or (b) `RouItem` must gain a `soh` field. Given the CONTEXT.md only lists `{ sku, store, rou, isRanged }` for `RouItem`, option (a) is the natural default for Phase 2 — the cap formula becomes `maxTransferQty = monthsCoverTarget * rou` (since destSOH = 0). Phase 4 will have actual NEON data with SOH if desired. However, since Phase 2 is testing the cap formula itself, the test cases should include the full formula with `destSOH` as a parameter. Recommend adding optional `soh?: number` to `RouItem` (defaults to 0 when absent).

#### Stage 4 — Sell-Through Calculation (lines 171-173)

```python
for match in valid_matches:
    match['sellThrough'] = item['soh'] / match['rou']
```

**Behavior:** `sellThrough = originSOH / destinationROU` (in months). This is the number of months for the destination store to sell through the transferred quantity. Added to each match object before sorting.

**TypeScript:** Include `sellThrough` in `MatchResult`.

#### Stage 5 — Sort Order (line 175)

```python
valid_matches.sort(key=lambda x: (-x['isRanged'], -x['rou']))
```

**Behavior:**
- Primary sort: ranged items first (`isRanged = True` sorts before `False` because `-True = -1 < 0 = -False`).
- Secondary sort: higher ROU first within each group.
- In Python, `bool` is a subclass of `int`: `True = 1, False = 0`. So `-x['isRanged']` is `-1` for ranged, `0` for non-ranged.

**TypeScript equivalent:**
```typescript
validMatches.sort((a, b) => {
  if (a.isRanged !== b.isRanged) return a.isRanged ? -1 : 1; // ranged first
  return b.rou - a.rou; // higher ROU first
});
```

#### Stage 6 — Result Assembly (lines 177-183)

```python
results.append({
    **item,
    'allMatches': valid_matches,
    'bestMatch': valid_matches[0]
})
total_cost += item['cost'] * item['soh']
```

**Behavior:**
- Each result contains all item fields + `allMatches` (ranked list) + `bestMatch` (top match).
- `totalCost` is the sum of `cost * soh` for all matched items (not per-destination).
- Items with no valid matches are silently excluded from results.

**TypeScript `MatchResult`:** Should at minimum include fields for RESULTS-01: `sku`, `description`, `sourceStore`, `qtyToTransfer`, `destinationStore`, `destinationRou`, `monthsCover`, `sellThrough`. Plus `isRanged` for sorting/filtering. `allMatches` and `bestMatch` are Claude's discretion for the internal structure.

#### Stage 7 — `is_ranged` Parsing Bug (line 82, in `upload_sales_data`)

```python
is_ranged=str(row['Ranged']).strip().lower() == 'checked'
```

**Django behavior:** Only `"checked"` (case-insensitive) sets `is_ranged = True`. All other values (`"yes"`, `"true"`, `"1"`, `"y"`) are treated as `False`.

**TypeScript fix (D-10, MATCH-06):**
```typescript
const RANGED_TRUTHY = new Set(['checked', 'yes', 'true', '1', 'y']);
const isRanged = RANGED_TRUTHY.has(String(raw).trim().toLowerCase());
```

Note: In the TypeScript port, `isRanged` parsing is an input transformation that happens before `matchTransfers` is called (it's part of file parsing in Phase 3). However, since `RouItem.isRanged` is a boolean, the parsing step — and its correctness — needs to be tested. In Phase 2, the test can inject `RouItem` objects directly with `isRanged: true/false` booleans. The parsing logic itself (string -> bool) is a separate utility worth testing in Phase 2 as a helper function.

---

## Standard Stack

### Core (already installed in `apps/worker`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^6.0.2 | Static typing for matcher function and types | Project standard; strict mode enforced in tsconfig |
| Vitest | ^4.1.2 | Unit test runner | Already configured; matches CF Workers runtime via pool |
| @cloudflare/vitest-pool-workers | ^0.13.5 | Run tests inside Miniflare environment | Required by vitest.config.ts; already working |

**No additional packages are required for this phase.** `matcher.ts` is pure computation with no I/O dependencies. All needed packages are already present.

### Installation

```bash
# No new packages needed — all dependencies already installed in apps/worker
# Verify:
cd apps/worker && npm test
```

### Version verification (confirmed from package.json)

| Package | Installed Version | Verified |
|---------|-------------------|---------|
| vitest | ^4.1.2 | from `apps/worker/package.json` |
| @cloudflare/vitest-pool-workers | ^0.13.5 | from `apps/worker/package.json` |
| typescript | ^6.0.2 | from `apps/worker/package.json` |

---

## Architecture Patterns

### Recommended File Structure for Phase 2

```
apps/worker/src/
├── matcher.ts                  # Pure matching function + exported types
├── ALGORITHM-SPEC.md           # Algorithm reference doc (D-13)
├── types.ts                    # Existing Worker types (Env, Variables)
├── index.ts                    # Worker entry point (Phase 4 adds import here)
├── middleware/
│   └── auth.ts
├── routes/
│   └── health.ts
├── db/
│   └── client.ts
└── __tests__/
    ├── auth.test.ts             # Existing
    ├── health.test.ts           # Existing
    └── matcher.test.ts          # NEW — Phase 2
```

### Pattern 1: Pure Computation Function with Explicit Types

**What:** `matcher.ts` exports types and a single pure function. No Hono, no NEON, no Clerk.
**When to use:** Any algorithm that takes data and returns data without side effects.

```typescript
// apps/worker/src/matcher.ts
// Source: established TypeScript pure-function pattern, consistent with existing types.ts

export interface DeadStockItem {
  sku: string;
  soh: number;
  description: string;
  cost: number;
}

export interface RouItem {
  sku: string;
  store: string;
  rou: number;
  isRanged: boolean;
  soh?: number; // optional — defaults to 0 when absent; needed for months-cover cap
}

export interface MatchOptions {
  originStore: string;
  monthsCoverTarget: number;
}

export interface DestinationMatch {
  store: string;
  rou: number;
  isRanged: boolean;
  sellThrough: number;       // originSOH / destROU (months)
  monthsCover: number;       // monthsCoverTarget (same for all; derived column)
  qtyToTransfer: number;     // capped transfer quantity
}

export interface MatchResult {
  sku: string;
  description: string;
  soh: number;
  cost: number;
  sourceStore: string;
  bestMatch: DestinationMatch;
  allMatches: DestinationMatch[];
}

// Sell-through limit: hardcoded per CONTEXT.md specifics — v2 will make configurable
const SELL_THROUGH_LIMIT_MONTHS = 12;

// All string values that mean "is ranged = true" (MATCH-06)
const RANGED_TRUTHY_VALUES = new Set(['checked', 'yes', 'true', '1', 'y']);

export function parseIsRanged(raw: unknown): boolean {
  return RANGED_TRUTHY_VALUES.has(String(raw).trim().toLowerCase());
}

export interface DataQualityWarning {
  sku: string;
  field: 'rou' | 'soh' | 'cost';
  reason: string;
}

export function matchTransfers(
  deadStock: DeadStockItem[],
  rouData: RouItem[],
  opts: MatchOptions,
): { results: MatchResult[]; warnings: DataQualityWarning[] } {
  // implementation
}
```

### Pattern 2: Vitest Test Structure (matches existing test files)

**What:** `describe`/`it` nesting matching `auth.test.ts` style. No mocking needed for pure function.
**When to use:** Pure function tests with no external dependencies.

```typescript
// apps/worker/src/__tests__/matcher.test.ts
// Source: pattern from existing apps/worker/src/__tests__/auth.test.ts

import { describe, it, expect } from 'vitest';
import { matchTransfers, parseIsRanged } from '../matcher';
import type { DeadStockItem, RouItem, MatchOptions } from '../matcher';

describe('matchTransfers', () => {
  describe('sell-through filter (MATCH-02)', () => {
    it('excludes destination stores where rou < soh / 12', () => {
      // arrange
      const deadStock: DeadStockItem[] = [
        { sku: 'SKU001', soh: 120, description: 'Test Item', cost: 10.00 }
      ];
      const rouData: RouItem[] = [
        { sku: 'SKU001', store: 'DestStore', rou: 5, isRanged: false }
        // min required rou = 120 / 12 = 10; rou=5 fails filter
      ];
      const opts: MatchOptions = { originStore: 'OriginStore', monthsCoverTarget: 3 };

      // act
      const { results } = matchTransfers(deadStock, rouData, opts);

      // assert
      expect(results).toHaveLength(0);
    });

    it('includes destination stores where rou >= soh / 12', () => {
      const deadStock: DeadStockItem[] = [
        { sku: 'SKU001', soh: 120, description: 'Test Item', cost: 10.00 }
      ];
      const rouData: RouItem[] = [
        { sku: 'SKU001', store: 'DestStore', rou: 10, isRanged: false }
        // min required rou = 120 / 12 = 10; rou=10 passes (boundary)
      ];
      const opts: MatchOptions = { originStore: 'OriginStore', monthsCoverTarget: 3 };

      const { results } = matchTransfers(deadStock, rouData, opts);

      expect(results).toHaveLength(1);
      expect(results[0].bestMatch.store).toBe('DestStore');
    });
  });
});
```

### Pattern 3: Months-Cover Cap Formula

**What:** The core cap calculation applied after the sell-through filter passes.
**Formula (D-07, D-08):**

```
destSOH = rouItem.soh ?? 0
maxTransferQty = Math.max(0, monthsCoverTarget * rou - destSOH)
excluded = destSOH >= monthsCoverTarget * rou  (i.e. maxTransferQty === 0)
```

**Worked example (for spec):**
- `monthsCoverTarget = 3`, `destROU = 10`, `destSOH = 5`
- `maxTransferQty = max(0, 3 * 10 - 5) = max(0, 25) = 25`
- Store is included, transfer qty = 25

**Exclusion example:**
- `monthsCoverTarget = 3`, `destROU = 10`, `destSOH = 35`
- `maxTransferQty = max(0, 3 * 10 - 35) = max(0, -5) = 0`
- Store is excluded from results

### Pattern 4: `{ results, warnings }` Return Shape for NaN Handling

**What:** Rather than throwing or silently defaulting, return warnings alongside results.
**Why this mechanism:** Allows the caller to display data quality info to the user (MATCH-07 requirement). Thrown errors would abort the whole match run. Filtering items out silently hides the problem. Warnings are the least surprising behavior.

```typescript
// Warning emitted when an item has missing/NaN cost
if (isNaN(item.cost) || item.cost === null) {
  warnings.push({ sku: item.sku, field: 'cost', reason: 'cost is missing or non-numeric' });
  // item still participates in matching — cost is only used for display/totalCost
}

// Warning emitted when a RouItem has invalid rou
if (isNaN(rouItem.rou) || rouItem.rou <= 0) {
  warnings.push({ sku: rouItem.sku, field: 'rou', reason: 'rou is missing, zero, or non-numeric' });
  // item is excluded from matching (same as Django's rou__gt=0 filter)
}
```

### Anti-Patterns to Avoid

- **Silently defaulting NaN to 0** — Django's `pd.to_numeric(...) or 0` pattern. Do not translate this to `Number(raw) || 0` in TypeScript. The `|| 0` coerces `NaN` to `0` silently.
- **Mutating input arrays** — `matchTransfers` must not modify `deadStock` or `rouData` arrays. Always map/filter to new arrays.
- **Case-sensitive store comparison** — Django uses `store__iexact` (case-insensitive). TypeScript must use `.toLowerCase()` comparison for `originStore` exclusion.
- **Boolean sort using numeric subtraction** — `(b.isRanged as unknown as number) - (a.isRanged as unknown as number)` is fragile. Use explicit ternary: `a.isRanged !== b.isRanged ? (a.isRanged ? -1 : 1) : b.rou - a.rou`.
- **`or 0` vs null check confusion** — In Python, `0 or 0 = 0` (falsy). `1 or 0 = 1`. But `NaN or 0` = `0` because NaN is falsy. In JavaScript/TypeScript, `NaN || 0` behaves the same. Neither is correct for data quality detection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Floating-point comparison | Custom epsilon function | `Math.abs(a - b) < Number.EPSILON` for exact, or just direct comparison for this use case | Transfer quantities are integers; ROU is a float but direct `>=` comparison is fine |
| Test fixture factories | Complex builder classes | Simple inline object literals | Phase 2 test data is small; factory complexity adds no value |
| NaN detection | Multi-branch type checking | `Number.isNaN(x)` (strict) or `isNaN(x)` (coerces) | `Number.isNaN` is correct; `isNaN('')` returns true but `Number.isNaN('')` returns false |

**Key insight:** This phase is pure TypeScript with no external API calls. The only "library" decision is NaN detection: use `Number.isNaN()` not `isNaN()`. `isNaN('')` returns `true` which is wrong for empty string inputs; `Number.isNaN('')` returns `false` correctly.

---

## Common Pitfalls

### Pitfall 1: `is_ranged` Parsed Once at Upload, Not at Match Time

**What goes wrong:** Implementer writes `isRanged` parsing logic inside `matchTransfers`, but in the real data flow `RouItem.isRanged` is already a boolean coming from the NEON database (parsed at upload time in Phase 3).
**Why it happens:** The Django code has `is_ranged` parsing in `upload_sales_data` (line 82), not in `find_transfer_matches`. The matching function reads the already-stored boolean.
**How to avoid:** Keep `matchTransfers` accepting `isRanged: boolean` on `RouItem`. Export `parseIsRanged(raw: unknown): boolean` as a separate utility for Phase 3 to use. Test both.
**Warning signs:** Test setup that passes string values like `'checked'` directly to `RouItem.isRanged`.

### Pitfall 2: `@cloudflare/vitest-pool-workers` Pool vs `defineWorkersConfig`

**What goes wrong:** Using `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config` (deprecated API removed in 0.13.x) instead of `cloudflarePool` from `@cloudflare/vitest-pool-workers`.
**Why it happens:** Documentation lag — older examples use `defineWorkersConfig`. The wrangler skill SKILL.md still shows the old API.
**How to avoid:** The project already uses the correct API — `cloudflarePool` in `vitest.config.ts`. Do not change `vitest.config.ts`.
**Warning signs:** Import from `@cloudflare/vitest-pool-workers/config` — this module path no longer exists in 0.13.5.

### Pitfall 3: Months-Cover Cap Applied to `soh` on `RouItem` That Doesn't Exist

**What goes wrong:** D-07 cap formula uses `destinationExistingSOH`, but the locked `RouItem` interface (D-03) has no `soh` field.
**Why it happens:** The CONTEXT.md `RouItem` definition was based on the NEON `rou_data` table schema from Phase 1, which may or may not store SOH for destination stores.
**How to avoid:** Default `destSOH = rouItem.soh ?? 0` in the implementation. Add `soh?: number` as optional to `RouItem`. Tests should cover: (a) soh omitted (treated as 0, cap = monthsCoverTarget * rou), (b) soh present and within cap, (c) soh present and exceeds cap.
**Warning signs:** Cap tests that always pass even with destSOH > 0 because the formula always computes `monthsCoverTarget * rou`.

### Pitfall 4: Sell-Through Boundary Condition (Inclusive vs Exclusive)

**What goes wrong:** Django uses `>=` for the sell-through filter (`match['rou'] >= min_required_rou`). Implementing as `>` would fail the boundary case.
**Why it happens:** Off-by-one reading of the condition.
**How to avoid:** Boundary test case: `rou === soh / 12` should be INCLUDED. E.g., soh=120, rou=10, limit=12: `min_rou = 120/12 = 10`, `10 >= 10 = true` → include.
**Warning signs:** Missing boundary test case in the test file.

### Pitfall 5: Sort Stability Assumption

**What goes wrong:** Assuming JavaScript `Array.sort` is stable (preserves relative order of equal elements). In practice, V8 (Node 11+) uses a stable sort. But in the Miniflare/Workers environment, `Array.sort` stability should not be relied upon for test determinism.
**Why it happens:** Tests with two non-ranged stores at the same ROU level are indeterminate without a tiebreaker.
**How to avoid:** Add a stable tiebreaker to the sort (e.g., `|| a.store.localeCompare(b.store)`). Alternatively, ensure test data has unique ROU values within each group so sort order is unambiguous.
**Warning signs:** Flaky tests for sort order when two matches have identical `isRanged` and `rou`.

### Pitfall 6: `totalCost` Aggregate vs `MatchResult` Fields

**What goes wrong:** Putting `totalCost` (sum of `cost * soh` for matched items) inside `matchTransfers` return value, making tests depend on that aggregate.
**Why it happens:** Django response includes `totalCost`. But per CONTEXT.md, aggregation can be left to the caller.
**How to avoid:** Either include it in `{ results, warnings, totalCost }` or leave it out and let the UI compute it via `reduce`. Either way, tests should NOT be written for `totalCost` if the shape decision is left to Claude's discretion — pick a shape and stick to it in the spec.

---

## Code Examples

### Verified Pattern: Existing Test File Import Style

```typescript
// Source: apps/worker/src/__tests__/auth.test.ts (project, verified)
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Named imports from vitest — no default import
// No import assertions; plain ESM
```

### Verified Pattern: NaN Detection in TypeScript

```typescript
// Source: MDN / TypeScript standard library (HIGH confidence)

// CORRECT — strict NaN check, does not coerce
Number.isNaN(NaN);    // true
Number.isNaN(0);      // false
Number.isNaN('');     // false (no coercion)
Number.isNaN(undefined); // false

// INCORRECT for this use case — coerces to number first
isNaN('');            // true (wrong — empty string is not NaN in our context)
isNaN(undefined);     // true (correct but for wrong reason)

// For checking that a value is a valid positive number:
function isValidRou(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && val > 0;
}
```

### Verified Pattern: Sort Ranged-First, ROU-Descending

```typescript
// Source: direct translation from Django views.py line 175 (verified)
// Python: valid_matches.sort(key=lambda x: (-x['isRanged'], -x['rou']))
// TypeScript equivalent:

matches.sort((a, b) => {
  if (a.isRanged !== b.isRanged) {
    return a.isRanged ? -1 : 1; // ranged items first
  }
  return b.rou - a.rou; // higher ROU first within group
});
```

### Verified Pattern: Case-Insensitive String Comparison

```typescript
// Source: standard JavaScript — used in Django as store__iexact
// TypeScript equivalent for originStore exclusion:

const isOriginStore = (storeA: string, storeB: string): boolean =>
  storeA.toLowerCase() === storeB.toLowerCase();

// Usage in filter:
const destinationItems = rouData.filter(
  (item) => !isOriginStore(item.store, opts.originStore) && item.rou > 0
);
```

### Verified Pattern: Vitest Test Run Command

```bash
# Source: apps/worker/package.json scripts (verified)

# Run all tests
cd apps/worker && npm test

# Run specific test file
cd apps/worker && npx vitest run src/__tests__/matcher.test.ts

# Watch mode (development)
cd apps/worker && npx vitest
```

---

## ALGORITHM-SPEC.md Content Plan

The spec document to be written at `apps/worker/src/ALGORITHM-SPEC.md` must cover these 5 sections per D-14:

### Section 1: Sell-Through Filter

**Rule:** A destination store is a valid match for a SKU only if `destROU >= originSOH / SELL_THROUGH_LIMIT_MONTHS` (where `SELL_THROUGH_LIMIT_MONTHS = 12`).

**Worked example:**
- Origin store dead stock: SKU `PARA500`, SOH = 240 units
- `minROU = 240 / 12 = 20 units/month`
- Destination Store A: ROU = 25 → `25 >= 20` → INCLUDED
- Destination Store B: ROU = 15 → `15 >= 20` → EXCLUDED
- Destination Store C: ROU = 20 → `20 >= 20` → INCLUDED (boundary, inclusive)

**Django behavior:** Same formula, hardcoded `sell_through_limit_months = 12`. Correct.
**TypeScript behavior:** Same. No change.

### Section 2: Months-Cover Cap Formula

**Rule:** After sell-through filter passes, compute `maxTransferQty = max(0, monthsCoverTarget * destROU - destSOH)`. Exclude stores where `maxTransferQty === 0`.

**Worked example (cap binds):**
- `monthsCoverTarget = 3`, `destROU = 20`, `destSOH = 10`
- `maxTransferQty = max(0, 3 * 20 - 10) = max(0, 50) = 50`
- `qtyToTransfer = min(originSOH, maxTransferQty) = min(240, 50) = 50`

**Worked example (dest already over cap):**
- `monthsCoverTarget = 3`, `destROU = 20`, `destSOH = 65`
- `maxTransferQty = max(0, 3 * 20 - 65) = max(0, -5) = 0`
- Store excluded from results

**Django behavior:** No months-cover cap exists. All valid sell-through matches return full `originSOH`.
**TypeScript behavior:** Cap enforced. `qtyToTransfer = min(originSOH, maxTransferQty)`.

### Section 3: Ranged Sort Order

**Rule:** Results are sorted: ranged items first (`isRanged = true`), then by `rou` descending within each group.

**Worked example:**
- Match A: `isRanged = false`, `rou = 30`
- Match B: `isRanged = true`, `rou = 10`
- Match C: `isRanged = true`, `rou = 25`
- Sorted order: C (ranged, 25) → B (ranged, 10) → A (non-ranged, 30)

**Django behavior:** Same. `sort(key=lambda x: (-x['isRanged'], -x['rou']))`. Correct.
**TypeScript behavior:** Same logic, different syntax.

### Section 4: `is_ranged` Parsing

**Rule:** The following string values (case-insensitive, after trim) are treated as `isRanged = true`: `"checked"`, `"yes"`, `"true"`, `"1"`, `"y"`. All other values → `false`.

**Worked example:**
| Input | `parseIsRanged()` result |
|-------|------------------------|
| `"Checked"` | `true` |
| `"YES"` | `true` |
| `"True"` | `true` |
| `"1"` | `true` |
| `"Y"` | `true` |
| `"checked"` | `true` |
| `""` | `false` |
| `"no"` | `false` |
| `"false"` | `false` |
| `"0"` | `false` |
| `undefined` | `false` |

**Django behavior:** Only `"checked"` (case-insensitive) → `true`. All other truthy strings → `false`. BUG.
**TypeScript behavior:** All five truthy variants accepted. Fixed.

### Section 5: NaN/Missing-Value Edge Cases

**Rule:** When ROU or SOH values are missing or non-numeric, the item is NOT silently defaulted to 0. Instead, a `DataQualityWarning` is emitted and the item is handled as follows:
- `RouItem` with NaN/missing `rou`: treated as `rou = 0` (excluded by `rou > 0` filter) + warning emitted.
- `DeadStockItem` with NaN/missing `soh`: item excluded from matching + warning emitted.
- `DeadStockItem` with NaN/missing `cost`: item included in matching, `cost = 0` in result, warning emitted.

**Worked example (NaN rou):**
- `rouItem = { sku: 'A', store: 'B', rou: NaN, isRanged: false }`
- Warning: `{ sku: 'A', field: 'rou', reason: 'rou is missing or non-numeric' }`
- Item excluded from potential matches.

**Django behavior:** `pd.to_numeric(...) or 0` silently converts NaN → 0. For ROU: NaN → 0 → excluded by `rou__gt=0` (accidentally correct, but no warning). For cost: NaN → 0.0 (silently wrong, no warning). BUG.
**TypeScript behavior:** Explicit `Number.isNaN` check, emits warnings.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `apps/worker/vitest.config.ts` (exists, uses `cloudflarePool`) |
| Quick run command | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | Spec document exists covering all 5 algorithm sections with worked examples | manual | N/A — doc review | No — Wave 0 creates ALGORITHM-SPEC.md |
| AUDIT-02 | `matchTransfers` has unit tests for all algorithm cases | unit | `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts` | No — Wave 0 creates `matcher.test.ts` |
| MATCH-02 | Sell-through filter includes/excludes correctly (boundary test) | unit | above | No |
| MATCH-03 | Cap formula computes `maxTransferQty` correctly | unit | above | No |
| MATCH-04 | Stores where destSOH exceeds cap are excluded | unit | above | No |
| MATCH-05 | Sort: ranged-first then ROU-descending | unit | above | No |
| MATCH-06 | `parseIsRanged` accepts all 5 truthy variants | unit | above | No |
| MATCH-07 | NaN rou/soh emits warning, does not silently default to 0 | unit | above | No |

### Sampling Rate

- **Per task commit:** `cd apps/worker && npx vitest run src/__tests__/matcher.test.ts`
- **Per wave merge:** `cd apps/worker && npm test` (all tests including auth + health)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/worker/src/matcher.ts` — does not exist yet; created in Wave 0 (or Plan 1)
- [ ] `apps/worker/src/__tests__/matcher.test.ts` — does not exist yet
- [ ] `apps/worker/src/ALGORITHM-SPEC.md` — does not exist yet

No framework gaps — Vitest infrastructure is fully configured.

---

## Environment Availability

This phase is purely code creation with no external service dependencies. Verification:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm test | Assumed (Phase 1 completed) | — | — |
| Vitest | `npm test` | Yes — in `package.json` devDependencies | ^4.1.2 | — |
| @cloudflare/vitest-pool-workers | `npm test` | Yes — in `package.json` devDependencies | ^0.13.5 | — |
| TypeScript | Type checking | Yes — in `package.json` devDependencies | ^6.0.2 | — |

No external services (NEON, Clerk, Cloudflare) are needed for this phase. `matcher.ts` is pure computation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config` | `cloudflarePool` from `@cloudflare/vitest-pool-workers` | v0.13.x | Project already uses current API — do not change `vitest.config.ts` |
| `pd.to_numeric(...) or 0` (Django) | `Number.isNaN()` with explicit warning | Phase 2 | Surfaces data quality issues instead of hiding them |
| `is_ranged: str == 'checked'` (Django) | `RANGED_TRUTHY_VALUES.has(...)` set lookup | Phase 2 | Accepts all FRED export formats |

**Deprecated/outdated:**
- Django `upload_sales_data` and `find_transfer_matches` views: being replaced by TypeScript. No Python code survives into production.
- `pd.to_numeric(...) or 0` pattern: never use `value || 0` as a NaN guard in TypeScript.

---

## Open Questions

1. **`RouItem.soh` field for months-cover cap**
   - What we know: D-07 cap formula is `maxTransferQty = monthsCoverTarget * destROU - destSOH`. D-03 locks `RouItem` to `{ sku, store, rou, isRanged }` — no `soh`.
   - What's unclear: Did the user intend `RouItem.soh` to exist (Phase 1 NEON schema may already have a `soh` column in `rou_data`), or should `destSOH` always be treated as 0 for Phase 2?
   - Recommendation: Add `soh?: number` (optional, defaults to 0) to `RouItem`. This satisfies the locked D-03 interface (no breaking change — new optional field), enables correct cap testing with non-zero destSOH, and lets Phase 4 pass real SOH values when NEON data is available. Document this addition in ALGORITHM-SPEC.md.

2. **`MatchResult` shape — include `allMatches` or just `bestMatch`?**
   - What we know: Django returns both `bestMatch` and `allMatches`. RESULTS-01 only requires one row per SKU per destination (the virtualized table columns listed). Phase 4 is the phase that wires results into the UI.
   - What's unclear: Should `matchTransfers` return a flat list (one `MatchResult` per SKU-destination pair) or a nested list (one result per SKU with `allMatches` array)?
   - Recommendation: Return flat list — one `MatchResult` per SKU-destination pair. This is simpler, more testable, and lets Phase 4's UI decide how to group/display. The Django `allMatches`/`bestMatch` structure was a UI convenience that does not belong in the pure function.

---

## Project Constraints (from CLAUDE.md)

- **Stack:** Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk — must match companion app stack
- **No Python:** Django/Python backend is replaced entirely by Cloudflare Workers (Node/TypeScript). No Python code in the production stack.
- **TypeScript throughout:** No `any` types; explicit interfaces for all inputs/outputs (from Established Patterns in CONTEXT.md code_context).
- **camelCase keys:** All response/result fields in camelCase (`isRanged`, `sellThrough`, `monthsCover`, `qtyToTransfer`).
- **async/await:** If `matchTransfers` is async, use `async/await`. Pure sync is fine for computation-only.
- **GSD workflow:** All file changes must go through a GSD workflow entry point (`/gsd:execute-phase`).
- **Deployment target:** Cloudflare Pages/Workers — no traditional server, no Python.
- **`npm` as package manager:** All install/run commands use `npm`.

---

## Sources

### Primary (HIGH confidence)
- `stock_transfer_project/api/views.py` — directly read; full algorithm extracted line-by-line
- `apps/worker/package.json` — directly read; version numbers verified
- `apps/worker/vitest.config.ts` — directly read; confirmed `cloudflarePool` API
- `apps/worker/tsconfig.json` — directly read; confirmed `strict: true`, `ESNext`
- `apps/worker/src/__tests__/auth.test.ts` — directly read; established test pattern
- `.planning/phases/02-logic-audit/02-CONTEXT.md` — directly read; all locked decisions captured

### Secondary (MEDIUM confidence)
- `.agents/skills/wrangler/SKILL.md` — read; Vitest config pattern (note: shows old `defineWorkersConfig` API which project correctly does NOT use)

### Tertiary (LOW confidence)
- None — all findings are based on direct file reads from the project.

---

## Metadata

**Confidence breakdown:**
- Algorithm audit (Django behavior): HIGH — read source directly
- TypeScript port patterns: HIGH — consistent with existing Worker code and TypeScript standard library
- Vitest test structure: HIGH — existing test files provide authoritative pattern
- Months-cover cap with destSOH=0 assumption: MEDIUM — `RouItem.soh` field absence needs planner confirmation; recommended resolution is `soh?: number` optional field

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain; algorithm is fixed, packages don't change)
