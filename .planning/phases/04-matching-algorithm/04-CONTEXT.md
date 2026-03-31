# Phase 4: Matching Algorithm - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the audited `matchTransfers()` function to a POST /match Worker route, build the Match page in the React app with a months-cover control bar and "Run Match" trigger, and display results in a virtualized expandable-row table.

This phase does NOT include: freemium enforcement (Phase 5), PDF export (Phase 6), brand polish (Phase 6), or dark mode (Phase 6). The algorithm itself (`matcher.ts`) is already built — Phase 4 is API wiring + UI only.

</domain>

<decisions>
## Implementation Decisions

### Match Scope
- **D-01:** "Run Match" processes **all stores at once** — the system loops over every store that has dead-stock data uploaded, calls `matchTransfers` once per dead-stock store (using all other stores' ROU data as destinations), and merges the results into a single ranked table. No store selection step required — one click gives a full network view.
- **D-02:** The results table includes a **Source Store** column because results from multiple origin stores are combined. The column distinguishes which store is transferring out.
- **D-03:** The POST /match Worker route fetches all `dead_stock` rows and all `rou_data` rows for the org from NEON, then loops `matchTransfers({ originStore: store.name, monthsCoverTarget })` for each distinct dead-stock store, merges `results[]` and `warnings[]` arrays, and returns a single combined response.

### Months-Cover Input
- **D-04:** A **number input field** (min 1, max 24, step 1) with **quick-select preset buttons**: 1, 2, 3, 6, 12 months. Default value: **3 months**.
- **D-05:** The months-cover control sits in a **horizontal control bar at the top of the Match page** — months-cover label + input + preset buttons on the left, "Run Match" button on the right. Changing the value and clicking "Run Match" re-runs with the new target.
- **D-06:** "Run Match" button is always enabled (no blocking on missing data — see D-11 below). Clicking with no data simply returns empty results.

### Results Table
- **D-07:** **Best-match-per-SKU with expandable rows** — one collapsed row per dead-stock SKU showing the best destination match. Clicking the row expands to show all other valid destination matches for that SKU (from `allMatches[]`).
- **D-08:** **8 columns** in the collapsed (best-match) view:
  1. SKU
  2. Description
  3. Source Store
  4. Destination Store
  5. Qty to Transfer
  6. Dest ROU
  7. Months Cover
  8. Sell-Through Time (originSOH / destROU in months)
- **D-09:** The expanded sub-rows show all other destinations with the same 8 columns (minus Source Store and SKU/Description which are the same as the parent row — these can be omitted or shown greyed in expanded rows, Claude's discretion).
- **D-10:** Results are **virtualized** — only visible rows are rendered. The virtualized table component needs to be built for Phase 4 (no existing table component in the codebase).

### Data Quality Warnings
- **D-11:** After a match run, display a **collapsible amber banner** above the results table when `warnings.length > 0`. Banner header: "X items had data quality issues — expand to see details". Expanding shows a list of warnings with SKU, field, and reason from each `DataQualityWarning`.
- **D-12:** When `warnings.length === 0`, display a **green confirmation banner**: "All data passed quality checks." This gives explicit reassurance before acting on transfer recommendations.
- **D-13:** Both banners are only shown after a match run completes — not on the initial page load.

### Claude's Discretion
- Exact SQL query pattern for fetching all org dead-stock + ROU rows (JOIN or separate queries; prefer separate to keep queries simple and avoid cross-join complexity)
- Whether to deduplicate warnings across multi-store runs (same SKU + field from different origins could produce duplicate warnings)
- Virtualized table implementation approach (custom `useVirtualization` hook vs a lightweight library)
- Collapsed/expanded row animation details
- Loading state during match run (spinner, skeleton, or button loading state)
- Whether `Sell-Through Time` is formatted as "X.X months" or rounded to a whole number
- Error handling when the match run fails (Worker error → banner with retry CTA)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm (already built — read before API wiring)
- `apps/worker/src/matcher.ts` — `matchTransfers()` function, all types (`DeadStockItem`, `RouItem`, `MatchOptions`, `MatchResult`, `MatchTransfersResult`, `DataQualityWarning`)
- `apps/worker/src/ALGORITHM-SPEC.md` — authoritative algorithm spec with worked examples; especially Section 2 (months-cover cap) for understanding the `destSOH` parameter

### Requirements
- `.planning/REQUIREMENTS.md` §Matching Algorithm — MATCH-01 through MATCH-07 (requirements the API + UI must satisfy)
- `.planning/REQUIREMENTS.md` §Results & Export — RESULTS-01 (virtualized table columns)
- `.planning/ROADMAP.md` §Phase 4 — goal and success criteria

### Existing Worker Code (integration points)
- `apps/worker/src/index.ts` — Hono app; new match route mounts here alongside upload route
- `apps/worker/src/routes/upload.ts` — pattern reference for Hono route structure and `withOrgContext` usage
- `apps/worker/src/db/client.ts` — `withOrgContext` for RLS-scoped NEON queries; all fetch operations must use this

### Existing Web App (integration points)
- `apps/web/src/components/AppShell.tsx` — Match nav item is currently `disabled={true}` (line 42); Phase 4 enables it
- `apps/web/src/App.tsx` — routing; add `/match` route alongside `/upload`
- `apps/web/src/hooks/useFetch.ts` — authenticated fetch hook; use for POST /match call
- `apps/web/src/pages/UploadPage.tsx` — pattern reference for page structure (AppShell wrapper, control bar, content area)

### Phase 2 Context (algorithm decisions)
- `.planning/phases/02-logic-audit/02-CONTEXT.md` — D-01 through D-15 define the algorithm interface; particularly D-03 (`RouItem.soh` is optional, defaults to 0)

### NEON Schema
- `.planning/phases/01-foundation/01-CONTEXT.md` §D-03 — full schema: `rou_data` (store_id, sku, description, rou, soh, uploaded_at), `dead_stock` (store_id, sku, description, soh, is_ranged, uploaded_at)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/worker/src/matcher.ts` — `matchTransfers`, `parseIsRanged`, all types — import directly, do not duplicate
- `apps/worker/src/routes/upload.ts` — Hono route pattern: `const matchRoute = new Hono<{ Bindings: Env; Variables: Variables }>()` with `withOrgContext` for all DB ops
- `apps/web/src/hooks/useFetch.ts` — authenticated fetch hook; use for the POST /match API call
- `apps/web/src/components/AppShell.tsx` — layout wrapper; Match page slots into `<main>` area

### Established Patterns
- `withOrgContext` (db/client.ts) — mandatory for all NEON queries; RLS enforcement
- Hono `app.route('/api', matchRoute)` in `index.ts` — add alongside existing `uploadRoute`
- Tailwind utility classes + brand tokens (`#0F766E`, `#D97706`, `#0F172A`) — no new CSS
- `async/await` throughout; camelCase JSON keys in all API responses
- Per-page structure: AppShell wrapper → header row → control bar → content area (established in UploadPage)

### Integration Points
- `AppShell.tsx` Match nav item (`disabled={true}`) → Phase 4 enables it and adds `/match` route
- `App.tsx` → add `<Route path="/match" element={<ProtectedRoute requireOrg={true}><MatchPage /></ProtectedRoute>} />`
- Worker `index.ts` → `app.route('/api', matchRoute)` alongside existing health + upload routes
- NEON `rou_data` + `dead_stock` + `stores` tables → Phase 4 reads them all; no new migrations needed

</code_context>

<specifics>
## Specific Ideas

- The control bar pattern (input + presets + action button in a horizontal row) should be consistent with the Upload page's header row style — same font, same button styling, same spacing
- Preset buttons (1, 2, 3, 6, 12) should visually highlight/activate the currently selected value when it matches a preset
- "Sell-Through Time" in the table is `originSOH / destROU` — should probably display as a decimal (e.g., "4.8 months") not a whole number, since pharmacists will care about precision
- The amber warning banner and green confirmation banner both use the PharmIQ amber `#D97706` and a green — green should be a teal-adjacent shade consistent with the brand (not a generic green)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-matching-algorithm*
*Context gathered: 2026-03-31*
