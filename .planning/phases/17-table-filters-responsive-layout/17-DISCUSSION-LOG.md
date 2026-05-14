# Phase 17: Discussion Log

**Date:** 2026-05-14
**Areas discussed:** Responsive Strategy, Filter Bar Layout, Filter Control Types, Min Transfer Value UX

---

## Area 1: Responsive Strategy (TABLE-03)

| Question | Options presented | Selection |
|----------|-------------------|-----------|
| How should the table handle a 768px tablet viewport? | Hide lower-priority columns / Horizontal scroll / Card layout on tablet | **Horizontal scroll** |
| Should SKU + Description be sticky while scrolling horizontally? | Sticky SKU+Description / Sticky SKU only / No sticky | **Sticky SKU + Description** |
| Sticky cells inside scroll container or simpler no-sticky approach? | Sticky cells inside container / No sticky, just scroll | **Sticky cells inside the scrollable container** |
| Mobile (< 640px) — same behaviour or out of scope? | Same horizontal scroll + sticky / Mobile out of scope | **Same behaviour** |

**Outcome:** Horizontal scroll + sticky SKU+Description at all sub-desktop sizes. One pattern, no breakpoint differences.

---

## Area 2: Filter Bar Layout

| Question | Options presented | Selection |
|----------|-------------------|-----------|
| Where should post-match filters live? | New filter row / Collapsible panel / Inline above table header | **Inline above the table header** |
| Always visible or post-run only? | Only visible after run / Always visible | **Only visible after run** |
| Row count indicator when filters active? | "Showing X of Y results" / Active filter badges only / No indicator | **"Showing X of Y results"** |
| "Clear all" action? | Yes — "Clear all" link / No — manual clear | **Yes — "Clear all" link** |

**Outcome:** Inline strip above table, post-run only, "Showing X of Y results", "Clear all" link.

---

## Area 3: Filter Control Types (TABLE-04, TABLE-05, TABLE-06)

| Question | Options presented | Selection |
|----------|-------------------|-----------|
| Ranged filter control? | 3-segment toggle / Single checkbox / Dropdown | **Dropdown (All / Ranged / Non-ranged)** |
| Department multi-select? | Dropdown with checkboxes / Chip pills / You decide | **Dropdown with checkboxes** |
| Store filter? | Single "involves store" dropdown / Two separate dropdowns / Reuse existing selector | **Single "involves store" dropdown** |
| Dropdown implementation (no shadcn)? | Native `<select multiple>` / Custom div-based / You decide | **You decide (Claude's discretion)** |
| Why no shadcn? | User asked why shadcn was being avoided | **Continue with custom Tailwind** |

**Outcome:** Native `<select>` for ranged and store filters; custom div-based dropdown for department multi-select. Custom Tailwind confirmed.

---

## Area 4: Min Transfer Value UX (TABLE-07)

| Question | Options presented | Selection |
|----------|-------------------|-----------|
| Min threshold control type? | Number input with $ prefix / Presets + input / Slider | **Number input** |
| What does min value apply to? | qtyToTransfer × cost_ex / cost_ex only / You decide | **qtyToTransfer × cost_ex** (then revised) |
| Clarification — dollar value or units? | Dollar value (as per TABLE-07) / Units only | **Units only** |
| UI label? | "Min units" / Keep "$" but apply to units | **"Min units"** |

**Outcome:** "Min units" number input filtering by `qtyToTransfer`. Intentional deviation from TABLE-07 (which specified dollars). User confirmed units is the correct interpretation.

---

## Deferred Ideas

- shadcn/ui adoption — user confirmed custom Tailwind for Phase 17; future refactor if desired.
