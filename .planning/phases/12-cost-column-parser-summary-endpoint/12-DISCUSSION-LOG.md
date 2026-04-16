# Phase 12: Cost Column Parser + Summary Endpoint - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 12-cost-column-parser-summary-endpoint
**Areas discussed:** FRED header aliases, Cost presence signal, Negative/zero cost handling, Summary hook data flow

---

## FRED Header Aliases

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmed from real export | User checks sample-data/Stock Valuation.xlsx | ✓ |
| Proceed with inferred list | Document as unvalidated, validate before first upload | |

**User's choice:** Checked `sample-data/Stock Valuation.xlsx` — confirmed `"Cost Ex"` is the exact column header.
**Notes:** File columns are: Item Code, Department, Category, Item Description, Cost Ex, Retail, SOH, SOH $, Alias. Cost Ex values include zeros (legitimate zero-cost items).

---

## Cost Presence Signal

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit hasCostData flag per store | `{ name, totalUnits, totalValue, hasCostData: boolean }` — true only when ≥1 non-null cost_ex row exists | ✓ |
| totalValue: 0 as the signal | Simpler shape, but ambiguous with genuine $0-cost stock | |

**User's choice:** Explicit `hasCostData: boolean` per store (recommended).
**Notes:** Frontend checks `stores.every(s => !s.hasCostData)` to trigger COST-04 instructional message.

---

## Negative/Zero Cost Handling

**Question 1: How to handle zero and negative Cost Ex values?**

| Option | Description | Selected |
|--------|-------------|----------|
| Zero valid, negative is a warning | Store zeros as-is; negative → DataQualityWarning in upload response | ✓ |
| Both zero and negative excluded + warned | More conservative; may confuse pharmacists with intentional $0 items | |
| Store all, filter at aggregation only | Silent about bad data at upload time | |

**User's choice:** Zero is valid, negative is a warning (recommended).

**Question 2: Where does the negative cost warning surface?**

| Option | Description | Selected |
|--------|-------------|----------|
| Upload response | DataQualityWarning in POST /upload response — user sees it immediately | ✓ |
| Summary endpoint response | warnings[] in GET /api/dead-stock-summary — shown later when report loads | |

**User's choice:** Upload response (recommended).
**Notes:** Follows existing DataQualityWarning pattern from NaN ROU handling. `field: "cost"` already in the type union.

---

## Summary Hook Data Flow

**Question 1: How should useDeadStockSummary be instantiated?**

| Option | Description | Selected |
|--------|-------------|----------|
| Per-page, each page calls its own hook | Independent fetch on UploadPage and MatchPage | ✓ |
| Once in shared layout/context | Avoids duplicate fetches but adds complexity | |

**User's choice:** Per-page instantiation (recommended).

**Question 2: When should useDeadStockSummary re-fetch on UploadPage?**

| Option | Description | Selected |
|--------|-------------|----------|
| After each successful upload | Hook exposes refetch(); UploadPage calls after POST /upload ok: true | ✓ |
| Page mount only | Requires navigate-away-and-back to see updated chart | |

**User's choice:** After each successful upload (recommended).
**Notes:** Same refetch() pattern as useStores.

---

## Claude's Discretion

- SQL index choice for the summary query aggregation
- Exact vitest integration test setup
- TypeScript return type naming for the summary response

## Deferred Ideas

None — discussion stayed within phase scope.
