# Phase 14: Cost Report UI - Research

**Researched:** 2026-04-18
**Domain:** React / TypeScript UI component (CostReport.tsx) + Cloudflare Worker route patch (match.ts)
**Confidence:** HIGH

## Summary

Phase 14 is a pure UI build on top of an already-complete data layer. The `dead_stock` table has `cost_ex DOUBLE PRECISION` (schema.sql line 47) and the summary endpoint already aggregates it into `totalValue` and `hasCostData` per store via `useDeadStockSummary`. The only backend work is a 2-line SQL extension to the match route so that `cost_ex` is SELECT-ed and plumbed through to `MatchResult.cost` instead of the hardcoded `cost: 0`.

On the frontend the plan is a single new component `CostReport.tsx` receiving `stores: StoreSummary[]` and `results: MatchResult[]` and `hasRun: boolean` as props, mounted always-visible below `<PostMatchChart />` in `MatchPage.tsx`. The component has three visual zones: (1) a recoverable value KPI card (post-match only, cost > 0), (2) per-store dead stock dollar cards (matching the PostMatchChart KPI card shell pattern), and (3) an SOH input + progress bar for the percentage benchmark. No new routes, no schema changes, no new hooks.

The primary UI challenge is the progress bar with threshold markers — implemented with inline CSS positioning (no external library needed) using the same `var(--color-*)` CSS variable system and hex literals already established in PostMatchChart and DeadStockChart.

**Primary recommendation:** Build `CostReport.tsx` as a single self-contained component; pass `summary.stores`, `results`, and `hasRun` as props from MatchPage; handle all state (SOH input) locally inside the component. Fix `match.ts` as part of the same plan.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Panel Visibility & Placement**
- D-01: CostReport panel is always visible below PostMatchChart on MatchPage — renders regardless of whether a match has been run.
- D-02: When no cost data is present (`stores.every(s => !s.hasCostData)`), the panel renders with a section heading and the instructional message: "Re-upload dead stock using FRED Stock Valuation report format to see dollar values." Do NOT render zeros or an error state.

**Per-Store Breakdown Format**
- D-03: Per-store dead stock values displayed as a horizontal row of metric cards (same visual pattern as PostMatchChart KPI cards).
- D-04: Each card shows store name + dead stock dollar value only (e.g. "$1,240"). No unit count, no per-store percentage.

**SOH Input & Percentage Display**
- D-05: Total SOH $ input positioned below store cards, above the percentage summary. Labelled numeric input. Client-side only — never persisted. Calculation updates immediately on input.
- D-06: Percentage indicator uses a horizontal progress bar with threshold markers — vertical marker lines at 10% (amber) and 25% (red). Bar fill colour: teal below 10%, amber 10–25%, red above 25%.
- D-07: When SOH input is empty or 0, percentage bar is hidden, placeholder shown ("Enter total SOH value above"). Never display `Infinity%` or `NaN%`.

**Recoverable Value KPI**
- D-08: Recoverable value KPI lives inside CostReport, shown at the top of the panel when `hasRun === true` AND cost data is present (at least one store with `hasCostData === true`).
- D-09: Recoverable value = `sum(qtyToTransfer × cost)` across all MatchResult entries where `cost > 0`. Uses `MatchResult.cost` (per-unit cost from the dead stock upload).
- D-10: Match route Worker fix is in scope for this phase: update `apps/worker/src/routes/match.ts` to SELECT `ds.cost_ex` from the dead_stock table and pass it as `cost` in the DeadStockItem array (replacing the current hardcoded `cost: 0`). This is a 2-line change.

**Edge Cases**
- D-11: When `cost_ex` is null for some SKUs, those SKUs contribute 0 to the recoverable total (via `?? 0`). No error or warning needed.
- D-12: The Recoverable $ KPI is suppressed (not shown as $0) when all matched SKUs have `cost === 0`. Only render the KPI when the calculated value is > 0.

