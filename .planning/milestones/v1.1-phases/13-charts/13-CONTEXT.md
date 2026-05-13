# Phase 13: Charts - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Install Recharts 3.8.1 in apps/web and build two chart components: `DeadStockChart` (PieChart) mounted on UploadPage showing dead stock units per store from `useDeadStockSummary` data, and `PostMatchChart` (grouped BarChart) mounted on MatchPage showing before/after dead stock units per source store with a net units recovered KPI card. No backend changes — all data comes from existing hooks.

</domain>

<decisions>
## Implementation Decisions

### PostMatchChart Aggregation Logic
- **D-01:** Only stores that appear as a **source store** in match results are shown in the grouped bar chart. Destination-only stores are excluded — they received stock that is expected to sell, not sit as dead stock.
- **D-02:** **Before** = `totalUnits` from `useDeadStockSummary()` for that store. **After** = `Math.max(0, totalUnits - sum(qtyToTransfer))` where `qtyToTransfer` is summed across all `MatchResult` entries where `sourceStore === this store`.
- **D-03:** If a store appears as both source and destination in the same match run, treat it as a source store only. Deduct outgoing transfers; ignore incoming. Do not apply bidirectional netting.
- **D-04:** After value is clamped to `Math.max(0, before - outgoing)`. Negative bars are not allowed — if rounding causes outgoing to exceed `totalUnits`, the After bar renders at zero.
- **D-05:** "Net units recovered" KPI card = `sum(qtyToTransfer)` across **all** match results (not limited to source stores). Displayed above the chart, as specified in ROADMAP.md.
- **D-06:** PostMatchChart does not appear until `hasRun` is true (first match completed). Empty state before that: no chart section rendered on MatchPage.

### Pie Chart Label Style
- **D-07:** External labels on each slice — store name + unit count appear as text outside the pie connected by a short leader line (Recharts `renderCustomizedLabel` prop on `<Cell>` or the label prop on `<Pie>`).
- **D-08:** Tooltip on hover (in addition to external labels) — shows store name, unit count, and percentage share. Provides precision without replacing the at-a-glance labels.

### UploadPage Chart Placement
- **D-09:** Chart section is **always visible** below the store card grid — it renders regardless of whether dead stock data has been uploaded.
- **D-10:** When no dead stock data exists (summary returns empty or all stores have `totalUnits === 0`), the chart area shows an appropriate empty state message (e.g., "Upload dead stock data to see distribution here") instead of a blank space.
- **D-11:** Chart is **full width** below the store grid — same content width as the store cards section above.
- **D-12:** A visible section heading is shown above the chart: "Dead Stock by Store" (or similar), styled as a small sub-heading consistent with the existing page header style.

### Claude's Discretion
- Exact `renderCustomizedLabel` implementation for external labels (truncation threshold for long store names)
- Recharts `react-is` version override if needed (check compatibility before adding override)
- Loading skeleton or spinner while `useDeadStockSummary` is fetching
- Exact KPI card styling (metric value size, label, container)
- Whether PostMatchChart shows a loading state when `useDeadStockSummary` hasn't resolved yet when match completes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data hooks (source of truth for chart data)
- `apps/web/src/hooks/useDeadStockSummary.ts` — `StoreSummary` interface (`name`, `totalUnits`, `totalValue`, `hasCostData`); `refetch()` pattern; used by both DeadStockChart and PostMatchChart
- `apps/web/src/hooks/useMatchRun.ts` — `MatchResult` interface (`sku`, `sourceStore`, `bestMatch.qtyToTransfer`, `allMatches`); `hasRun` boolean; the `results` array is the source for PostMatchChart before/after aggregation

### Pages to modify (mount points)
- `apps/web/src/pages/UploadPage.tsx` — add `useDeadStockSummary()` call + `refetch()` trigger after upload; mount `DeadStockChart` below store card grid
- `apps/web/src/pages/MatchPage.tsx` — add `useDeadStockSummary()` call on mount; mount `PostMatchChart` + KPI card below results table when `hasRun` is true

### Package config
- `apps/web/package.json` — where recharts 3.8.1 is installed; check for `react-is` peer dep conflict

### Roadmap pitfalls (mandatory — read before implementing)
- `.planning/ROADMAP.md` §Phase 13 Pitfalls — `min-h-[300px]` wrapper rule, `isAnimationActive={false}`, hex literals for SVG fills, state reset rule

### Requirements
- `.planning/REQUIREMENTS.md` §VIZ-01, VIZ-02, VIZ-03 — acceptance criteria this phase must satisfy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useDeadStockSummary` hook — already built in Phase 12; returns `{ summary, loading, error, refetch }`. Both pages instantiate it independently (per D-12 from Phase 12 context).
- `useMatchRun` hook — exposes `results: MatchResult[]`, `hasRun: boolean`, `loading`, `error`. MatchPage already imports this; PostMatchChart receives `results` as a prop or reads from the same hook.
- `AppShell` — wraps both pages; chart components mount inside the existing content area.

### Established Patterns
- **Hex literals for SVG fills** — `#0F766E` (teal), `#D97706` (amber). CSS custom properties do not work inside Recharts SVG fills.
- **Tailwind utility classes** with `var(--color-*)` CSS variables for non-SVG theming (borders, backgrounds, text).
- **Dark mode** — uses `var(--color-surface)`, `var(--color-text-primary)`, etc. Chart backgrounds and text must use these variables; only slice fills use hex literals.
- **`isAnimationActive={false}`** on all Recharts components — required per roadmap pitfall.
- **`min-h-[300px]` wrapper** — required around every `ResponsiveContainer` per roadmap pitfall.
- No external chart library currently — recharts install is the first task.

### Integration Points
- `UploadPage` — after successful upload (`onUploadComplete` callback in `UploadModal`), call `summaryRefetch()` to redraw the pie chart without page reload.
- `MatchPage` — `useDeadStockSummary()` is called on mount; `hasRun` gates whether `PostMatchChart` renders.
- State reset: when a new dead stock upload occurs (before new match run), clear/reset any PostMatchChart derived state in the same setState call that clears `results` — do not let chart and results table derive from different data snapshots (roadmap pitfall).

</code_context>

<specifics>
## Specific Ideas

- "Projected if all transfers complete" — this label belongs on the PostMatchChart (specified in ROADMAP.md plan description); it should appear as a subtitle or chart label, not as a tooltip.
- Before bar = amber `#D97706`, After bar = teal `#0F766E` — consistent with the broader brand palette and the UAT criteria ("Before (amber) and After (teal)").
- Pie chart uses teal/amber palette — with multiple stores, extend to adjacent brand tones if needed (Claude's discretion on exact multi-store color sequence).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-charts*
*Context gathered: 2026-04-17*
