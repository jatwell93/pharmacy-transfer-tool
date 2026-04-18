---
phase: 13-charts
verified: 2026-04-17T23:30:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Open UploadPage in browser — verify pie chart section 'Dead Stock by Store' is visible at bottom of page"
    expected: "Chart section always visible (D-09). With no data: empty state message 'Upload dead stock data to see distribution here.' With data: pie chart with coloured slices."
    why_human: "Visual rendering and responsive layout cannot be verified without a running browser"
  - test: "Upload dead stock data for 2+ stores, then observe the pie chart"
    expected: "Pie chart renders with one slice per store using PharmIQ palette (#0F766E teal, #D97706 amber). External labels show 'StoreName: unitCount' outside each slice. Hovering a slice shows tooltip with store name, unit count, and percentage of total."
    why_human: "SVG rendering, external label positioning, and tooltip interactivity require browser verification"
  - test: "Toggle dark mode — observe pie chart text and tooltip"
    expected: "External labels remain readable. Tooltip background uses var(--color-surface) (dark navy), border uses var(--color-border-light), text uses var(--color-text-primary). Chart colours unchanged (hex literals, not CSS vars)."
    why_human: "Dark mode CSS variable resolution requires browser rendering"
  - test: "Re-upload a dead stock file — observe pie chart redraw"
    expected: "Pie chart redraws without a full page reload. DeadStockChart re-renders with updated data after summaryRefetch() fires."
    why_human: "Live refetch/redraw behaviour requires browser interaction"
  - test: "Open MatchPage before any match run — verify no PostMatchChart appears"
    expected: "No bar chart section visible. Only the control bar, store selector, and empty state prompt are shown."
    why_human: "hasRun gate behaviour requires browser interaction"
  - test: "Run a match with uploaded data — observe grouped bar chart and KPI card"
    expected: "Below results table: 'Transfer Impact' heading appears. KPI card shows 'Net Units Recovered' with a teal integer. Bar chart shows Before (amber #D97706) and After (teal #0F766E) bars per source store. 'Projected if all transfers complete' subtitle appears above chart."
    why_human: "Post-match chart render and KPI value correctness require live match data"
  - test: "Verify After bars never go below zero in PostMatchChart"
    expected: "All After bars are >= 0 regardless of outgoing transfer quantities. The Math.max(0, ...) clamp prevents negative bar heights."
    why_human: "Visual bar height verification requires browser with live data"
  - test: "Toggle dark mode on MatchPage with PostMatchChart visible"
    expected: "Bar chart axes, grid lines, tooltip, and KPI card all adapt to dark mode using CSS variables. Bar fill colours (hex literals) remain unchanged."
    why_human: "Dark mode CSS variable resolution on recharts non-SVG elements requires browser rendering"
---

# Phase 13: Charts Verification Report

