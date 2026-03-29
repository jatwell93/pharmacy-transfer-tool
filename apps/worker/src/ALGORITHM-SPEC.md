# PharmIQ Stock Transfer — Algorithm Specification

**Location:** `apps/worker/src/ALGORITHM-SPEC.md`
**Version:** 1.0 (Phase 2, Plan 01)
**Status:** Authoritative reference for TypeScript implementation in `matcher.ts`

This document is the authoritative algorithm reference for the `matchTransfers` function in `matcher.ts`. It defines each rule with a worked numeric example, documents the existing Django behavior, and explicitly flags bugs where the TypeScript implementation intentionally differs.

---

## Pipeline Overview

The matching algorithm processes dead-stock items and ROU (Rate of Usage) data through the following stages:

1. Filter `deadStock` to items with valid SKU and `soh > 0` (skip items with null/NaN SOH or SOH <= 0)
2. Filter `rouData` to exclude the `originStore` (case-insensitive match) and items with `rou <= 0`
3. Index filtered `rouData` by SKU for O(1) lookup (`Map<sku, RouItem[]>`)
4. For each dead-stock item: look up destination stores with matching SKU
5. Apply sell-through filter (Section 1) — exclude stores whose ROU is too low to sell through the stock within 12 months
6. Apply months-cover cap (Section 2) — compute `maxTransferQty`; exclude stores where `maxTransferQty === 0`
7. Compute `sellThrough = originSOH / destROU` for each remaining match
8. Sort matches: ranged-first, then ROU-descending within each group (Section 3)
9. Assemble `MatchResult` objects — one per dead-stock item that has at least one valid destination
10. Return `{ results: MatchResult[], warnings: DataQualityWarning[] }`

Items with no valid destination matches after all filters are silently omitted from `results`.

---

## 1. Sell-Through Filter

**Rule:** A destination store qualifies as a valid match only if:

```
destROU >= originSOH / SELL_THROUGH_LIMIT_MONTHS
```

where `SELL_THROUGH_LIMIT_MONTHS = 12` (internal constant, not user-configurable in v1).

This ensures the destination store will sell through the transferred quantity within 12 months.
The comparison is **inclusive** (`>=`): a store exactly at the boundary is included.

### Worked Example

Dead-stock item: SKU `PARA500`, originSOH = 240 units

```
minROU = 240 / 12 = 20 units/month
```

| Destination Store | destROU | Comparison     | Result   |
|-------------------|---------|----------------|----------|
| Store A           | 25      | 25 >= 20       | INCLUDED |
| Store B           | 15      | 15 >= 20       | EXCLUDED |
| Store C           | 20      | 20 >= 20       | INCLUDED (boundary, inclusive) |

### Django Behavior

Same formula, hardcoded `sell_through_limit_months = 12`. Correct.

```python
# views.py lines 160-165
sell_through_limit_months = 12
min_required_rou = item['soh'] / sell_through_limit_months
valid_matches = [
    match for match in potential_matches_for_item
    if match['rou'] >= min_required_rou
]
```

### TypeScript Behavior

Same logic. `SELL_THROUGH_LIMIT_MONTHS = 12` is an internal module constant (not exported). No change from Django.

```typescript
const SELL_THROUGH_LIMIT_MONTHS = 12;
const minRequiredRou = item.soh / SELL_THROUGH_LIMIT_MONTHS;
const passesFilter = destRou >= minRequiredRou;
```

---

## 2. Months-Cover Cap Formula

**Rule:** After a destination store passes the sell-through filter, compute the maximum transfer quantity using the months-cover cap:

```
maxTransferQty = Math.max(0, monthsCoverTarget * destROU - destSOH)
qtyToTransfer  = Math.min(originSOH, maxTransferQty)
```

Where `destSOH = rouItem.soh ?? 0` (default to 0 when absent — see note below).

If `maxTransferQty === 0`, the store is **excluded** from results entirely (the destination already holds enough stock to meet the months-cover target).

**Note on `destSOH`:** `RouItem.soh` is an optional field (defaults to `0` when absent). In Phase 2, when no destination SOH data is available, the cap formula conservatively computes `maxTransferQty = monthsCoverTarget * destROU` (i.e., transfer enough to fill the destination up to cover target). Phase 4 passes real SOH values from NEON.

### Worked Example — Cap Binds

```
monthsCoverTarget = 3
destROU           = 20 units/month
destSOH           = 10 units (destination already has some stock)

maxTransferQty = Math.max(0, 3 * 20 - 10) = Math.max(0, 50) = 50
qtyToTransfer  = Math.min(240, 50) = 50  (originSOH = 240)
```