### Claude's Discretion
- Exact card layout dimensions and spacing (consistent with existing StoreCard/PostMatchChart style)
- Progress bar implementation details (CSS or inline style for the fill)
- Dollar formatting locale (AUD format: `$1,240.00` — two decimal places, comma thousands separator)
- Loading state while `summaryLoading` is true
- Section heading text (e.g. "Cost Report" or "Dead Stock Value")

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COST-03 | User can enter a single org-level total SOH $ value; app displays dead stock as a % of total SOH with amber (10–25%) / red (>25%) benchmark indicator | D-05, D-06, D-07 — SOH input + progress bar with threshold markers; client-side only |
| COST-05 | When cost data is present after a match run, app shows a "Recoverable value" KPI: dollar value of dead stock matched for transfer | D-08, D-09, D-12 — KPI card gated on hasRun && hasCostData && recoverableValue > 0 |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.0.0 | Component framework | Already in use across entire web app |
| TypeScript | 5.6.0 | Type safety | Project-wide; strict mode |
| Tailwind CSS | 4.0.0 | Utility styling | Established; Vite plugin already configured |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.462.0 | Icons | Already imported in MatchPage; use for any icon needs in CostReport |
| useState | built-in | SOH input local state | Client-side only, no persistence needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline CSS progress bar | Recharts `BarChart` | Inline CSS is simpler for a single-bar with positional markers; no chart overhead |
| `toLocaleString('en-AU', ...)` | Custom formatter | Both work; toLocaleString is zero-dependency |

**No new npm packages required.** [VERIFIED: codebase inspection]

## Architecture Patterns

### Component File Location
```
apps/web/src/
├── components/
│   └── CostReport.tsx       ← NEW: self-contained cost panel
└── pages/
    └── MatchPage.tsx        ← EDIT: import + mount CostReport, pass props
```

### Worker Route Patch Location
```
apps/worker/src/routes/
└── match.ts                 ← EDIT: 2-line SQL + mapping change
```

### Pattern 1: Always-Visible Panel with Conditional Content
**What:** The component renders unconditionally (D-01). Content gates: no cost data → instructional message; has cost data → show cards + SOH input. Recoverable KPI additionally gates on `hasRun`.
**When to use:** Mirrors the UploadPage chart section pattern — the container is always present to hold layout space, internal content is conditional.
**Example:**
```typescript
// Source: apps/web/src/pages/MatchPage.tsx lines 578-597 (PostMatchChart pattern)
// CostReport follows the same always-present section shell:
<section className="mt-8">
  <h2 className="text-base font-semibold ..." style={{ fontFamily: "'Space Grotesk'..." }}>
    Dead Stock Value
  </h2>
  <CostReport
    stores={summary?.stores ?? []}
    results={results}
    hasRun={hasRun}
    summaryLoading={summaryLoading}
  />
</section>
```
[VERIFIED: codebase inspection of MatchPage.tsx]

### Pattern 2: KPI Card Shell (from PostMatchChart)
**What:** Each per-store card uses `rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4` with a muted label line and a bold value.
**When to use:** All dollar-value metric cards in CostReport.
**Example:**
```typescript
// Source: apps/web/src/components/PostMatchChart.tsx lines 55-70
<div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4">
  <p className="text-[12px] text-[var(--color-text-muted)] mb-1 leading-snug">
    {name}<br />Dead Stock Value
  </p>
  <p
    className="text-2xl font-semibold text-[#0F766E]"
    style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
  >
    {formatAUD(store.totalValue)}
  </p>
</div>
```
[VERIFIED: codebase inspection of PostMatchChart.tsx]

