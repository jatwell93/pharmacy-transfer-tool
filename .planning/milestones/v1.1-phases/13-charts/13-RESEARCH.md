# Phase 13: Charts - Research

**Researched:** 2026-04-17
**Domain:** Recharts 3.8.1 — PieChart + BarChart integration in React 19 / Vite / Tailwind CSS v4 app
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**PostMatchChart Aggregation Logic**
- D-01: Only stores that appear as a **source store** in match results are shown in the grouped bar chart. Destination-only stores are excluded.
- D-02: Before = `totalUnits` from `useDeadStockSummary()` for that store. After = `Math.max(0, totalUnits - sum(qtyToTransfer))` where `qtyToTransfer` is summed across all `MatchResult` entries where `sourceStore === this store`.
- D-03: If a store appears as both source and destination in the same match run, treat it as source only. Deduct outgoing transfers; ignore incoming. No bidirectional netting.
- D-04: After value is clamped to `Math.max(0, before - outgoing)`. Negative bars are not allowed.
- D-05: "Net units recovered" KPI card = `sum(qtyToTransfer)` across **all** match results (not limited to source stores). Displayed above the chart.
- D-06: PostMatchChart does not appear until `hasRun` is true. Empty state before that: no chart section rendered on MatchPage.

**Pie Chart Label Style**
- D-07: External labels on each slice — store name + unit count appear as text outside the pie connected by a short leader line (Recharts `renderCustomizedLabel` prop or `label` prop on `<Pie>`).
- D-08: Tooltip on hover — shows store name, unit count, and percentage share.

**UploadPage Chart Placement**
- D-09: Chart section is **always visible** below the store card grid, regardless of whether dead stock data has been uploaded.
- D-10: When no dead stock data exists (summary returns empty or all stores have `totalUnits === 0`), chart area shows an empty state message (e.g., "Upload dead stock data to see distribution here").
- D-11: Chart is **full width** below the store grid.
- D-12: Visible section heading "Dead Stock by Store" (or similar) above the chart, styled as a small sub-heading.

### Claude's Discretion
- Exact `renderCustomizedLabel` implementation for external labels (truncation threshold for long store names)
- Recharts `react-is` version override if needed (check compatibility before adding override)
- Loading skeleton or spinner while `useDeadStockSummary` is fetching
- Exact KPI card styling (metric value size, label, container)
- Whether PostMatchChart shows a loading state when `useDeadStockSummary` hasn't resolved yet when match completes

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-01 | User sees a pie chart of dead stock units per store when dead stock data is uploaded (pre-match view) | `useDeadStockSummary` StoreSummary interface provides `name` + `totalUnits`; Recharts `<PieChart>` + `<Pie>` with `<Cell>` covers this |
| VIZ-02 | After running a match, user sees a grouped bar chart: current vs projected dead stock units per store (assuming all recommended transfers complete) | `useMatchRun` provides `results: MatchResult[]` with `sourceStore` + `bestMatch.qtyToTransfer`; Recharts `<BarChart>` grouped mode covers this; aggregation logic defined by D-01 through D-04 |
| VIZ-03 | Post-match view shows a "Net units recovered" KPI card — total units cleared across all stores | Sum of `bestMatch.qtyToTransfer` across all `results`; simple derived value, no backend change needed |
</phase_requirements>

---

## Summary

Phase 13 adds two chart components to the existing PharmIQ web app (`apps/web`). No backend changes are required — all data comes from the already-built `useDeadStockSummary` and `useMatchRun` hooks. The primary library is Recharts 3.8.1, which ships with React 19 support in its peer dependency range and is the current latest version as of 2026-04-17 [VERIFIED: npm registry].

The most critical installation concern is the existing `react-is@16.13.1` in `apps/web/node_modules` — it was installed as a transitive dependency and does not match the `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0` peer dependency range that recharts 3.8.1 lists. npm's default behaviour resolves peer deps loosely, but version 16.13.1 satisfies `^16.8.0`, so no override is needed for npm [VERIFIED: npm view recharts@3.8.1 peerDependencies, local node_modules check]. However, TypeScript types for react-is@16 may cause issues — the plan should add `react-is@^19.0.0` as an explicit devDependency override if type errors appear.