Store is included. Transfer quantity is capped at 50 (not the full 240).

### Worked Example — Destination Already Over Cap

```
monthsCoverTarget = 3
destROU           = 20 units/month
destSOH           = 65 units (destination already overstocked)

maxTransferQty = Math.max(0, 3 * 20 - 65) = Math.max(0, -5) = 0
```

Store is **excluded** — destination already holds more than 3 months of cover.

### Worked Example — No Destination SOH Data (Default Behaviour)

```
monthsCoverTarget = 3
destROU           = 20 units/month
destSOH           = absent (defaults to 0)

maxTransferQty = Math.max(0, 3 * 20 - 0) = Math.max(0, 60) = 60
qtyToTransfer  = Math.min(240, 60) = 60
```

### Django Behavior

**BUG — No months-cover cap exists in Django.** All sell-through-passing matches return the full `originSOH` as an implicit transfer quantity. There is no `monthsCoverTarget` parameter. Receiving stores can become overstocked.

```python
# views.py lines 155-182: after valid_matches filter, no cap is applied.
# The full origin SOH is implicitly transferred (Django returns match metadata only,
# not a quantity, but the UI implies transferring the full origin SOH).
```

### TypeScript Behavior

Cap enforced. `monthsCoverTarget` is a **required** parameter in `MatchOptions`. Every `DestinationMatch` includes `qtyToTransfer` (the capped quantity). FIXED.

---

## 3. Ranged Sort Order

**Rule:** Destination store matches are sorted:
1. **Primary:** ranged items first (`isRanged = true` before `isRanged = false`)
2. **Secondary:** `rou` descending within each group (higher ROU = better match = earlier in list)

### Worked Example

Three candidate destination stores for a single dead-stock SKU:

| Match | isRanged | rou |
|-------|----------|-----|
| A     | false    | 30  |
| B     | true     | 10  |
| C     | true     | 25  |

Sorted order: **C** (ranged, 25) → **B** (ranged, 10) → **A** (non-ranged, 30)

Note: non-ranged Match A has the highest ROU but sorts last because ranged items always precede non-ranged.

### Django Behavior

Same logic. Correct.

```python
# views.py line 175
valid_matches.sort(key=lambda x: (-x['isRanged'], -x['rou']))
# Python bool is int subtype: True=1, False=0
# -True=-1, -False=0 → ranged sorts first
```

### TypeScript Behavior

Same logic, explicit ternary to avoid fragile boolean-to-number cast:

```typescript
matches.sort((a, b) => {
  if (a.isRanged !== b.isRanged) return a.isRanged ? -1 : 1; // ranged first
  return b.rou - a.rou; // higher ROU first within group
});
```

---

## 4. is_ranged Parsing

**Rule:** The following string values (case-insensitive, after whitespace trim) are treated as `isRanged = true`. All other values → `false`.

| Truthy value | Matches |
|--------------|---------|
| `"checked"`  | FRED Office default checkbox export |
| `"yes"`      | Alternative FRED export format |
| `"true"`     | Boolean string representation |
| `"1"`        | Numeric boolean |
| `"y"`        | Single-character shorthand |

### Worked Example

| Raw input    | `parseIsRanged()` result |
|--------------|--------------------------|
| `"Checked"`  | `true`                   |
| `"YES"`      | `true`                   |
| `"True"`     | `true`                   |
| `"1"`        | `true`                   |
| `"Y"`        | `true`                   |
| `"checked"`  | `true`                   |
| `""`         | `false`                  |
| `"no"`       | `false`                  |
| `"false"`    | `false`                  |
| `"0"`        | `false`                  |
| `undefined`  | `false`                  |
| `null`       | `false`                  |

### Django Behavior

**BUG — Only `"checked"` is recognised.** All other truthy variants (`"yes"`, `"true"`, `"1"`, `"y"`) are treated as `false`. FRED exports from different store configurations may use any of these variants.

```python
# views.py line 82 (in upload_sales_data)
is_ranged=str(row['Ranged']).strip().lower() == 'checked'
```

### TypeScript Behavior

Set lookup against all 5 truthy variants. **FIXED.**

```typescript
const RANGED_TRUTHY_VALUES = new Set(['checked', 'yes', 'true', '1', 'y']);

export function parseIsRanged(raw: unknown): boolean {
  return RANGED_TRUTHY_VALUES.has(String(raw).trim().toLowerCase());
}
```