### Pattern 3: Inline-CSS Progress Bar with Threshold Markers
**What:** A relative-positioned bar container with a fill div (width = percentage, clamped 0–100), plus two absolutely-positioned hairline dividers at 10% and 25% within the container.
**When to use:** The SOH percentage indicator (D-06). No chart library needed.
**Example:**
```typescript
// Source: [ASSUMED] — CSS pattern; consistent with existing inline-style usage in MatchPage
const pct = Math.min(100, (totalDeadStockValue / sohValue) * 100);
const barColor = pct > 25 ? '#DC2626' : pct >= 10 ? '#D97706' : '#0F766E';

<div style={{ position: 'relative', height: 12, background: 'var(--color-surface-gray)', borderRadius: 6, overflow: 'visible' }}>
  {/* Fill */}
  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 6, transition: 'width 0.2s, background 0.2s' }} />
  {/* Amber threshold marker at 10% */}
  <div style={{ position: 'absolute', top: -4, left: '10%', width: 2, height: 20, background: '#D97706', borderRadius: 1 }} />
  {/* Red threshold marker at 25% */}
  <div style={{ position: 'absolute', top: -4, left: '25%', width: 2, height: 20, background: '#DC2626', borderRadius: 1 }} />
</div>
```

### Pattern 4: Worker SQL Extension (match.ts cost_ex fix)
**What:** Add `ds.cost_ex` to the dead_stock SELECT, then map `row.cost_ex ?? 0` instead of hardcoded `0` in the DeadStockItem push.
**Current state (match.ts lines 94–99 and 140):**
```typescript
// CURRENT — SELECT has no cost_ex:
(tx) => tx`
  SELECT ds.sku, ds.description, ds.soh, s.name AS store_name
  FROM dead_stock ds
  ...

// CURRENT — hardcoded cost: 0 at line 140:
items.push({ sku: row.sku, soh: row.soh, description: row.description, cost: 0 });
```
**Fixed state (D-10):**
```typescript
// FIXED — add ds.cost_ex to SELECT:
(tx) => tx`
  SELECT ds.sku, ds.description, ds.soh, ds.cost_ex, s.name AS store_name
  FROM dead_stock ds
  ...

// FIXED — nullish coalesce (D-11):
items.push({ sku: row.sku, soh: row.soh, description: row.description, cost: row.cost_ex ?? 0 });
```
[VERIFIED: codebase inspection of match.ts lines 84-141, schema.sql line 47]

### Pattern 5: Dollar Formatting (AUD)
**What:** `toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })` — produces `$1,240.00`.
**When to use:** Every dollar value display in CostReport (per-store totalValue, recoverable KPI).
```typescript
// Source: [ASSUMED] — standard JS Intl API; consistent with .toLocaleString() used in PostMatchChart.tsx line 67
function formatAUD(value: number): string {
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
```

### Anti-Patterns to Avoid
- **Floating percentage before SOH validation:** Never compute `deadStockValue / sohInput` without confirming `sohInput > 0` first — division by zero yields `Infinity`, NaN propagates through further operations. Gate the entire percentage zone on `sohInput > 0`. [VERIFIED: D-07 explicit requirement]
- **Aggregating partial cost data silently:** When only some stores have `hasCostData === true`, the org-level `totalDeadStockValue` is a partial sum. Surface a coverage note: "X of Y stores have cost data" — never present a partial sum as if it were the org total. [VERIFIED: CONTEXT.md Pitfalls section]
- **Showing KPI as $0:** When `recoverableValue === 0` (all matched SKUs have `cost === 0`), hide the KPI entirely per D-12. Rendering "$0.00" misleads the pharmacist into thinking a match run produced zero value when the cause is simply missing cost data.
- **Pre-match and post-match figures without labels:** The panel shows pre-match dead stock value as always-visible context AND post-match recoverable value when `hasRun === true`. Both must have unambiguous labels so a pharmacist cannot mistake the current dead stock figure for the projected post-transfer figure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dollar formatting | Custom string builder | `Intl.NumberFormat` / `.toLocaleString()` | Handles locale-specific separators, rounding, currency symbol |
| Threshold color logic | Complex CSS class table | Inline conditional (3-branch ternary) | Only 3 states (teal/amber/red); simple enough for inline; avoid over-engineering |
| Progress bar | Recharts BarChart | Inline CSS div | Single-metric bar with markers is simpler without a chart library |

