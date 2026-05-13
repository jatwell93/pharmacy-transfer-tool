# Phase 14: Cost Report UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 14-cost-report-ui
**Areas discussed:** Panel visibility & placement, Per-store breakdown format, SOH input design, Recoverable value KPI placement

---

## Panel Visibility & Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Panel always renders below PostMatchChart; shows instructional message when no cost data, full report when data present | ✓ |
| Only post-match | Panel only appears after hasRun = true | |

**User's choice:** Always visible
**Notes:** —

---

### No-data state

| Option | Description | Selected |
|--------|-------------|----------|
| Instructional message inside the panel | Panel renders with heading + message: "Re-upload using FRED Stock Valuation format" | ✓ |
| Empty/collapsed panel with hint text | Panel collapses to minimal height with muted one-liner | |

**User's choice:** Instructional message inside the panel
**Notes:** —

---

## Per-Store Breakdown Format

| Option | Description | Selected |
|--------|-------------|----------|
| Metric cards — horizontal row | Each store gets a small card with store name + dollar value | ✓ |
| Simple table — store name / $ value / % of total | Compact rows, easier comparison | |
| Stacked summary rows | Each store as a single line | |

**User's choice:** Metric cards — horizontal row
**Notes:** Consistent with StoreCard pattern on UploadPage

---

### Card detail

| Option | Description | Selected |
|--------|-------------|----------|
| Store name + dollar value only | Clean and focused — '$1,240 dead stock' | ✓ |
| Store name + dollar value + unit count | Both '$1,240' and '48 units' | |
| Store name + dollar value + % of org total | Each store's share of total dead stock pool | |

**User's choice:** Store name + dollar value only
**Notes:** —

---

## SOH Input Design

### Input placement

| Option | Description | Selected |
|--------|-------------|----------|
| Panel header row | Input beside the panel title in one row | |
| Below the store cards, above the percentage summary | Flows top-to-bottom: data → input → result | ✓ |
| Inline within the percentage indicator row | Compact but can feel cramped | |

**User's choice:** Below the store cards, above the percentage summary
**Notes:** —

---

### Percentage indicator style

| Option | Description | Selected |
|--------|-------------|----------|
| A single bold metric with a coloured badge | Large percentage + amber/red badge | |
| A progress bar with a threshold marker | Horizontal bar 0–100% with amber (10%) and red (25%) threshold markers | ✓ |
| Inline coloured text in a sentence | Amber/red text based on threshold | |

**User's choice:** Progress bar with threshold markers
**Notes:** More visual clarity at a glance than a badge or inline text

---

## Recoverable Value KPI Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inside CostReport panel | KPI within CostReport, shown at top when hasRun + hasCostData | ✓ |
| Alongside 'Net units recovered' in PostMatchChart | Two KPI cards side by side in PostMatchChart section | |

**User's choice:** Inside CostReport panel
**Notes:** Keeps all cost/dollar information together

---

### Recoverable value calculation method

| Option | Description | Selected |
|--------|-------------|----------|
| Sum of (qtyToTransfer × cost_ex) per matched SKU | Precise — uses per-unit cost from dead stock data | ✓ |
| Sum of totalValue for source stores only | Approximate — uses whole store dead stock value | |

**User's choice:** Sum of (qtyToTransfer × cost_ex) per matched SKU
**Notes:** Requires match route to SELECT ds.cost_ex instead of hardcoded cost: 0

---

### Worker backend fix scope

| Option | Description | Selected |
|--------|-------------|----------|
| Include Worker fix in Phase 14 | 2-line change in match.ts — add ds.cost_ex to SELECT, replace cost: 0 | ✓ |
| Keep Phase 14 pure UI | Defer backend fix; use approximate calculation instead | |

**User's choice:** Include Worker fix in Phase 14
**Notes:** Small change, same phase, Recoverable $ works correctly from day one

---

## Claude's Discretion

- Dollar formatting (AUD locale, 2 decimal places, comma thousands separator)
- Section heading text
- Loading skeleton / spinner while summaryLoading is true
- Progress bar CSS implementation detail
- Exact card dimensions and spacing

## Deferred Ideas

None — discussion stayed within phase scope.

---

## Update Session — 2026-04-26

*Post-build context refresh. Two new decisions captured.*

### SOH Input Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Persist to localStorage (org-specific key) | `pharmiq_soh_[orgId]` — survives page reloads, per-org isolation | ✓ |
| Keep as ephemeral state | Resets on reload — per original D-05 | |
| You decide | Claude's discretion | |

**User's choice:** Persist to localStorage with org-specific key `pharmiq_soh_[orgId]`
**Notes:** OrgId from Clerk's `useOrganization()` hook. Confirmed org-specific (not global) when asked about key scope.

---

### Empty / No-Upload State

| Option | Description | Selected |
|--------|-------------|----------|
| Differentiate the two messages | No upload → "Upload a dead stock file..." \| Upload without cost → "Re-upload using FRED..." | ✓ |
| Keep single message | Both states show FRED re-upload message | |
| Hide section entirely when no upload | Don't render "Dead Stock Value" section until first upload | |

**User's choice:** Differentiate the two messages
**Notes:** Uses `totalUnits` field from StoreSummary to distinguish state. `stores.every(s => s.totalUnits === 0)` → first-upload state. Any `totalUnits > 0` but all `hasCostData === false` → cost-column-missing state. Supersedes original D-02.