The two chart components (`DeadStockChart.tsx` and `PostMatchChart.tsx`) are pure presentational components that receive data via props. State management and data fetching remain in the page components. Both charts must respect the established dark-mode CSS variable pattern and the hex-literal-only rule for SVG fills.

**Primary recommendation:** Install `recharts@3.8.1` in `apps/web` with a `react-is` override to `^19.0.0` in package.json `overrides` to prevent peer dep warnings and type mismatches. Build both chart components as separate files in `apps/web/src/components/`. Mount them on the respective pages by adding `useDeadStockSummary()` calls and wiring the `refetch()` trigger on UploadPage.

---

## Project Constraints (from CLAUDE.md)

- Stack: Cloudflare Pages (React/Vite) — no Python, no traditional server
- Auth: Clerk — already integrated, no changes in this phase
- Naming: React components PascalCase; event handlers `handleX` camelCase; state variables camelCase
- Code style: 4-space indentation; `async/await` for async; `try/catch/finally` for fetch calls
- Error handling: surfaces errors to user via state; `console.error` for developer logging
- GSD workflow: all file changes through a GSD command
- No emojis in code; no JSDoc; section dividers with `// ---` banners

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.1 | PieChart + BarChart rendering in React | Industry-standard React chart library; composable SVG-based API; full React 19 peer dep support; MIT license; 3.x is current major |

**Version verification:**
```bash
npm view recharts version  # returns 3.8.1
npm view recharts@3.8.1 version  # confirmed 3.8.1 exists
```
[VERIFIED: npm registry, 2026-04-17]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-is | ^19.0.0 (override) | Peer dependency for recharts; currently 16.13.1 in project | Add as explicit overrides entry in package.json to satisfy recharts peer dep and get correct types |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | chart.js + react-chartjs-2 | Canvas-based, not SVG; no `Cell` colouring per slice; harder to style in dark mode |
| recharts | visx / d3 | Much lower-level; requires custom layout logic; overkill for two standard chart types |
| recharts | nivo | Heavier bundle; adds full motion library dependency |

**Installation:**
```bash
# Run from apps/web directory
cd apps/web
npm install recharts@3.8.1
```

If peer dep warnings appear for react-is, add an override to `apps/web/package.json`:
```json
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```

Then `npm install` again to apply the override. [ASSUMED — npm overrides behaviour with recharts 3.x; test after install to confirm no errors]

---

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
├── components/
│   ├── DeadStockChart.tsx      # NEW — PieChart; data via props
│   ├── PostMatchChart.tsx      # NEW — grouped BarChart + KPI card; data via props
│   └── ... (existing)
├── pages/
│   ├── UploadPage.tsx          # MODIFIED — add useDeadStockSummary() + mount DeadStockChart
│   └── MatchPage.tsx           # MODIFIED — add useDeadStockSummary() + mount PostMatchChart
└── hooks/
    ├── useDeadStockSummary.ts  # EXISTING — source of truth for pie chart data
    └── useMatchRun.ts          # EXISTING — source of truth for bar chart data
```

### Pattern 1: Recharts PieChart with External Labels

**What:** Recharts `<PieChart>` wrapping a `<Pie>` with `<Cell>` children for per-slice colour and a `renderCustomizedLabel` function for external labels. Wrapped in a `div` with `min-h-[300px]` per the mandatory pitfall rule.

**When to use:** DeadStockChart — one slice per store, labelled with store name and unit count.

**Example:**
```typescript
// Source: recharts official docs — PieChart API
// https://recharts.org/en-US/api/PieChart

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Hex literals REQUIRED — CSS custom properties do not work in SVG fill
const CHART_COLOURS = ['#0F766E', '#D97706', '#14B8A6', '#B45309', '#0D5D5A'];

interface DeadStockChartProps {
  stores: Array<{ name: string; totalUnits: number }>;
}