**Key insight:** This phase is display logic only — no external library is needed beyond what is already installed.

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield UI component phase, not a rename/refactor/migration.

## Common Pitfalls

### Pitfall 1: Division by Zero / NaN in Percentage
**What goes wrong:** SOH input is empty string (`""`) or `"0"` → `parseFloat("") === NaN`, `parseFloat("0") === 0` → division produces `NaN` or `Infinity` displayed in the UI.
**Why it happens:** `<input type="number">` returns a string; empty field returns `""` not `0`.
**How to avoid:** Parse input with `parseFloat`, then gate the percentage zone on `isFinite(sohValue) && sohValue > 0`. Store `sohInput` as a string in state; derive `sohValue = parseFloat(sohInput)` inside render.
**Warning signs:** `Infinity%` or `NaN%` appearing in the percentage display.

### Pitfall 2: Partial Cost Coverage Presented as Org Total
**What goes wrong:** Three of four stores have `hasCostData === true`; one store uploaded without a Cost Ex column. The `totalDeadStockValue` sum omits one store's contribution entirely, but the UI shows it as if it were the full org figure.
**Why it happens:** `summaryRoute` correctly returns `hasCostData: false` for that store, but the frontend might naively sum all `totalValue` fields without counting coverage.
**How to avoid:** Compute `costStoreCount = stores.filter(s => s.hasCostData).length` and `totalStoreCount = stores.length`. If `costStoreCount < totalStoreCount`, render a coverage note above the totals: `"{costStoreCount} of {totalStoreCount} stores have cost data"`.

### Pitfall 3: match.ts TypeScript Type Mismatch After SQL Extension
**What goes wrong:** Adding `cost_ex` to the SELECT requires updating the inline type annotation of `deadStockRows` in `match.ts` — if the type is not updated, TypeScript will error on `row.cost_ex`.
**Why it happens:** The `withOrgContext<Array<{...}>>` type parameter is declared inline at line 84 — it must include `cost_ex: number | null`.
**How to avoid:** Update the inline generic type to add `cost_ex: number | null` when adding `ds.cost_ex` to the SELECT. [VERIFIED: match.ts lines 84-100]

### Pitfall 4: Recoverable Value Includes Transfers with qty = 0
**What goes wrong:** If a MatchResult has `qtyToTransfer = 0` for some reason and `cost > 0`, the multiplication produces `0 × cost = 0` — harmless, but the KPI may still render if cost > 0 check is done on the MatchResult level rather than the product.
**Why it happens:** The KPI condition per D-12 is "recoverableValue > 0", so this is naturally guarded if the sum is computed correctly — `sum(qtyToTransfer × cost)` where both factors must be > 0 to contribute.
**How to avoid:** Sum `result.bestMatch.qtyToTransfer * result.cost` for entries where `result.cost > 0`; gate KPI display on `recoverableValue > 0`.

### Pitfall 5: match.ts Test Suite Needs Updated Mock for cost_ex
**What goes wrong:** `apps/worker/src/__tests__/match.test.ts` mocks `withOrgContext` for dead stock rows. After adding `cost_ex` to the SELECT, any test that pushes mock dead stock rows without `cost_ex` will still compile (TypeScript uses the type annotation, not the actual row shape in mocks), but tests that assert on `result.cost` will get `undefined ?? 0 = 0` rather than a real cost value.
**Why it happens:** Mock sequences must be updated whenever the route handler adds or reorders `withOrgContext` calls (documented in STATE.md accumulated context). The dead stock mock sequence is the first `withOrgContext` call.
**How to avoid:** Add `cost_ex: someValue` to dead stock mock rows in match.test.ts when testing the cost_ex plumbing.

