---
phase: 02-logic-audit
plan: "01"
subsystem: worker/matcher
tags: [algorithm-spec, typescript, types, dead-stock-matching]
dependency_graph:
  requires: []
  provides: [ALGORITHM-SPEC.md, matcher.ts types, parseIsRanged utility, matchTransfers stub]
  affects: [02-02-PLAN.md]
tech_stack:
  added: []
  patterns: [pure-computation-function, explicit-typed-interfaces, DataQualityWarning return shape]
key_files:
  created:
    - apps/worker/src/ALGORITHM-SPEC.md
    - apps/worker/src/matcher.ts
  modified: []
decisions:
  - "RouItem.soh added as optional field (soh?: number) to support months-cover cap formula — resolves D-03 gap identified in RESEARCH.md Open Question 1"
  - "DataQualityWarning { sku, field, reason } chosen as NaN mechanism — allows caller to display quality info without aborting the match run"
  - "matchTransfers returns MatchTransfersResult { results, warnings } — flat results list, not nested allMatches/bestMatch per RESEARCH.md recommendation"
metrics:
  duration_seconds: 160
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 01: Algorithm Spec and Type Stubs Summary

## One-Liner

Algorithm reference doc (ALGORITHM-SPEC.md) and TypeScript type stubs (matcher.ts) for dead-stock matching — covering sell-through filter, months-cover cap, ranged sort, is_ranged parsing, and NaN edge cases with Django bug documentation.

## What Was Built

**Task 1: ALGORITHM-SPEC.md**

Created `apps/worker/src/ALGORITHM-SPEC.md` — the authoritative algorithm reference for the TypeScript port. Document covers all 5 required sections (D-14):

1. **Sell-Through Filter** — `destROU >= originSOH / 12` with PARA500/240 worked example (Store A/B/C at ROU 25/15/20)
2. **Months-Cover Cap** — `maxTransferQty = max(0, monthsCoverTarget * destROU - destSOH)` with 3 worked examples (cap binds, dest over cap, no SOH data)
3. **Ranged Sort Order** — ranged-first then ROU-descending, with A/B/C sort example
4. **is_ranged Parsing** — 5 truthy variants table and parse examples
5. **NaN/Missing-Value Edge Cases** — warns on NaN rou/soh/cost; rou and soh exclude; cost includes with 0

Each section documents Django's actual behavior (line references) and flags bugs/deviations. Three bugs explicitly documented: BUG-01 (is_ranged), BUG-02 (NaN cost), BUG-03 (no months-cover cap).

**Task 2: matcher.ts**

Created `apps/worker/src/matcher.ts` with:
- 7 exported interfaces: `DeadStockItem`, `RouItem`, `MatchOptions`, `DestinationMatch`, `MatchResult`, `DataQualityWarning`, `MatchTransfersResult`
- `RouItem.soh?: number` optional field to support the months-cover cap formula
- 2 internal constants: `SELL_THROUGH_LIMIT_MONTHS = 12`, `RANGED_TRUTHY_VALUES` set (not exported)
- `parseIsRanged(raw: unknown): boolean` — fully implemented one-liner utility
- `matchTransfers(...)` — stub that throws `Error('Not implemented')` for Plan 02 to implement
- Full project TypeScript compile (`npx tsc --noEmit`) passes with 0 errors

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `RouItem.soh?: number` optional | Resolves RESEARCH.md Open Question 1 — D-03 locked interface extended non-breakingly; defaults to 0 when absent |
| `DataQualityWarning` + `MatchTransfersResult` return shape | Allows caller to surface data quality info without aborting the entire match run |
| `DestinationMatch.destSoh` field | Returned in result so UI can show what SOH was used in cap calculation |
| Flat `MatchResult[]` (not nested allMatches/bestMatch at result level) | Simpler, more testable; `allMatches` and `bestMatch` are inside `MatchResult` per Django pattern |

## Deviations from Plan

None — plan executed exactly as written. All interface shapes match the specification in the plan exactly, including the `MatchTransfersResult` wrapper type and all field names.

## Known Stubs

- `matchTransfers` in `apps/worker/src/matcher.ts` — intentional stub, throws `Error('Not implemented')`. Plan 02 implements the full algorithm body. This stub is the design goal of Plan 01.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: ALGORITHM-SPEC.md | `051a94e` | apps/worker/src/ALGORITHM-SPEC.md |
| Task 2: matcher.ts stubs | `0bb2d56` | apps/worker/src/matcher.ts |

## Self-Check: PASSED

Files exist:
- FOUND: apps/worker/src/ALGORITHM-SPEC.md
- FOUND: apps/worker/src/matcher.ts

Commits exist:
- FOUND: 051a94e
- FOUND: 0bb2d56

TypeScript compile: PASS (npx tsc --noEmit — 0 errors)