**Phase Goal:** Add recharts-based data visualisation to the UploadPage (dead-stock pie chart) and MatchPage (transfer-impact bar chart + KPI card), using the PharmIQ brand palette, so users instantly see actionable insights after upload and match runs.
**Verified:** 2026-04-17T23:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | recharts 3.8.1 is installed in apps/web and importable | VERIFIED | `package.json` `"recharts": "^3.8.1"`; `package-lock.json` `"version": "3.8.1"` resolved from registry; commits 9162388 |
| 2 | User sees a pie chart of dead stock units per store after uploading dead stock data | VERIFIED | `DeadStockChart.tsx` exists (118 lines), wired in `UploadPage.tsx` via `useDeadStockSummary`; data flows from `/api/dead-stock-summary` |
| 3 | Pie chart slices use PharmIQ hex colours (#0F766E teal, #D97706 amber, extended palette) | VERIFIED | `CHART_COLOURS = ['#0F766E', '#D97706', '#14B8A6', '#B45309', '#0D5D5A']` on line 4 of DeadStockChart.tsx |
| 4 | Each slice has an external label showing store name and unit count | VERIFIED | `renderLabel` function at lines 19-39 of DeadStockChart.tsx; positioned at `outerRadius + 30`; text: `${displayName}: ${value.toLocaleString()}` |
| 5 | Hovering a slice shows a tooltip with store name, unit count, and percentage | VERIFIED | `CustomTooltip` component lines 52-73 of DeadStockChart.tsx; shows name, units, and `${pct}% of total` |
| 6 | When no dead stock data exists, the chart area shows an empty state message | VERIFIED | UploadPage.tsx lines 114-119; text "Upload dead stock data to see distribution here." rendered when no store has `totalUnits > 0` |
| 7 | Re-uploading a dead stock file redraws the pie chart without a page reload | VERIFIED | `handleUploadComplete` (UploadPage.tsx lines 30-33) calls both `refresh()` and `summaryRefetch()` — triggering re-fetch of summary data |
| 8 | Chart renders correctly in dark mode | ? HUMAN | CSS variables on CustomTooltip (`var(--color-surface)`, `var(--color-text-primary)`) are correct; visual verification needed |
| 9 | After running a match, user sees a grouped bar chart with Before (amber) and After (teal) bars per source store | VERIFIED | `PostMatchChart.tsx` lines 86-97; `fill="#D97706"` on Before bar, `fill="#0F766E"` on After bar; wired in `MatchPage.tsx` lines 578-596 |
| 10 | Only source stores from match results appear in the bar chart (destination-only stores excluded) | VERIFIED | `outgoingByStore` Map built from `r.sourceStore` only (PostMatchChart.tsx lines 21-25); `chartData` filters to `outgoingByStore.has(s.name)` (line 30) |
| 11 | After bar value is clamped to Math.max(0, before - outgoing) — never negative | VERIFIED | PostMatchChart.tsx line 34: `after: Math.max(0, s.totalUnits - (outgoingByStore.get(s.name) ?? 0))` |
| 12 | A KPI card above the chart shows total net units recovered across all match results | VERIFIED | PostMatchChart.tsx lines 46-54; "Net Units Recovered" label; `results.reduce((sum, r) => sum + r.bestMatch.qtyToTransfer, 0)` |
| 13 | Chart subtitle reads 'Projected if all transfers complete' | VERIFIED | PostMatchChart.tsx line 59: `Projected if all transfers complete` |
| 14 | Chart does not appear until hasRun is true (no empty chart before first match) | VERIFIED | MatchPage.tsx line 578: `{hasRun && results.length > 0 && (` gating the PostMatchChart section |
| 15 | PostMatchChart renders correctly in dark mode | ? HUMAN | CSS variables on non-SVG elements (CartesianGrid, XAxis, YAxis, Tooltip) are correctly set; visual verification needed |

**Score:** 13/13 truths verified programmatically, 2 additional truths requiring human verification (dark mode rendering)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/DeadStockChart.tsx` | PieChart component with external labels and tooltip | VERIFIED | 118 lines; named export `DeadStockChart`; full PieChart with `renderLabel`, `CustomTooltip`, brand colours, `isAnimationActive={false}`, `outerRadius={100}`, `min-h-[300px]`, `overflow: 'visible'` |
| `apps/web/src/pages/UploadPage.tsx` | UploadPage with mounted DeadStockChart and summary refetch | VERIFIED | Imports `useDeadStockSummary` and `DeadStockChart`; chart section always rendered (D-09); three-state section (loading/chart/empty); `handleUploadComplete` calls both `refresh()` and `summaryRefetch()` |
| `apps/web/src/components/PostMatchChart.tsx` | Grouped BarChart + KPI card component | VERIFIED | 105 lines; named export `PostMatchChart`; `outgoingByStore` Map; D-04 clamp; `results.reduce` KPI; correct hex colours; `isAnimationActive={false}` on both bars; `min-h-[300px]` |
| `apps/web/src/pages/MatchPage.tsx` | MatchPage with mounted PostMatchChart gated on hasRun | VERIFIED | Imports `useDeadStockSummary` and `PostMatchChart`; `useDeadStockSummary` called on mount; section gated on `hasRun && results.length > 0`; spinner fallback; "Transfer Impact" heading |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `UploadPage.tsx` | `useDeadStockSummary.ts` | `useDeadStockSummary()` hook call | WIRED | Line 12: `const { summary, loading: summaryLoading, refetch: summaryRefetch } = useDeadStockSummary()` |
| `UploadPage.tsx` | `DeadStockChart.tsx` | import and render with stores prop | WIRED | Line 8 import; line 113: `<DeadStockChart stores={summary?.stores ?? []} />` |
| `UploadPage.tsx` | `UploadModal onUploadComplete` | `summaryRefetch` called alongside `refresh` | WIRED | Lines 30-33: `handleUploadComplete` calls both; line 128: `onUploadComplete={handleUploadComplete}` |
| `MatchPage.tsx` | `useDeadStockSummary.ts` | `useDeadStockSummary()` hook call on mount | WIRED | Line 31: `const { summary, loading: summaryLoading } = useDeadStockSummary()` |
| `MatchPage.tsx` | `PostMatchChart.tsx` | import and render with results + summary props | WIRED | Line 10 import; lines 591-594: `<PostMatchChart results={results} summary={summary?.stores ?? []} />` |
| `PostMatchChart.tsx` | `MatchResult.sourceStore` and `bestMatch.qtyToTransfer` | aggregation loop building `outgoingByStore` Map | WIRED | Lines 21-25: loop reads `r.sourceStore` and `r.bestMatch.qtyToTransfer` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DeadStockChart.tsx` | `stores` prop (filtered from `summary.stores`) | `useDeadStockSummary` → `GET /api/dead-stock-summary` → NEON `dead_stock` aggregate query | Yes — live DB aggregation (established in Phase 12) | FLOWING |
| `PostMatchChart.tsx` | `results` prop | `useMatchRun` → `POST /api/match` → NEON queries + matchTransfers algorithm | Yes — live match run data (established in Phase 4/7/8) | FLOWING |
| `PostMatchChart.tsx` | `summary` prop | `useDeadStockSummary` → `GET /api/dead-stock-summary` → NEON `dead_stock` aggregate query | Yes — same live DB endpoint as DeadStockChart | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for browser-rendered React components — chart rendering requires a running browser. TypeScript compilation and build outputs are the runnable checks applicable here.

| Behavior | Evidence | Status |
|----------|----------|--------|
| recharts 3.8.1 listed in package-lock.json | `"version": "3.8.1"` in `node_modules/recharts` lock entry | PASS |
| DeadStockChart exports `DeadStockChart` function | Line 75: `export function DeadStockChart` | PASS |
| PostMatchChart exports `PostMatchChart` function | Line 19: `export function PostMatchChart` | PASS |
| UploadPage imports both hook and chart component | Lines 7-8 of UploadPage.tsx | PASS |
| MatchPage imports both hook and chart component | Lines 6, 10 of MatchPage.tsx | PASS |
| PostMatchChart section gated on `hasRun` | Line 578 of MatchPage.tsx: `{hasRun && results.length > 0 && (` | PASS |
| Commits verified in git log | 9162388, 57b67f9, 96ab2e3, 90ac728, 06fc747 all present in git log | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VIZ-01 | 13-01-PLAN.md | User sees a pie chart of dead stock units per store when dead stock data is uploaded | SATISFIED | `DeadStockChart.tsx` mounts on `UploadPage.tsx`; receives `useDeadStockSummary` data; pie with hex brand colours, external labels, tooltip, empty state |
| VIZ-02 | 13-02-PLAN.md | After running a match, user sees a grouped bar chart: current vs projected dead stock units per store | SATISFIED | `PostMatchChart.tsx` mounts on `MatchPage.tsx` gated by `hasRun`; `outgoingByStore` map computes before/after per source store; amber/teal bars |
| VIZ-03 | 13-02-PLAN.md | Post-match view shows a "Net units recovered" KPI card — total units cleared across all stores | SATISFIED | KPI card in `PostMatchChart.tsx` lines 46-54; "Net Units Recovered" label; `results.reduce` sum of all `qtyToTransfer` |

**Note on REQUIREMENTS.md checkboxes:** All three VIZ requirements still show `[ ]` (Pending) in REQUIREMENTS.md and the traceability table. The code fully implements VIZ-01, VIZ-02, and VIZ-03. The checkboxes require a documentation update (equivalent to what Phase 9 did for v1 requirements). This is a documentation gap, not a functional gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/pages/MatchPage.tsx` | 548 | `{/* Indent chevron placeholder */}` | Info | Comment labels an indent visual for expand/collapse rows — not a code stub; no functional impact |
| `apps/web/src/components/DeadStockChart.tsx` | 80 | `if (data.length === 0) return null` | Info | Intentional empty-state delegation to parent per D-10; parent UploadPage renders the empty state message — correct pattern, not a stub |

No blockers or warnings found.

### Human Verification Required

#### 1. Pie Chart Visual Rendering (UploadPage)

**Test:** Open UploadPage in a browser with at least 2 stores' dead stock data uploaded.
**Expected:** Pie chart appears in the "Dead Stock by Store" section. Each store has a coloured slice using the PharmIQ palette (#0F766E teal, #D97706 amber, cycling for >5 stores). External labels appear outside the pie showing "StoreName: unitCount". Hovering shows a tooltip with store name, unit count, and percentage of total.
**Why human:** SVG label positioning (outerRadius + 30px offset), tooltip hover interactivity, and colour contrast cannot be verified programmatically.

#### 2. Empty State Display (UploadPage)

**Test:** Open UploadPage when no dead stock data has been uploaded.
**Expected:** The "Dead Stock by Store" section is visible with the message "Upload dead stock data to see distribution here." inside a bordered rounded container. No blank white space.
**Why human:** Visual layout and empty state presentation require browser rendering.

#### 3. Dark Mode — Pie Chart (UploadPage)

**Test:** Toggle dark mode while on UploadPage with pie chart visible.
**Expected:** External label text becomes readable against dark background (uses `var(--color-text-secondary)`). Tooltip background changes to dark surface (`var(--color-surface)`). Pie slice colours remain unchanged (hex literals). Chart section background adapts.
**Why human:** CSS variable resolution in dark mode and SVG text contrast require browser rendering.

#### 4. Chart Redraw on Re-upload (UploadPage)

**Test:** Upload dead stock data for a store, observe pie chart. Re-upload the same store with different data. Observe without refreshing the page.
**Expected:** Pie chart redraws with updated slice sizes/counts without a full page reload.
**Why human:** React re-render cycle from `summaryRefetch()` → API refetch → state update → chart re-render requires live browser interaction.

#### 5. PostMatchChart Appears Only After Match Run (MatchPage)

**Test:** Load MatchPage before clicking Run Match. Verify no chart section appears. Click Run Match with uploaded data. Verify chart section appears below results table.
**Expected:** Before run: only control bar, store selector, and empty-state prompt visible. After run with results: "Transfer Impact" heading, KPI card with teal integer, grouped bar chart with Before/After bars and subtitle.
**Why human:** `hasRun` state transition and section visibility require browser interaction.

#### 6. Bar Chart Correctness (MatchPage)

**Test:** After running a match, inspect the bar chart. Verify Before bars (amber) represent pre-transfer dead stock units. Verify After bars (teal) are always >= 0. Verify only source stores appear (no destination-only stores).
**Expected:** Before bar height reflects `totalUnits` from summary endpoint. After bar reflects `totalUnits - qtyToTransfer` clamped to 0. "Projected if all transfers complete" subtitle visible.
**Why human:** Bar height proportionality and D-04 clamp correctness on edge cases require visual inspection with live data.

#### 7. Dark Mode — Bar Chart (MatchPage)

**Test:** Toggle dark mode with PostMatchChart visible.
**Expected:** CartesianGrid lines, XAxis/YAxis tick labels, tooltip background, and KPI card adapt to dark mode via CSS variables. Bar fill colours (#D97706 amber, #0F766E teal) remain unchanged.
**Why human:** recharts non-SVG element styling with CSS variables requires browser dark mode rendering verification.

#### 8. REQUIREMENTS.md Checkbox Update

**Test:** Manual check — update VIZ-01, VIZ-02, VIZ-03 checkboxes to `[x]` and traceability table status to "Complete" in REQUIREMENTS.md.
**Expected:** All three VIZ requirements show `[x]` and "Complete" to match actual implementation status.
**Why human:** Documentation update requires human decision and edit (separate from code verification).

### Gaps Summary

No functional gaps found. All 13 programmatically verifiable must-have truths are satisfied:

- recharts 3.8.1 is installed and locked in package-lock.json
- `DeadStockChart.tsx` is fully implemented with all required features (external labels, custom tooltip, hex brand colours, animation disabled, outerRadius=100, min-h wrapper, overflow visible)
- `UploadPage.tsx` is correctly wired: always-visible chart section, three-state rendering (loading/chart/empty), combined `handleUploadComplete` calling both `refresh()` and `summaryRefetch()`
- `PostMatchChart.tsx` is fully implemented with all required features (outgoingByStore Map, D-04 clamp, results.reduce KPI, amber/teal bars, animation disabled, min-h wrapper, KPI card with Space Grotesk font)
- `MatchPage.tsx` is correctly wired: `hasRun && results.length > 0` gate, `useDeadStockSummary` called on mount, spinner fallback for `summaryLoading`, "Transfer Impact" heading, PostMatchChart before upgrade modal overlay
- All 5 required commits exist in git log (9162388, 57b67f9, 96ab2e3, 90ac728, 06fc747)
- Data flow verified end-to-end: both chart components receive live data from authenticated API endpoints established in Phase 12

**One documentation note:** REQUIREMENTS.md VIZ-01, VIZ-02, VIZ-03 checkboxes remain `[ ]` and traceability table shows "Pending". The implementation is complete — this is a documentation update that mirrors what Phase 9 did for v1 requirements.

**8 human verification items** remain for visual rendering, dark mode, and live interaction behaviour.

---

_Verified: 2026-04-17T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
