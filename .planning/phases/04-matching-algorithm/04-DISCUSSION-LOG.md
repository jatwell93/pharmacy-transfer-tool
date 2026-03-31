# Phase 4: Matching Algorithm - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 04-matching-algorithm
**Areas discussed:** Match scope, Months-cover input, Results table structure, Data quality warnings

---

## Match scope

| Option | Description | Selected |
|--------|-------------|----------|
| All stores at once | Loop over every dead-stock store, run matchTransfers for each, unified results table with Source Store column | ✓ |
| User picks one origin store | Dropdown to select which store's dead stock to move, single matchTransfers call | |
| User can pick one or all (toggle) | Default all-stores, store picker to narrow to single origin | |

**User's choice:** All stores at once
**Notes:** Source Store column in results table makes sense because multiple origins contribute rows.

---

## Months-cover input

### Input style

| Option | Description | Selected |
|--------|-------------|----------|
| Number input + preset buttons | Number input (min 1, max 24) with quick-select presets 1/2/3/6/12, default 3 | ✓ |
| Number input only | Plain numeric input, default 3 | |
| Preset buttons only | Fixed options 1/2/3/6/12, no free-text entry | |

**User's choice:** Number input with preset buttons

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Control bar at top of page | Horizontal bar: months-cover + presets left, Run Match button right | ✓ |
| Settings panel or modal | Gear icon opens panel before running | |

**User's choice:** Control bar at top of page

---

## Results table structure

### Row structure

| Option | Description | Selected |
|--------|-------------|----------|
| Best match + expandable to all | One row per SKU, expand to see all destinations | ✓ |
| Flat — one row per SKU × destination | Every match gets its own row | |
| Summary row + nested subtable | Grouped by SKU, collapsible subtable | |

**User's choice:** Best match only, expandable to see all

### Columns

| Option | Description | Selected |
|--------|-------------|----------|
| 7 columns (RESULTS-01) | SKU, Description, Source Store, Dest Store, Qty to Transfer, Dest ROU, Months Cover | |
| 5 columns (lean) | SKU, Description, Source Store, Dest Store, Qty to Transfer | |
| 8 columns (add Sell-Through Time) | RESULTS-01 + Sell-Through Time | ✓ |

**User's choice:** Add Sell-Through Time as an 8th column

---

## Data quality warnings

### Display style

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible amber banner above table | "X items had data quality issues — expand to see details", dismissible | ✓ |
| Separate warnings section below table | Results first, warnings at bottom | |
| Toast notification only | Brief toast, disappears after a few seconds | |

**User's choice:** Collapsible banner above the results table

### Zero-warnings state

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden entirely | No banner when no warnings — absence is enough | |
| Show green confirmation | "All data passed quality checks" | ✓ |

**User's choice:** Show a green confirmation

---

## Claude's Discretion

- Exact SQL query pattern for multi-store data fetch
- Deduplication of warnings across multi-store runs
- Virtualized table implementation approach
- Loading state during match run
- Sell-Through Time formatting (decimal vs whole number — noted in specifics as decimal preferred)
- Error handling for match run failures
- Collapsed/expanded row animation

## Deferred Ideas

None.
