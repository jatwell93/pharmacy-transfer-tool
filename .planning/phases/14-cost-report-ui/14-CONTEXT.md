# Phase 14: Cost Report UI - Context

**Gathered:** 2026-04-26 (updated)
**Status:** Implementation complete — context updated with post-build decisions

<domain>
## Phase Boundary

Build `CostReport.tsx` — a panel on MatchPage that shows per-store dead stock dollar values (from `useDeadStockSummary`), a client-side total SOH $ input for percentage benchmarking, benchmark indicators (amber 10–25%, red >25%), and a "Recoverable value" KPI card after a match run. Also fix the match route to pass `cost_ex` from the DB instead of the current hardcoded `cost: 0`. Mount below `PostMatchChart` on MatchPage. No new API routes.

</domain>

<decisions>
## Implementation Decisions

### Panel Visibility & Placement
- **D-01:** CostReport panel is **always visible** below `PostMatchChart` on MatchPage — renders regardless of whether a match has been run. Mirrors the UploadPage chart section pattern (always shown, with contextual content depending on data state).
- **D-02:** ~~Original~~ — superseded by D-14 (two distinct empty states). See D-14 below.

### Per-Store Breakdown Format
- **D-03:** Per-store dead stock values are displayed as a **horizontal row of metric cards** — same visual pattern as `StoreCard` on UploadPage. One card per store.
- **D-04:** Each card shows: **store name + dead stock dollar value only** (e.g. "$1,240"). No unit count, no per-store percentage. Clean and focused — the percentage comparison belongs at the org level driven by the SOH input.

### SOH Input & Percentage Display
- **D-05:** The total SOH $ input is positioned **below the store cards, above the percentage summary**. It is a labelled numeric input field. The calculation updates immediately on input (no submit button).
- **D-06:** The percentage indicator uses a **horizontal progress bar with threshold markers**: a bar from 0–100% with vertical marker lines at 10% (amber threshold) and 25% (red threshold). Bar fill colour changes based on the current percentage: teal below 10%, amber 10–25%, red above 25%.
- **D-07:** When SOH input is empty or 0, the percentage bar is hidden and a placeholder is shown (e.g. "Enter total SOH value above"). The UI must never display `Infinity%` or `NaN%`.
- **D-13:** SOH input value **persists to `localStorage`** using an org-specific key: `pharmiq_soh_[orgId]`. OrgId is retrieved from Clerk's `useOrganization()` hook (already used elsewhere in the codebase). Value is restored from localStorage on component mount; updated on every change. This ensures a pharmacy manager's SOH figure survives page reloads without any server round-trip.

### Recoverable Value KPI
- **D-08:** The "Recoverable value" KPI card lives **inside CostReport**, shown at the top of the panel when `hasRun === true` AND cost data is present (at least one store with `hasCostData === true`). Keeps all cost/dollar information together in one panel.
- **D-09:** Recoverable value = `sum(qtyToTransfer × cost)` across **all** `MatchResult` entries where `cost > 0`. Uses `MatchResult.cost` (per-unit cost from the dead stock upload).
- **D-10:** Match route Worker fix is **in scope for this phase**: update `apps/worker/src/routes/match.ts` to SELECT `ds.cost_ex` from the dead_stock table and pass it as `cost` in the `DeadStockItem` array (replacing the current hardcoded `cost: 0`). This is a 2-line change — SQL extension + `row.cost_ex ?? 0` mapping.