**Note:** Parsing happens at upload time (Phase 3), not at match time. `matchTransfers` receives `isRanged: boolean` on each `RouItem`. `parseIsRanged` is a separate exported utility for Phase 3's CSV/XLSX parsing layer to call.

---

## 5. NaN/Missing-Value Edge Cases

**Rule:** NaN and missing values are **not** silently defaulted to `0`. Instead, a `DataQualityWarning` is emitted and the item is handled as follows:

| Value | Item | Warning emitted? | Behaviour |
|-------|------|-----------------|-----------|
| `RouItem.rou` is NaN or missing | Destination store row | Yes (`field: 'rou'`) | Item excluded from matching (treated as `rou = 0`, filtered by `rou > 0` check) |
| `DeadStockItem.soh` is NaN or missing | Origin dead-stock row | Yes (`field: 'soh'`) | Item excluded from matching entirely |
| `DeadStockItem.cost` is NaN or missing | Origin dead-stock row | Yes (`field: 'cost'`) | Item **included** in matching; `cost = 0` used in result (cost is display-only, not algorithmic) |

### Worked Example — NaN rou

```
rouItem = { sku: 'A', store: 'B', rou: NaN, isRanged: false }

Warning emitted:
  { sku: 'A', field: 'rou', reason: 'rou is missing or non-numeric' }

Item is excluded from all matches.
```

### Worked Example — NaN cost

```
deadStockItem = { sku: 'PARA500', soh: 240, description: 'Paracetamol 500mg', cost: NaN }

Warning emitted:
  { sku: 'PARA500', field: 'cost', reason: 'cost is missing or non-numeric' }

Item is still matched — cost does not affect algorithm decisions.
MatchResult.cost = 0.
```

### Django Behavior

**BUG — `pd.to_numeric(...) or 0` silently converts NaN to `0` for both ROU and cost.**

```python
# views.py line 81 (upload_sales_data) — ROU NaN silenced
rou=pd.to_numeric(row['ROU Value'], errors='coerce') or 0.0

# views.py line 133 (find_transfer_matches) — cost NaN silenced
'cost': float(pd.to_numeric(str(row['Cost Ex']).replace('$', '').replace(',', ''), errors='coerce') or 0)
```

For ROU: NaN → 0 → filtered out by `rou__gt=0` query. Accidentally correct exclusion but no warning is surfaced to the user. For cost: NaN → `0.0` silently with no warning. Both are bugs — data quality issues are hidden.

### TypeScript Behavior

Explicit `Number.isNaN()` check (not `isNaN()` — see note). Warnings emitted. **FIXED.**

```typescript
// Use Number.isNaN(), not isNaN()
// isNaN('') returns true (wrong), Number.isNaN('') returns false (correct)
if (Number.isNaN(rouItem.rou) || rouItem.rou <= 0) {
  warnings.push({ sku: rouItem.sku, field: 'rou', reason: 'rou is missing or non-numeric' });
  // item excluded from matching
}

if (Number.isNaN(deadStockItem.cost)) {
  warnings.push({ sku: deadStockItem.sku, field: 'cost', reason: 'cost is missing or non-numeric' });
  // item still participates in matching with cost = 0
}
```

---

## Bug Summary

| Bug | Location (Django) | TypeScript Fix |
|-----|------------------|----------------|
| **BUG-01:** `is_ranged` only accepts `"checked"` | `views.py` line 82 | `RANGED_TRUTHY_VALUES` set with 5 variants |
| **BUG-02:** NaN cost silently set to `0.0` | `views.py` line 133 | `Number.isNaN` check + `DataQualityWarning` |
| **BUG-03:** No months-cover cap — receiving stores can become overstocked | `views.py` lines 155-182 | `maxTransferQty` cap in `matchTransfers` |

---

## Data Model Reference

These types are defined in `matcher.ts` and must be consistent with this spec.

```typescript
DeadStockItem { sku, soh, description, cost }
RouItem       { sku, store, rou, isRanged, soh? }
MatchOptions  { originStore, monthsCoverTarget }
DestinationMatch { store, rou, isRanged, sellThrough, monthsCover, qtyToTransfer, destSoh }
MatchResult   { sku, description, soh, cost, sourceStore, bestMatch, allMatches }
DataQualityWarning { sku, field: 'rou'|'soh'|'cost', reason }
MatchTransfersResult { results: MatchResult[], warnings: DataQualityWarning[] }
```

---

*Phase 2, Plan 01 — Created 2026-03-29*
*Next: `matcher.ts` implements this spec; `matcher.test.ts` verifies each section (Plan 02)*