### Pitfall 6: summaryLoading Race on MatchPage Mount
**What goes wrong:** CostReport receives `stores={summary?.stores ?? []}` from MatchPage. On first render, `summary` is `null` (loading), so `stores` is `[]`. CostReport renders the instructional "no cost data" message even for orgs that do have cost data.
**Why it happens:** `useDeadStockSummary` starts with `loading: true` and `summary: null`.
**How to avoid:** Pass `summaryLoading` as a prop to CostReport and show a loading skeleton (e.g. Loader2 spinner) instead of the instructional message while loading. MatchPage already uses this pattern for PostMatchChart (lines 586-595). [VERIFIED: MatchPage.tsx lines 586-595]

## Code Examples

### CostReport Props Interface
```typescript
// Source: [ASSUMED] — derived from CONTEXT.md canonical refs and hook interfaces
import type { StoreSummary } from '../hooks/useDeadStockSummary';
import type { MatchResult } from '../hooks/useMatchRun';

interface CostReportProps {
  stores: StoreSummary[];       // from summary?.stores ?? []
  results: MatchResult[];       // from useMatchRun
  hasRun: boolean;              // from useMatchRun
  summaryLoading: boolean;      // from useDeadStockSummary — show spinner during load
}
```

### Recoverable Value Calculation
```typescript
// Source: CONTEXT.md D-09
// Computed inside CostReport from props (no hook needed):
const recoverableValue = results
  .filter(r => r.cost > 0)
  .reduce((sum, r) => sum + r.bestMatch.qtyToTransfer * r.cost, 0);

// Gate: only show KPI when positive (D-12)
const showRecoverable = hasRun && recoverableValue > 0;
```
[VERIFIED: MatchResult.cost field confirmed in useMatchRun.ts line 20; qtyToTransfer in DestinationMatch.qtyToTransfer line 13]

### No-Cost-Data Guard
```typescript
// Source: CONTEXT.md D-02
const hasCostData = stores.some(s => s.hasCostData);

if (!hasCostData) {
  return (
    <p className="text-[13px] text-[var(--color-text-muted)]">
      Re-upload dead stock using FRED Stock Valuation report format to see dollar values.
    </p>
  );
}
```

### Coverage Note (Partial Cost Data)
```typescript
// Source: CONTEXT.md Pitfalls + Phase design
const costStoreCount = stores.filter(s => s.hasCostData).length;
const totalStoreCount = stores.length;
const hasPartialCoverage = costStoreCount > 0 && costStoreCount < totalStoreCount;

// Render above the per-store cards:
{hasPartialCoverage && (
  <p className="text-[12px] text-[var(--color-text-muted)] mb-3">
    {costStoreCount} of {totalStoreCount} stores have cost data
  </p>
)}
```

### SOH Input State Pattern
```typescript
// Source: [ASSUMED] — consistent with MatchPage monthsCoverTarget input pattern (line 273-283)
const [sohInput, setSohInput] = useState('');
const sohValue = parseFloat(sohInput);
const sohValid = isFinite(sohValue) && sohValue > 0;
const totalDeadStockValue = stores.reduce((s, st) => s + st.totalValue, 0);
const pct = sohValid ? Math.min(100, (totalDeadStockValue / sohValue) * 100) : null;
```

### MatchPage Mount Point
```typescript
// Source: apps/web/src/pages/MatchPage.tsx — add after line 597 (PostMatchChart section closes)
// CostReport is always-visible (D-01) — no hasRun gate on the section itself:
<section className="mt-8">
  <h2
    className="text-base font-semibold text-[var(--color-text-primary)] mb-4"
    style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
  >
    Dead Stock Value
  </h2>
  {summaryLoading ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="animate-spin text-[var(--color-teal)]" size={24} aria-label="Loading cost data" />
    </div>
  ) : (
    <CostReport
      stores={summary?.stores ?? []}
      results={results}
      hasRun={hasRun}
      summaryLoading={false}
    />
  )}
</section>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cost: 0` hardcoded in match.ts | `cost: row.cost_ex ?? 0` from DB | Phase 14 (this phase) | Enables recoverable value KPI |
| No cost panel on MatchPage | CostReport panel below PostMatchChart | Phase 14 (this phase) | Delivers COST-03 and COST-05 |

