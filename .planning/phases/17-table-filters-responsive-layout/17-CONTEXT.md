# Phase 17: Table Filters + Responsive Layout - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Add four post-match result filters (ranged toggle, department multi-select, source/destination store, min units) to MatchPage as an inline filter strip above the table, and make the 11-column results table work on tablets and mobile via horizontal scroll with sticky SKU+Description columns. Filters operate on client-side state only — no re-fetch, no API changes. Responsive behaviour applies to the entire table at all viewports below desktop.

</domain>

<decisions>
## Implementation Decisions

### Responsive Layout (TABLE-03)
- **D-01:** Strategy is horizontal scroll (`overflow-x: auto` on the table wrapper). No column hiding, no card layout. The full 11-column grid stays intact at all sizes.
- **D-02:** SKU and Description columns are sticky (`position: sticky`, `left` offset, `z-index`) so they remain visible while the user scrolls right.
- **D-03:** Same behaviour at mobile (< 640px) as tablet (768px) — one pattern for all sub-desktop viewports. No separate mobile breakpoint needed.
- **D-04:** The outer scroll container that currently handles vertical virtualization (`overflow-y: auto`) must also allow `overflow-x: auto`. The sticky header row must scroll horizontally in sync with the body. Grid template column widths are preserved as-is.

### Filter Bar Layout
- **D-05:** Filters live in an inline strip directly above the table header (between the store selector and the table). Not a separate collapsible panel — always expanded.
- **D-06:** The filter strip only renders when `hasRun && results.length > 0`. No filters shown before the user has run a match.
- **D-07:** A "Showing X of Y results" count is displayed inline in the filter strip whenever any filter reduces the visible row count.
- **D-08:** A "Clear all" text link appears in the filter strip when any filter is non-default. Clicking resets all four filters to their default/empty state.
- **D-09:** All filters are applied simultaneously with AND logic — a row must pass every active filter to appear. Filtering is live (no "Apply" button).

### Filter Controls (TABLE-04, TABLE-05, TABLE-06)
- **D-10:** Ranged filter (TABLE-04): native `<select>` with three options — `All` (default), `Ranged only`, `Non-ranged only`. Matches `result.isRanged`.
- **D-11:** Department filter (TABLE-05): custom button + positioned `<div>` dropdown containing one `<input type="checkbox">` per unique department derived from the current results array. Button label shows "Department" when none selected, "Dept (N)" when N departments are checked. Clicking outside closes the dropdown.
- **D-12:** Store filter (TABLE-06): native `<select>` listing "All stores" + each unique store name from results. Selected store matches rows where `result.sourceStore === store OR result.bestMatch.store === store` (involves-store logic, not source-only or destination-only).
- **D-13:** Design system: custom Tailwind only. No shadcn/ui, no Radix. Department dropdown styled to match existing surface/border/text CSS variables. Native `<select>` elements styled with `rounded-md border border-[var(--color-border-light)] text-[13px]` to match existing inputs on the page.

### Min Units Filter (TABLE-07)
- **D-14:** Filter label is "Min units" — not "Min $". Filters by `result.bestMatch.qtyToTransfer >= minUnits`. Default value is 0 (no threshold — all rows shown).
- **D-15:** Control is a number input with "Min units" label, same pattern as months cover input (no presets, no slider). Validates on change: accepts integers ≥ 0.
- **D-16:** **Deviation from written requirement:** TABLE-07 specifies "minimum dollar transfer value ($)". User explicitly changed this to a minimum units (quantity) threshold. The dollar sign is NOT used in the UI.

### Claude's Discretion
- Dropdown implementation for department multi-select: custom div-based (not native `<select multiple>`) for better styling control. Open/close state managed via `useState`. Close-on-outside-click via a `useEffect` with a document click listener or `onBlur`.
- Exact pixel widths for the filter strip controls — match the existing control bar visual density.
- Whether the filter strip uses the same `bg-[var(--color-surface-gray)]` container style as the control bar and store selector rows, or sits as an unstyled row. Planner/executor can decide.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary Implementation File
- `apps/web/src/pages/MatchPage.tsx` — The only file requiring changes. Current grid template (`grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]`), virtualized scroll container, FlatItem union type, control bar, store selector pattern, and existing filter state.