### Edge Cases
- **D-11:** When `cost_ex` is null for some SKUs (older uploads without cost data), those SKUs contribute `0` to the recoverable total (via `?? 0` — consistent with matcher's NaN fallback pattern). No error or warning needed for null cost in the UI calculation.
- **D-12:** The Recoverable $ KPI is suppressed (not shown as $0) when all matched SKUs have `cost === 0`. Only render the KPI when the calculated value is > 0.

### Empty States (post-build update)
- **D-14:** Two distinct empty states distinguished by `totalUnits`:
  - **No upload yet** (`stores.every(s => s.totalUnits === 0)` or `stores.length === 0`): show "Upload a dead stock file to see values here." — user hasn't uploaded anything yet, so "re-upload" framing is incorrect.
  - **Uploaded without cost column** (any store has `totalUnits > 0` but all have `hasCostData === false`): show "Re-upload dead stock using FRED Stock Valuation report format to see dollar values." — user has data but it lacks cost_ex.
  - This replaces the single message from original D-02.

### Claude's Discretion
- Exact card layout dimensions and spacing (consistent with existing StoreCard style is the goal)
- Progress bar implementation details (CSS or inline style for the fill)
- Dollar formatting locale (AUD format: `$1,240.00` — two decimal places, comma thousands separator)
- Loading state while `summaryLoading` is true
- Section heading text (e.g. "Cost Report" or "Dead Stock Value")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hooks (data sources for this phase)
- `apps/web/src/hooks/useDeadStockSummary.ts` — `StoreSummary` interface (`name`, `totalUnits`, `totalValue`, `hasCostData`); per-store data for the cards and recoverable calculation
- `apps/web/src/hooks/useMatchRun.ts` — `MatchResult` interface (`cost` field already present); `hasRun` boolean gates the Recoverable KPI

### Worker route to fix
- `apps/worker/src/routes/match.ts` — lines ~95 and ~139: add `ds.cost_ex` to dead_stock SELECT; replace `cost: 0` with `row.cost_ex ?? 0` in the DeadStockItem push

### Mount point
- `apps/web/src/pages/MatchPage.tsx` — mount `<CostReport />` below `<PostMatchChart />` in the existing `hasRun`-gated section (or just below it for the always-visible version per D-01)

### Pattern references (style consistency)
- `apps/web/src/components/StoreCard.tsx` — card pattern to follow for per-store metric cards
- `apps/web/src/components/PostMatchChart.tsx` — KPI card style (used for "Net units recovered") to match for Recoverable $ KPI

### Requirements
- `.planning/REQUIREMENTS.md` §COST-03, COST-05 — acceptance criteria for this phase

### Phase 12 context (data layer background)
- `.planning/phases/12-cost-column-parser-summary-endpoint/12-CONTEXT.md` — D-05 through D-11 define the `hasCostData` signal, summary response shape, and COST-04 instructional message logic

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useDeadStockSummary` — already instantiated in `MatchPage.tsx` (line 31); `summary.stores[]` has `totalValue` and `hasCostData` per store
- `useMatchRun` — `results: MatchResult[]` with `cost` field (currently 0 until match route fix); `hasRun` boolean
- `StoreCard` component — pattern for per-store metric cards; reuse or replicate the card shell style
- `PostMatchChart` KPI card — the "Net units recovered" metric card style; match for Recoverable $ visual treatment

### Established Patterns
- Brand colours: teal `#0F766E`, amber `#D97706`; use hex literals for SVG fills, CSS variables elsewhere
- Tailwind utility classes with `var(--color-*)` CSS variables for dark mode theming
- `isAnimationActive={false}` on all Recharts components (not applicable here — no new charts)
- Dollar formatting: AUD style with comma thousands separator

### Integration Points
- `MatchPage.tsx` — `summary` is already destructured from `useDeadStockSummary()` at line 31; pass `summary.stores` and `results` as props to `<CostReport />`
- Match route `cost_ex` fix: `apps/worker/src/routes/match.ts` — small SQL + mapping change; no new route, no schema change needed

</code_context>

<specifics>
## Specific Ideas

- Percentage indicator = horizontal progress bar with vertical threshold markers at 10% (amber) and 25% (red) — chosen over a badge or inline text for visual clarity at a glance
- Recoverable value KPI is at the top of the panel (most important post-match signal), per-store cards below it, then SOH input + percentage bar at the bottom

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-cost-report-ui*
*Context gathered: 2026-04-18 | Updated: 2026-04-26 — added D-13 (SOH localStorage), D-14 (two distinct empty states)*