**Deprecated/outdated:**
- The comment at match.ts line 139 (`// cost is 0 — dead_stock table has no cost column`) will be incorrect after the fix — remove it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })` produces `$1,240.00` format in Cloudflare Workers / browser environments | Standard Stack — Dollar Formatting | AUD formatting may vary by runtime locale; fallback: `'$' + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')` |
| A2 | Inline CSS progress bar (no library) is the right implementation for the threshold bar | Architecture Patterns — Pattern 3 | Low risk; the alternative is still a simple div structure |
| A3 | MatchPage wraps CostReport in a summaryLoading-gated spinner (same as PostMatchChart section) rather than passing summaryLoading as prop to CostReport | Code Examples — MatchPage Mount Point | If summaryLoading is passed as prop, component must handle its own loading state; either approach works |

**If this table is empty:** N/A — 3 assumed claims.

## Open Questions

1. **Section heading: "Cost Report" vs "Dead Stock Value"**
   - What we know: CONTEXT.md Claude's Discretion leaves this open
   - What's unclear: Whether to mirror the REQUIREMENTS.md language ("Dead Stock Value") or something more clinical ("Cost Report")
   - Recommendation: Use "Dead Stock Value" — matches the requirement description language and is more meaningful to a pharmacy manager than "Cost Report"