export function DeadStockChart({ stores }: DeadStockChartProps) {
  const data = stores.filter(s => s.totalUnits > 0);

  // External label renderer — renders store name + unit count outside the slice
  const renderLabel = ({
    cx, cy, midAngle, outerRadius, name, value,
  }: {
    cx: number; cy: number; midAngle: number;
    outerRadius: number; name: string; value: number;
  }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x} y={y}
        fill="var(--color-text-secondary)"   // CSS var OK on SVG text (not fill of shapes)
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
      >
        {`${name}: ${value}`}
      </text>
    );
  };

  return (
    <div className="min-h-[300px]">   {/* MANDATORY per roadmap pitfall */}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="totalUnits"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={renderLabel}
            isAnimationActive={false}   /* MANDATORY per roadmap pitfall */
          >
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLOURS[index % CHART_COLOURS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [value, name]}
            contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Pattern 2: Recharts Grouped BarChart (before/after per store)

**What:** Recharts `<BarChart>` in grouped mode with two `<Bar>` entries — "Before" (amber) and "After" (teal). Data is derived client-side from `results` (useMatchRun) and `summary` (useDeadStockSummary). Layout is cartesian with `<XAxis>` (store name) and `<YAxis>` (units).

**When to use:** PostMatchChart — shown on MatchPage after `hasRun === true`.

**Example:**
```typescript
// Source: recharts official docs — BarChart grouped mode
// https://recharts.org/en-US/api/BarChart

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import type { MatchResult } from '../hooks/useMatchRun';
import type { StoreSummary } from '../hooks/useDeadStockSummary';

interface PostMatchChartProps {
  results: MatchResult[];
  summary: StoreSummary[];
}

export function PostMatchChart({ results, summary }: PostMatchChartProps) {
  // Aggregate per-source-store outgoing transfers (D-01, D-02)
  const outgoingByStore = new Map<string, number>();
  for (const r of results) {
    const prev = outgoingByStore.get(r.sourceStore) ?? 0;
    outgoingByStore.set(r.sourceStore, prev + r.bestMatch.qtyToTransfer);
  }

  // Build chart data — source stores only (D-01)
  const chartData = summary
    .filter(s => outgoingByStore.has(s.name))
    .map(s => ({
      store: s.name,
      before: s.totalUnits,
      after: Math.max(0, s.totalUnits - (outgoingByStore.get(s.name) ?? 0)),  // D-04 clamp
    }));

  return (
    <div className="min-h-[300px]">   {/* MANDATORY per roadmap pitfall */}
      <p className="text-[12px] text-[var(--color-text-muted)] mb-2">
        Projected if all transfers complete
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} barCategoryGap="20%" barGap={4}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border-light)"
          />
          <XAxis dataKey="store" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}
          />
          <Legend />
          <Bar dataKey="before" name="Before" fill="#D97706" isAnimationActive={false} />
          <Bar dataKey="after"  name="After"  fill="#0F766E" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Pattern 3: KPI Card (Net Units Recovered)

**What:** Simple presentational component showing a large metric value with a descriptive label. Placed above PostMatchChart.

**Example:**
```typescript
// KPI card — positioned above the PostMatchChart on MatchPage (D-05)
const netUnitsRecovered = results.reduce(
  (sum, r) => sum + r.bestMatch.qtyToTransfer, 0
);

// Renders as a card:
<div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4 mb-6">
  <p className="text-[12px] text-[var(--color-text-muted)] mb-1">Net Units Recovered</p>
  <p className="text-3xl font-semibold text-[var(--color-teal)]"
     style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
    {Math.round(netUnitsRecovered).toLocaleString()}
  </p>
</div>
```

### Pattern 4: UploadPage Integration (refetch after upload)

**What:** `UploadPage` currently calls `refresh` (from `useStores`) as its `onUploadComplete` callback. After this phase, it also needs to call `summaryRefetch()` (from `useDeadStockSummary`) after a successful dead stock upload so the pie chart redraws.

The `onUploadComplete` callback in `UploadModal` currently only refreshes the store list. The chart refetch must be wired alongside `refresh`.

**Example:**
```typescript
// In UploadPage.tsx — add useDeadStockSummary
const { summary, loading: summaryLoading, refetch: summaryRefetch } = useDeadStockSummary();

// Combined callback — refresh store list AND pie chart data
function handleUploadComplete() {
  refresh();           // existing store card refresh
  summaryRefetch();    // new — redraws DeadStockChart
}

// Pass combined callback to UploadModal
<UploadModal
  isOpen={isModalOpen}
  onClose={handleCloseModal}
  store={selectedStore}
  onUploadComplete={handleUploadComplete}  // was: onUploadComplete={refresh}
/>

// Mount DeadStockChart below store grid — always visible (D-09)
<section className="mt-8">
  <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4"
      style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
    Dead Stock by Store
  </h2>
  {summaryLoading ? (
    <div className="min-h-[300px] flex items-center justify-center">
      <Loader2 className="animate-spin text-[var(--color-teal)]" size={24} />
    </div>
  ) : hasDeadStockData ? (
    <DeadStockChart stores={summary?.stores ?? []} />
  ) : (
    <div className="min-h-[300px] flex items-center justify-center rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)]">
      <p className="text-[13px] text-[var(--color-text-muted)]">
        Upload dead stock data to see distribution here.
      </p>
    </div>
  )}
</section>
```

### Anti-Patterns to Avoid

- **CSS custom properties in SVG fill:** `fill="var(--color-teal)"` on `<Cell>` or `<Bar>` silently renders as black/ignored in SVG. Always use hex literals: `#0F766E`, `#D97706`.
- **ResponsiveContainer without explicit parent height:** `<div className="w-full"><ResponsiveContainer height="100%">` renders 0×0. The parent div MUST have explicit `min-h-[300px]`.
- **isAnimationActive not set to false:** Recharts defaults to animated entry. Animations look jarring in a B2B dashboard and cause accessibility concerns. Set on every `<Pie>` and every `<Bar>`.
- **Deriving PostMatchChart data from stale summary:** Do not derive chart data from `summary` fetched before the match run — `MatchPage` calls `useDeadStockSummary()` on mount, which is correct since summary is pre-match data.
- **External label text using fill hex for SVG `<text>`:** SVG `<text>` elements CAN use CSS custom properties in the `fill` attribute as of modern browsers. Use `fill="var(--color-text-secondary)"` for readability in dark mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG pie chart rendering | Custom SVG arcs and path calculations | `recharts <PieChart>` | arc path math is complex; label positioning across quadrants is non-trivial |
| Grouped bar chart | Custom `<rect>` layout | `recharts <BarChart>` with grouped bars | bar gap/group gap calculations, axis tick formatting, legend are already solved |
| Chart tooltips | Custom mouse-position floating divs | `recharts <Tooltip>` | handles pointer events, positioning near viewport edges, and cleanup |
| Responsive SVG sizing | Custom ResizeObserver + viewBox recalculation | `recharts <ResponsiveContainer>` | ResizeObserver + debouncing for SVG viewBox is subtle to get right |

**Key insight:** Recharts handles all SVG layout, mouse interactions, and responsive resize. The only custom code in this phase is data aggregation (D-01 through D-05) and the label renderer for the pie chart.

---

## Common Pitfalls

### Pitfall 1: Silent 0×0 Chart (ResponsiveContainer height)

**What goes wrong:** Chart renders as an invisible 0×0 SVG element. No console error.

**Why it happens:** `ResponsiveContainer` reads the parent element's computed height. If the parent has `height: auto` (the default block element behaviour) and no content, the computed height is 0. `ResponsiveContainer height="100%"` multiplies 100% × 0 = 0.

**How to avoid:** Wrap every `<ResponsiveContainer>` in a `<div className="min-h-[300px]">`. The `min-h` provides a floor so the container always has a non-zero height. [VERIFIED: roadmap pitfall + recharts GitHub issues]

**Warning signs:** Chart section exists in DOM but no SVG paths visible; devtools show SVG with `width="0" height="0"`.

### Pitfall 2: CSS Variables Not Working in SVG Fill

**What goes wrong:** `fill="var(--color-teal)"` on `<Cell>` or `<Bar>` renders as black (SVG default) or is ignored entirely.

**Why it happens:** Recharts `<Cell>` and `<Bar>` render their `fill` prop as an SVG attribute, not a CSS property. SVG attributes (not CSS properties) do not resolve CSS custom properties in all environments — particularly Chromium builds before ~v90 and some SVG rendering paths.

**How to avoid:** Always use hex literals: `#0F766E` for teal, `#D97706` for amber. Reserve CSS variables for non-SVG elements (tooltips, containers, text using CSS `color` property). [VERIFIED: roadmap pitfall + CONTEXT.md established patterns]

**Warning signs:** Slices/bars appear dark grey or black despite correct colour tokens.

### Pitfall 3: react-is Peer Dependency Conflict

**What goes wrong:** npm install warns `react-is@16.13.1` does not satisfy `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0` — which it actually does satisfy (16.13.1 satisfies ^16.8.0). More critically, TypeScript may fail if `@types/react-is@16` types conflict with React 19.

**Why it happens:** `react-is@16.13.1` was installed by an older transitive dependency. Recharts 3.x lists it as a peer dep, and npm resolves it to the existing v16. The peer dep range says `^16.8.0` — 16.13.1 satisfies this.

**How to avoid:** After installing recharts, run `npm ls react-is` to confirm the resolved version. If TypeScript errors appear relating to react-is types, add an override in `apps/web/package.json`:
```json
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```
Then `npm install` again. [VERIFIED: npm view recharts@3.8.1 peerDependencies; npm view react-is version; local node_modules react-is@16.13.1 confirmed]

**Warning signs:** TypeScript errors on recharts imports; tsc build fails with react-is type incompatibilities.

### Pitfall 4: PostMatchChart Showing Stale Pre-Match Summary

**What goes wrong:** PostMatchChart shows "After" bars calculated against summary data fetched on MatchPage mount — but the user re-uploaded dead stock since then. The before values are stale.

**Why it happens:** `useDeadStockSummary()` on MatchPage fetches on mount and does not refetch after a match run. If the user uploaded fresh dead stock after opening the page, the summary is stale.

**How to avoid:** Per D-14 from Phase 12 context, MatchPage calls `useDeadStockSummary()` on mount only — this is correct behaviour because summary is **pre-match** data (the stock that exists before transfers). The plan should not add a refetch trigger on match completion. [VERIFIED: useDeadStockSummary.ts implementation — `useEffect(() => { refetch(); }, [refetch])` runs only once on mount]

### Pitfall 5: Animations in B2B Dashboard Context

**What goes wrong:** Chart renders with Recharts' default SVG animation (slices/bars animate in over ~400ms). Looks consumer-app, not B2B operations tool.

**Why it happens:** Recharts defaults `isAnimationActive` to `true` on all chart components.

**How to avoid:** Set `isAnimationActive={false}` on every `<Pie>` and every `<Bar>` component. [VERIFIED: roadmap pitfall]

### Pitfall 6: External Pie Label Clipped by SVG ViewBox

**What goes wrong:** External labels on pie slices nearest to the edge of the chart area are clipped by the SVG viewBox.

**Why it happens:** The `renderCustomizedLabel` renders `<text>` elements relative to `cx`/`cy` + `outerRadius`. If `outerRadius` is large relative to the chart height, labels for top/bottom slices exceed the SVG bounds.

**How to avoid:** Set `outerRadius` conservatively (100–110px for a 300px height chart). Add `overflow: "visible"` to the SVG if labels clip — Recharts exposes `<PieChart style={{ overflow: "visible" }}>`. Alternatively, reduce `outerRadius` or increase chart height.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Import recharts components (ES module import)
```typescript
// Source: recharts 3.8.1 es6/index.js entry point
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
```

### useDeadStockSummary data shape (confirmed from source file)
```typescript
// Source: apps/web/src/hooks/useDeadStockSummary.ts (read directly)
const { summary, loading, error, refetch } = useDeadStockSummary();
// summary: { stores: Array<{ name: string; totalUnits: number; totalValue: number; hasCostData: boolean }> } | null
// loading: boolean
// error: string | null
// refetch: () => Promise<void>
```

### useMatchRun data shape (confirmed from source file)
```typescript
// Source: apps/web/src/hooks/useMatchRun.ts (read directly)
const { results, hasRun, loading } = useMatchRun();
// results: Array<{
//   sku: string; description: string; soh: number; cost: number;
//   sourceStore: string;
//   bestMatch: { store: string; qtyToTransfer: number; rou: number; ... };
//   allMatches: DestinationMatch[];
// }>
// hasRun: boolean
```

### Dark mode CSS variable pattern (confirmed from index.css)
```css
/* Chart tooltips and non-SVG containers can use CSS variables */
/* Source: apps/web/src/index.css (read directly) */
--color-surface:       #FFFFFF;   /* light */
--color-surface:       #0F172A;   /* dark (on :root.dark) */
--color-text-primary:  #0F172A;   /* light */
--color-text-primary:  #F8FAFC;   /* dark */
--color-teal:          #0F766E;   /* brand teal — same in both modes */
--color-amber:         #D97706;   /* brand amber — same in both modes */
```

### Dark mode toggle mechanism (confirmed from AppShell.tsx)
```typescript
// Source: apps/web/src/components/AppShell.tsx (read directly)
// Dark mode applies the `.dark` class to document.documentElement
// CSS custom variant: @custom-variant dark (&:where(.dark, .dark *))
// Charts must use CSS vars for container styling; hex literals for SVG fills
```

### PharmIQ brand colour hex literals for charts
```typescript
// Source: apps/web/src/index.css + CONTEXT.md established patterns [VERIFIED]
const CHART_COLOURS = {
  teal:        '#0F766E',   // primary brand — AfterBar, PieSlice[0]
  amber:       '#D97706',   // accent brand — BeforeBar, PieSlice[1]
  tealLight:   '#14B8A6',   // extended palette for 3rd store
  amberDark:   '#B45309',   // extended palette for 4th store
  tealDark:    '#0D5D5A',   // extended palette for 5th store
};
// For N > 5 stores, cycle through CHART_COLOURS values via index % length
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| recharts 2.x (React 16–18 era) | recharts 3.x | 3.0 released 2024 | Rewrote internals with Redux Toolkit + Redux state; tree-shakeable ES6 output; requires react-is peer dep |
| recharts with `legendType="line"` legend | recharts `<Legend>` composable | 3.x | Legend is now a separate composable component, not embedded in chart props |
| `fill` accepting CSS vars in some recharts versions | hex literals required | All versions | SVG attribute `fill` has never reliably resolved CSS custom properties across all browsers |

**Deprecated/outdated:**
- recharts 2.x: last 2.x release was 2.x.x; recharts 3 is current major. Do not install `recharts@2`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | npm `overrides` for react-is to `^19.0.0` resolves any type conflict; no additional peer dep error | Standard Stack | Low risk — react-is@16.13.1 satisfies recharts peer dep range; override only needed if TS types fail |
| A2 | `fill="var(--color-text-secondary)"` works on SVG `<text>` elements in Recharts custom labels in Chromium/WebKit 2025+ | Code Examples | Low — modern browsers resolve CSS vars in SVG; if wrong, replace with static `#475569` / `#CBD5E1` |

---

## Open Questions

1. **react-is override necessity**
   - What we know: `react-is@16.13.1` is installed; recharts peer dep range includes `^16.8.0` which satisfies 16.x; npm latest react-is is 19.2.5
   - What's unclear: Whether TypeScript fails to compile recharts imports with react-is@16 types in the project context
   - Recommendation: Attempt install without override first; add override only if `tsc --noEmit` fails with react-is type errors

2. **External pie label truncation threshold**
   - What we know: Store names in this app are typically short Australian suburb names (e.g., "Balwyn", "Carnegie")
   - What's unclear: Longest possible store name a customer might use
   - Recommendation: Truncate at 20 characters with ellipsis in the `renderCustomizedLabel` implementation (Claude's discretion per CONTEXT.md)

3. **PostMatchChart when useDeadStockSummary is still loading**
   - What we know: MatchPage calls `useDeadStockSummary()` on mount; if the user navigates directly to MatchPage and runs a match within 1–2 seconds, summary may still be loading
   - What's unclear: Whether this race condition is observable in practice
   - Recommendation: Show `<Loader2>` spinner in the PostMatchChart area if `summaryLoading` is true when `hasRun` becomes true (Claude's discretion per CONTEXT.md)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install recharts | Yes | v22.20.0 | — |
| npm | Package install | Yes | 11.7.0 | — |
| recharts@3.8.1 | DeadStockChart + PostMatchChart | Not yet installed | — | No fallback — install in Wave 0 |
| react-is (override) | recharts peer dep type compatibility | 16.13.1 installed | 16.13.1 (may need upgrade to ^19) | No override needed if TS compiles OK |

**Missing dependencies with no fallback:**
- `recharts@3.8.1` — must be installed in `apps/web` as the first task of 13-01-PLAN.md

**Missing dependencies with fallback:**
- `react-is` override — only needed if TypeScript compilation fails; not pre-emptively required

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 (worker only — no web app test config detected) |
| Config file | `apps/worker/vitest.config.ts` (worker); none detected in `apps/web` |
| Quick run command | `cd apps/worker && npm test` (worker tests only) |
| Full suite command | `cd apps/worker && npm test` |

**Note:** There is no vitest or jest configuration in `apps/web`. The web app has no test infrastructure. The worker has comprehensive vitest tests. Phase 13 builds pure presentational components with no business logic — the aggregation logic (D-01 through D-05) is the only testable unit.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIZ-01 | Pie chart renders with correct data | Visual / manual | Manual UAT — UploadPage after dead stock upload | N/A |
| VIZ-02 | Grouped bar chart renders before/after per source store | Visual / manual | Manual UAT — MatchPage after match run | N/A |
| VIZ-03 | KPI card shows correct net units recovered | Unit (aggregation logic) | Could unit-test the aggregation function; no automated runner in web app | ❌ Wave 0 gap |

**Aggregation logic note:** The D-01 through D-04 aggregation (computing before/after per source store) is pure TypeScript logic with no React dependency. If the planner chooses to extract it to a standalone function (e.g., `buildPostMatchChartData.ts`), it can be tested with a simple vitest unit test in the worker's test suite or by adding vitest to `apps/web`.

### Sampling Rate
- **Per task commit:** Manual visual check — open UploadPage/MatchPage in browser
- **Per wave merge:** Manual UAT against all 5 UAT scenarios from ROADMAP.md
- **Phase gate:** All 5 UAT scenarios green before `/gsd-verify-work`

### Wave 0 Gaps
- `apps/web` has no vitest configuration — if automated unit tests are desired for the aggregation function, a vitest setup would be needed. **This is optional** given the low complexity of the aggregation and the absence of existing web tests.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth changes in this phase |
| V3 Session Management | No | No session changes in this phase |
| V4 Access Control | No | Charts rendered within Clerk-protected routes already in place |
| V5 Input Validation | Yes (minor) | `totalUnits` from API is a number; clamp with `Math.max(0, ...)` per D-04 already handles negative values |
| V6 Cryptography | No | No crypto in this phase |

**Threat patterns:** None specific to charting. Data flows through existing authenticated routes (Clerk JWT). The chart components are purely presentational — they receive already-fetched, already-validated data from hooks.

---

## Sources

### Primary (HIGH confidence)
- npm registry — `npm view recharts@3.8.1 version|peerDependencies|dependencies` [VERIFIED: 2026-04-17]
- `apps/web/src/hooks/useDeadStockSummary.ts` — StoreSummary interface, refetch pattern [VERIFIED: file read]
- `apps/web/src/hooks/useMatchRun.ts` — MatchResult interface, hasRun boolean [VERIFIED: file read]
- `apps/web/src/index.css` — CSS custom property tokens, dark mode class pattern [VERIFIED: file read]
- `apps/web/src/components/AppShell.tsx` — dark mode toggle mechanism [VERIFIED: file read]
- `apps/web/src/pages/UploadPage.tsx` — current onUploadComplete wiring, store card grid structure [VERIFIED: file read]
- `apps/web/src/pages/MatchPage.tsx` — hasRun gate pattern, results structure [VERIFIED: file read]
- `apps/web/package.json` — React 19, no recharts installed [VERIFIED: file read]
- `apps/web/node_modules/react-is/package.json` — react-is 16.13.1 currently installed [VERIFIED: filesystem check]
- `.planning/phases/13-charts/13-CONTEXT.md` — locked decisions D-01 through D-12 [VERIFIED: file read]
- `.planning/ROADMAP.md` §Phase 13 Pitfalls — min-h-[300px], isAnimationActive, hex literals [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- recharts GitHub issues (general knowledge) — SVG fill CSS custom property limitation is documented in multiple recharts issues; cross-verified with CONTEXT.md established pattern

### Tertiary (LOW confidence)
- SVG `<text> fill` CSS variable resolution in modern browsers — generally true in Chromium/WebKit 2024+, but not formally verified against the app's target browsers [ASSUMED A2]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry confirms recharts 3.8.1 is the current release; peer deps verified
- Architecture: HIGH — patterns derived from reading actual source files (hooks, pages, AppShell, CSS)
- Pitfalls: HIGH — roadmap pitfalls read directly; react-is version confirmed from filesystem

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (recharts releases; check for 3.x patch if > 30 days)