### Types & Hooks
- `apps/web/src/hooks/useMatchRun.ts` — `MatchResult` and `DestinationMatch` interfaces. Phase 17 filters use `isRanged`, `department`, `sourceStore`, `bestMatch.store`, and `bestMatch.qtyToTransfer` — confirm all are present after Phase 16.

### Requirements
- `.planning/REQUIREMENTS.md` — TABLE-03..07 acceptance criteria. Note: D-16 documents the intentional deviation from TABLE-07 (units not dollars).
- `.planning/ROADMAP.md` Phase 17 — Success criteria (5 items); all 5 must be TRUE for the phase to be complete.

### Phase 16 Context (predecessor)
- `.planning/phases/16-department-ranged-column-parsing/16-CONTEXT.md` — Confirms `department` and `isRanged` are in `MatchResult`; sub-match rows leave these cells empty (D-07 from Phase 16).

### Design System Reference
- `.planning/phases/16-department-ranged-column-parsing/16-UI-SPEC.md` — Confirms no shadcn/ui, custom Tailwind only, lucide-react icons, Inter/Space Grotesk fonts, CSS variable naming conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `selectedStores` state + chip pill pattern (lines 40, 371–402) — the store selector is a close analog for filter controls. The pill toggle pattern is established but NOT reused for Phase 17 filters (user chose dropdowns instead).
- `monthsCoverTarget` number input (lines 291–299) — template for the "Min units" input: same `w-16 rounded-md border` class pattern, same `parseInt` + range validation on change handler.
- `useMemo` for `flatItems` (line 174) — pattern to follow for `filteredResults`: derive filtered array from `results` + filter state via `useMemo`, then pass to `flatItems` memo.
- CSS variables: `--color-surface-gray`, `--color-border-light`, `--color-text-secondary`, `--color-teal` — used throughout; new filter controls must use these.

### Established Patterns
- All filter state goes in `useState` at the top of `MatchPage` function — consistent with existing `monthsCoverTarget`, `selectedStores`, `expandedRows`.
- `useCallback` for event handlers — follow this for filter change handlers.
- Virtualization uses `flatItems` derived from `results`. Phase 17 must insert a filtering step: `filteredResults = useMemo(...)` from `results` + filter state, then `flatItems` derives from `filteredResults` instead of `results` directly.
- Grid template string appears in 3 places in MatchPage: sticky header div (line 490), main result row div (line 524), sub-match row div (line 571). Responsive changes must update all three consistently.
- `expandedRows` keyed by `${result.sku}::${result.sourceStore}` — when filtered results change, expanded state for hidden rows should be preserved (don't reset on filter change).

### Integration Points
- `flatItems` memo currently reads `results` directly (line 178). After Phase 17, it must read `filteredResults` instead. This is the single connection point between the new filter state and the virtualized table.
- The sticky header div and the virtualized body container must share a single horizontal scroll container so they scroll in sync. This may require restructuring the current `overflow-y: auto` container.
- Department dropdown: unique departments derived via `useMemo` from `results.map(r => r.department).filter(Boolean)` deduplicated with `Set`. Recomputed when `results` changes (after a new match run).

</code_context>

<specifics>
## Specific Ideas

- "Min units" label confirmed by user — do not use "$" anywhere in the min-value filter.
- Department filter button: "Department" when nothing selected, "Dept (N)" when N items checked.
- "Clear all" link: only appears when at least one filter is non-default (ranged ≠ "All", department selection non-empty, store ≠ "All stores", minUnits > 0).
- Store filter (TABLE-06): involves-store logic — `result.sourceStore === store OR result.bestMatch.store === store`. Not source-only or destination-only.
- Horizontal scroll: the requirement is no horizontal scrolling OR overlapping columns at 768px. The table container must have `overflow-x: auto` and column min-widths set so columns don't collapse into each other.

</specifics>

<deferred>
## Deferred Ideas

- Migrating existing components to shadcn/ui — user confirmed custom Tailwind stays for Phase 17. If shadcn adoption happens, it's a separate refactor phase.
- Sub-match row department/ranged display (noted in Phase 16) — still deferred.
- Mobile-specific card layout — explicitly out of scope; horizontal scroll covers mobile too.

</deferred>

---

*Phase: 17-Table Filters + Responsive Layout*
*Context gathered: 2026-05-14*