2. **summaryLoading pattern: prop vs parent-gated spinner**
   - What we know: MatchPage already pattern-matches on summaryLoading for PostMatchChart (lines 586-595)
   - What's unclear: Whether to replicate that outer spinner pattern (simpler MatchPage, simpler CostReport) or pass summaryLoading as a prop (self-contained CostReport)
   - Recommendation: Replicate the outer spinner pattern in MatchPage for consistency with PostMatchChart — keeps CostReport stateless with respect to loading.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — phase is purely React/TypeScript UI code and a 2-line Worker SQL patch; no new tools, services, or CLIs required beyond the existing Vite dev server and Vitest test runner).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with @cloudflare/vitest-pool-workers 0.13.5 |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npm test -- --reporter=verbose src/__tests__/match.test.ts` |
| Full suite command | `cd apps/worker && npm test` |

Note: The web app (`apps/web`) has no test framework configured — no Jest, no Vitest, no Testing Library detected. [VERIFIED: apps/web/package.json has no test script, no testing devDependencies]

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COST-05 (backend) | match route returns `cost > 0` in results when dead_stock has cost_ex data | unit (Worker) | `cd apps/worker && npm test -- src/__tests__/match.test.ts` | Yes — match.test.ts needs new test cases |
| D-10 (SQL fix) | match route SELECT includes cost_ex; DeadStockItem.cost = cost_ex ?? 0 | unit (Worker) | `cd apps/worker && npm test -- src/__tests__/match.test.ts` | Yes — new test case needed |
| COST-03 (UI) | SOH % calculation; amber/red/teal logic; division-by-zero guard | manual UAT | Browser inspection | No — no web test framework |
| COST-05 (UI) | Recoverable KPI appears/disappears based on hasRun + cost data | manual UAT | Browser inspection | No — no web test framework |

### Sampling Rate
- **Per task commit:** `cd apps/worker && npm test -- src/__tests__/match.test.ts` (fast; covers the only automated area)
- **Per wave merge:** `cd apps/worker && npm test` (full suite)
- **Phase gate:** Full Worker test suite green + manual UAT checklist complete before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New test cases in `apps/worker/src/__tests__/match.test.ts` — cover cost_ex plumbing: (a) dead stock row with cost_ex present → MatchResult.cost is non-zero; (b) dead stock row with cost_ex null → MatchResult.cost is 0 (nullish coalesce)
- Note: No test files to create for CostReport.tsx — no web test framework exists

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Clerk auth already in place; no new auth surface |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | RLS already enforces org isolation on dead_stock table |
| V5 Input Validation | yes | SOH input — validate positive number before division; never evaluate as expression |
| V6 Cryptography | no | No crypto involved |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side numeric input used in calculation | Tampering | Validate `isFinite(sohValue) && sohValue > 0` before using in percentage computation; the value is never sent to the server so there is no injection risk, only display-correctness risk |
| cost_ex from DB used in frontend display | Spoofing | RLS org_isolation policy on dead_stock table ensures cost_ex is always from the authenticated org's data; no additional control needed |

**Security note:** The SOH input is client-side only (D-05) and never sent to the Worker — it has no server-side security implications. The only security-relevant change is the SQL patch in match.ts, which reads a column that already exists in the org-isolated `dead_stock` table under existing RLS.

## Sources

### Primary (HIGH confidence)
- `apps/worker/src/routes/match.ts` — confirmed hardcoded `cost: 0` at line 140; confirmed dead_stock SELECT at lines 94-99
- `apps/worker/src/db/schema.sql` — confirmed `cost_ex DOUBLE PRECISION` at line 47 in dead_stock table
- `apps/web/src/hooks/useDeadStockSummary.ts` — confirmed `StoreSummary` interface with `totalValue`, `hasCostData`, `name`, `totalUnits`
- `apps/web/src/hooks/useMatchRun.ts` — confirmed `MatchResult.cost: number` at line 20; `hasRun: boolean`; `DestinationMatch.qtyToTransfer: number`
- `apps/web/src/pages/MatchPage.tsx` — confirmed `summary` already destructured at line 31; `PostMatchChart` mount point at lines 578-597; summaryLoading guard pattern
- `apps/web/src/components/PostMatchChart.tsx` — confirmed KPI card shell CSS pattern (lines 55-70); `var(--color-border-light)`, `var(--color-surface-gray)`, Space Grotesk font
- `apps/web/src/components/StoreCard.tsx` — confirmed card shell style using `var(--color-surface)`, `var(--color-border-light)`, `rounded-lg p-4`
- `apps/web/src/components/DeadStockChart.tsx` — confirmed `isAnimationActive={false}` pattern; hex literals for chart fills
- `apps/worker/src/routes/dead-stock-summary.ts` — confirmed `hasCostData` signal and response shape; `totalValue = SUM(cost_ex * soh)`
- `apps/worker/src/__tests__/dead-stock-summary.test.ts` — confirmed test patterns; mock withOrgContext usage
- `apps/worker/src/__tests__/match.test.ts` — confirmed mock sequence structure; mockMatchTransaction pattern
- `apps/worker/vitest.config.ts` — confirmed Vitest + cloudflarePool setup
- `apps/web/package.json` — confirmed no test framework in web app
- `.planning/phases/14-cost-report-ui/14-CONTEXT.md` — locked decisions D-01 through D-12

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — COST-03 and COST-05 acceptance criteria
- `.planning/STATE.md` — accumulated decisions including "Mock sequences must be updated whenever route handler adds or reorders withOrgContext calls"

### Tertiary (LOW confidence)
- A1: `toLocaleString('en-AU', { currency: 'AUD' })` output format — standard JS Intl but runtime behaviour assumed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json; no new installs needed
- Architecture: HIGH — all integration points verified in codebase; component structure follows verified patterns
- Pitfalls: HIGH — pitfalls 1–5 derived from direct codebase evidence; pitfall 6 verified against MatchPage summaryLoading pattern
- SQL fix: HIGH — exact lines identified in match.ts; schema column verified in schema.sql

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable stack — Tailwind 4, React 19, Vitest 4 are not fast-moving at this point)
