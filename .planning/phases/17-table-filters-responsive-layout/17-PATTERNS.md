# Phase 17: Table Filters + Responsive Layout - Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 1 (single-file modification — MatchPage.tsx)
**Analogs found:** 1 / 1 (the file being modified is its own best analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/src/pages/MatchPage.tsx` | page / component | request-response + client-side transform | Self (existing patterns within the file) | exact |

No new files are created in Phase 17. All work is additions and modifications to `apps/web/src/pages/MatchPage.tsx` (701 lines).

---

## Pattern Assignments

### `apps/web/src/pages/MatchPage.tsx` (page, client-side transform)

**Analog:** Self — all patterns extracted from the existing MatchPage.tsx. The file already contains every pattern that new code must copy.

---

### Pattern 1 — State Declaration

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 37–43

All new filter state is appended immediately after the existing `useState` block at the top of `MatchPage()`, consistent with the existing pattern:

```tsx
// --- State ---
const [monthsCoverTarget, setMonthsCoverTarget] = useState(3);
const [pdfLoading, setPdfLoading] = useState(false);
const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
const [warningsExpanded, setWarningsExpanded] = useState(false);
const [showUpgradeModal, setShowUpgradeModal] = useState(false);
```

**New state to add** (append after line 43, before the derived `isAtLimit` line 46):

```tsx
// --- Filter state (Phase 17) ---
const [rangedFilter, setRangedFilter] = useState<'all' | 'ranged' | 'non-ranged'>('all');
const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
const [storeFilter, setStoreFilter] = useState('');
const [minUnits, setMinUnits] = useState(0);
```

**Pattern rules:**
- One `useState` per state variable — no combined objects
- Types are explicit (union strings, `Set<string>`, `number`)
- Defaults match the "no filter active" state exactly

---

### Pattern 2 — `useCallback` Handler

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 138–143 (handleMonthsInput) and lines 122–132 (handleToggleStore)

The `handleMonthsInput` handler is the direct template for `handleMinUnitsChange`:

```tsx
const handleMonthsInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v) && v >= 1 && v <= 24) {
    setMonthsCoverTarget(v);
  }
}, []);
```

The `handleToggleStore` handler is the direct template for the `selectedDepts` toggle handler:

```tsx
const handleToggleStore = useCallback((name: string) => {
  setSelectedStores(prev => {
    const next = new Set(prev);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    return next;
  });
}, []);
```

**New handlers to add** (append in `// --- Handlers ---` section, after line 162):

```tsx
const handleClearFilters = useCallback(() => {
  setRangedFilter('all');
  setSelectedDepts(new Set());
  setDeptDropdownOpen(false);
  setStoreFilter('');
  setMinUnits(0);
}, []);

const handleMinUnitsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v) && v >= 0) setMinUnits(v);
  else if (e.target.value === '') setMinUnits(0);
}, []);

const handleDeptToggle = useCallback((dept: string) => {
  setSelectedDepts(prev => {
    const next = new Set(prev);
    next.has(dept) ? next.delete(dept) : next.add(dept);
    return next;
  });
}, []);
```

**Pattern rules:**
- All handlers wrapped in `useCallback`
- Dependency arrays are minimal (empty `[]` unless the handler closes over external state)
- Set mutations use the functional updater pattern (`prev => { const next = new Set(prev); ... return next; }`)

---

### Pattern 3 — `useMemo` for Derived Data

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 174–202

The existing `flatItems` memo is the template for `filteredResults` and the derived `uniqueDepartments` / `uniqueStores` memos:

```tsx
const flatItems = useMemo<Array<FlatItem & { top: number; height: number }>>(() => {
  const items: Array<FlatItem & { top: number; height: number }> = [];
  let offset = 0;

  for (const result of results) {
    const rowKey = `${result.sku}::${result.sourceStore}`;
    items.push({ type: 'result', data: result, top: offset, height: ROW_HEIGHT });
    offset += ROW_HEIGHT;

    if (expandedRows.has(rowKey)) {
      const extraMatches = result.allMatches.slice(1);
      for (const subMatch of extraMatches) {
        items.push({
          type: 'subMatch',
          data: subMatch,
          parentSku: result.sku,
          parentSourceStore: result.sourceStore,
          parentDescription: result.description,
          top: offset,
          height: SUB_ROW_HEIGHT,
        });
        offset += SUB_ROW_HEIGHT;
      }
    }
  }

  return items;
}, [results, expandedRows]);  // <-- dependency array pattern
```

**New memos to add** — insert in the `// --- Flat list for virtualization ---` section, BEFORE the existing `flatItems` memo (line 174). The `flatItems` memo must then read `filteredResults` instead of `results`:

```tsx
// --- Filter-derived data ---

const filteredResults = useMemo(() => {
  return results.filter(result => {
    if (rangedFilter === 'ranged' && !result.isRanged) return false;
    if (rangedFilter === 'non-ranged' && result.isRanged) return false;
    if (selectedDepts.size > 0 && !selectedDepts.has(result.department)) return false;
    if (storeFilter !== '' && result.sourceStore !== storeFilter && result.bestMatch.store !== storeFilter) return false;
    if (minUnits > 0 && result.bestMatch.qtyToTransfer < minUnits) return false;
    return true;
  });
}, [results, rangedFilter, selectedDepts, storeFilter, minUnits]);

const uniqueDepartments = useMemo(() => {
  return Array.from(new Set(results.map(r => r.department).filter(Boolean))).sort();
}, [results]);

const uniqueStores = useMemo(() => {
  const all = [
    ...results.map(r => r.sourceStore),
    ...results.map(r => r.bestMatch.store),
  ];
  return Array.from(new Set(all)).sort();
}, [results]);

const anyFilterActive = rangedFilter !== 'all' || selectedDepts.size > 0 || storeFilter !== '' || minUnits > 0;
```

After adding `filteredResults`, the existing `flatItems` memo on line 178 changes `for (const result of results)` to `for (const result of filteredResults)` and adds `filteredResults` to its dependency array.

**Pattern rules:**
- `useMemo` with typed return only when the type is non-obvious; `filteredResults` is inferred
- Dependency arrays list every variable read inside the memo
- `anyFilterActive` is a plain derived boolean — no `useMemo` needed (it's trivially computed)

---

### Pattern 4 — `useEffect` for Outside-Click Close

**Source:** `apps/web/src/components/UploadModal.tsx` lines 67–75 (Escape key handler), adapted for mousedown outside-click pattern.

UploadModal uses `window.addEventListener('keydown', handler)` with cleanup. The department dropdown uses the same shape but for `document.addEventListener('mousedown', handler)`:

```tsx
// Escape key in UploadModal — structural template:
useEffect(() => {
  if (!isOpen || isUploading) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [isOpen, isUploading, onClose]);
```

**New `useEffect` to add** — in the existing effects block (after line 63), before the scroll container ref:

```tsx
// Close department dropdown on outside click
const deptDropdownRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!deptDropdownOpen) return;
  const handler = (e: MouseEvent) => {
    if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
      setDeptDropdownOpen(false);
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [deptDropdownOpen]);
```

**Pattern rules:**
- Return early if the feature is not active (guard clause before the listener)
- Always return a cleanup function that removes the same listener
- Ref attached to the wrapper `<div className="relative">` of the dropdown trigger

---

### Pattern 5 — Number Input (Template for Min Units Input)

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 291–299

```tsx
<input
  type="number"
  min={1}
  max={24}
  step={1}
  value={monthsCoverTarget}
  onChange={handleMonthsInput}
  className="w-16 rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[13px] text-center text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
  aria-label="Months cover target"
/>
```

**Min units input** — same class string, adjusted attributes:

```tsx
<input
  id="filter-min-units"
  type="number"
  min={0}
  step={1}
  value={minUnits}
  onChange={handleMinUnitsChange}
  className="w-16 rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[13px] text-center text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
  aria-label="Minimum units to transfer"
/>
```

**Differences from template:**
- `min={0}` (not `min={1}`) — zero is valid default
- No `max` attribute
- Has `id` + paired `<label htmlFor>` (template used `aria-label` only)
- No `bg-[var(--color-surface)]` needed — inherits from filter strip

---

### Pattern 6 — Filter Strip Container

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 361–403 (store selector row)

```tsx
<div
  className="flex items-center gap-3 mb-4 p-3 bg-[var(--color-surface-gray)] rounded-lg border border-[var(--color-border-light)]"
  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
>
  <span className="text-[13px] font-medium text-[var(--color-text-secondary)] flex-shrink-0">Stores</span>
  {/* ... */}
</div>
```

**Filter strip container** — same structural pattern, `gap-4` between controls (larger than store selector's `gap-3`), `flex-wrap` added:

```tsx
{hasRun && results.length > 0 && (
  <div
    className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-[var(--color-surface-gray)] rounded-lg border border-[var(--color-border-light)]"
    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
  >
    {/* Ranged filter */}
    {/* Department filter */}
    {/* Store filter */}
    {/* Min units filter */}
    {/* ml-auto container: counter + clear all */}
    <div className="ml-auto flex items-center gap-3">
      {/* ... */}
    </div>
  </div>
)}
```

**Differences from template:**
- `flex-wrap` added (filter controls may need to wrap on narrow viewports)
- `gap-4` between controls (not `gap-3`)
- `flex-shrink-0` not needed on filter strip itself; individual filter `<div>` wrappers use `flex items-center gap-2` internally

---

### Pattern 7 — "Select all" / "Clear all" Text Link

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 393–399

```tsx
{selectedStores.size !== stores.length && (
  <button
    type="button"
    onClick={() => setSelectedStores(new Set(stores.map(s => s.name)))}
    className="ml-auto text-[12px] text-[var(--color-teal)] hover:underline flex-shrink-0"
  >
    Select all
  </button>
)}
```

**"Clear all" link** — identical class pattern, different condition and handler. Note: `text-[13px]` not `text-[12px]` — filter strip uses 13px body per UI-SPEC:

```tsx
{anyFilterActive && (
  <button
    type="button"
    onClick={handleClearFilters}
    className="text-[13px] text-[var(--color-teal)] hover:underline"
  >
    Clear all
  </button>
)}
```

---

### Pattern 8 — Outer Table Container (Horizontal Scroll)

**Source:** `apps/web/src/pages/MatchPage.tsx` line 487

Current code:

```tsx
<div className="border border-[var(--color-border-light)] rounded-lg overflow-hidden">
```

**Modified** to add `overflowX: 'auto'` via inline style (consistent with the existing inline style pattern on the scroll body, line 508):

```tsx
<div
  className="border border-[var(--color-border-light)] rounded-lg overflow-hidden"
  style={{ overflowX: 'auto' }}
>
```

**Pattern rule:** Inline `style` for overflow values that combine with `calc()` or conflict with Tailwind's `overflow-hidden` class — matches existing use of `style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', position: 'relative' }}` on line 508.

---

### Pattern 9 — Sticky Header Row

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 489–502

Current code:

```tsx
<div className="bg-[var(--color-surface-gray)] border-b border-[var(--color-border-light)]">
  <div className="grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center">
    {/* Expand chevron column */}
    <div className="h-10" />
    {columnHeaders.map(header => (
      <div
        key={header}
        className="px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)]"
      >
        {header}
      </div>
    ))}
  </div>
</div>
```

**Modified** — outer div gains sticky positioning, inner grid div gains `min-w-[900px]`, SKU and Description header cells gain sticky-left styles:

```tsx
<div
  className="bg-[var(--color-surface-gray)] border-b border-[var(--color-border-light)]"
  style={{ position: 'sticky', top: 0, zIndex: 10 }}
>
  <div className="grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center min-w-[900px]">
    <div className="h-10" />
    {columnHeaders.map((header, index) => (
      <div
        key={header}
        className="px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)]"
        style={
          index === 0  // SKU header (first after expand col)
            ? { position: 'sticky', left: 36, zIndex: 1, background: 'var(--color-surface-gray)' }
            : index === 1  // Description header
            ? { position: 'sticky', left: 'calc(36px + 120px)', zIndex: 1, background: 'var(--color-surface-gray)' }
            : undefined
        }
      >
        {header}
      </div>
    ))}
  </div>
</div>
```

**Note:** The `columnHeaders` array (lines 240–251) currently uses `.map(header => ...)` without index. Changing to `.map((header, index) => ...)` is required to apply per-column sticky styles.

---

### Pattern 10 — Virtualized Body Scroll Container

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 505–508

Current code:

```tsx
<div
  ref={setContainerRef}
  onScroll={handleScroll}
  style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', position: 'relative' }}
>
```

**Modified** — add `overflowX: 'auto'` to the existing inline style object:

```tsx
<div
  ref={setContainerRef}
  onScroll={handleScroll}
  style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', position: 'relative' }}
>
```

**Pattern rule:** The inline style object is extended — not replaced. All three existing properties (`overflowY`, `maxHeight`, `position`) are preserved.

---

### Pattern 11 — Result Row Grid Div

**Source:** `apps/web/src/pages/MatchPage.tsx` line 524

Current code:

```tsx
<div
  key={rowKey}
  onClick={() => hasMultiple && handleToggleRow(rowKey)}
  style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
  className={`grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[var(--color-border-light)] hover:bg-[var(--color-surface-gray)] transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
>
```

**Modified** — add `min-w-[900px]` to className:

```tsx
<div
  key={rowKey}
  onClick={() => hasMultiple && handleToggleRow(rowKey)}
  style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
  className={`grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center min-w-[900px] border-b border-[var(--color-border-light)] hover:bg-[var(--color-surface-gray)] transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
>
```

**SKU cell** (currently line 536) gains sticky-left inline style:

```tsx
<div
  className="px-3 text-[13px] font-medium text-[var(--color-text-primary)] truncate"
  style={{ position: 'sticky', left: 36, zIndex: 1, background: 'var(--color-surface)' }}
>
  {result.sku}
</div>
```

**Description cell** (currently line 538) gains sticky-left inline style:

```tsx
<div
  className="px-3 text-[13px] text-[var(--color-text-secondary)] truncate"
  style={{ position: 'sticky', left: 'calc(36px + 120px)', zIndex: 1, background: 'var(--color-surface)' }}
>
  {result.description}
</div>
```

---

### Pattern 12 — Sub-Match Row Grid Div

**Source:** `apps/web/src/pages/MatchPage.tsx` line 571

Current code:

```tsx
<div
  key={subKey}
  style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
  className="grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[var(--color-border-light)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-gray)] transition-colors"
>
```

**Modified** — same `min-w-[900px]` addition as result row, same sticky treatment on SKU and Description cells with `background: 'var(--color-surface)'` (sub-rows use surface not surface-gray):

```tsx
<div
  key={subKey}
  style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
  className="grid grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px] items-center min-w-[900px] border-b border-[var(--color-border-light)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-gray)] transition-colors"
>
```

**SKU cell** (currently line 579) gains sticky-left inline style:

```tsx
<div
  className="px-3 text-[13px] text-[var(--color-text-muted)] truncate"
  style={{ position: 'sticky', left: 36, zIndex: 1, background: 'var(--color-surface)' }}
>
  {item.parentSku}
</div>
```

**Description cell** (currently line 581) gains sticky-left inline style:

```tsx
<div
  className="px-3 text-[13px] text-[var(--color-text-muted)] truncate"
  style={{ position: 'sticky', left: 'calc(36px + 120px)', zIndex: 1, background: 'var(--color-surface)' }}
>
  {item.parentDescription}
</div>
```

---

### Pattern 13 — Department Dropdown (Custom, No Library)

**Source analog:** `apps/web/src/components/UploadModal.tsx` lines 264–283 (tooltip popup pattern — positioned `<div>` triggered by button, `ref` for outside-click)

No existing custom dropdown in the codebase. The tooltip in UploadModal provides the closest structural pattern (trigger button + absolutely positioned panel):

```tsx
// From UploadModal.tsx lines 264–284 — tooltip as structural template:
<div className="relative">
  <button
    type="button"
    className="flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1"
    onMouseEnter={() => setRouTooltipVisible(true)}
    onMouseLeave={() => setRouTooltipVisible(false)}
  >
    <Info size={14} aria-hidden="true" />
  </button>
  {rouTooltipVisible && (
    <div
      role="tooltip"
      className="absolute left-6 top-0 z-10 w-64 bg-[var(--color-navy)] text-white text-[13px] rounded-md px-3 py-2 shadow-lg"
    >
      {tooltipContent}
    </div>
  )}
</div>
```

**Department dropdown implementation** — same `relative` container, `absolute` panel, but with `onClick` toggle + `mousedown` outside-click via ref:

```tsx
<div className="flex items-center gap-2">
  <span className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Department</span>
  <div className="relative" ref={deptDropdownRef}>
    <button
      type="button"
      onClick={() => setDeptDropdownOpen(prev => !prev)}
      className="flex items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2 py-1 min-h-[36px] text-[13px] text-[var(--color-text-secondary)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-gray)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
    >
      {selectedDepts.size === 0 ? 'Department' : `Dept (${selectedDepts.size})`}
      <ChevronDown size={12} aria-hidden="true" />
    </button>
    {deptDropdownOpen && (
      <div className="absolute top-full left-0 mt-1 z-10 bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-md shadow-sm min-w-[160px] max-h-[200px] overflow-y-auto py-1">
        {uniqueDepartments.map(dept => (
          <label
            key={dept}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-gray)] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedDepts.has(dept)}
              onChange={() => handleDeptToggle(dept)}
              className="accent-[var(--color-teal)]"
            />
            {dept}
          </label>
        ))}
      </div>
    )}
  </div>
</div>
```

**`ChevronDown` is already imported** on line 2 of MatchPage.tsx — no new import needed.

---

### Pattern 14 — Native Select Filters (Ranged + Store)

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 291–299 (number input class pattern, adapted for `<select>`)

The UI-SPEC defines the `<select>` class string. No existing `<select>` in MatchPage.tsx — the UploadModal text inputs provide the closest class shape:

```tsx
// From UploadModal.tsx line 173–177 — field class template:
const fieldClass = [
  'w-full border border-[var(--color-border-light)] rounded-md px-3 py-2 text-base text-[var(--color-text-primary)] outline-none',
  'focus:border-[var(--color-teal)] focus:ring-1 focus:ring-[var(--color-teal)]',
].join(' ');
```

**Ranged filter** — `<select>` with label:

```tsx
<div className="flex items-center gap-2">
  <label
    htmlFor="filter-ranged"
    className="text-[13px] font-semibold text-[var(--color-text-secondary)]"
  >
    Ranged
  </label>
  <select
    id="filter-ranged"
    value={rangedFilter}
    onChange={e => setRangedFilter(e.target.value as 'all' | 'ranged' | 'non-ranged')}
    className="rounded-md border border-[var(--color-border-light)] px-2 py-1 min-h-[36px] text-[13px] text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
  >
    <option value="all">All</option>
    <option value="ranged">Ranged only</option>
    <option value="non-ranged">Non-ranged only</option>
  </select>
</div>
```

**Store filter** — same class string:

```tsx
<div className="flex items-center gap-2">
  <label
    htmlFor="filter-store"
    className="text-[13px] font-semibold text-[var(--color-text-secondary)]"
  >
    Store
  </label>
  <select
    id="filter-store"
    value={storeFilter}
    onChange={e => setStoreFilter(e.target.value)}
    className="rounded-md border border-[var(--color-border-light)] px-2 py-1 min-h-[36px] text-[13px] text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
  >
    <option value="">All stores</option>
    {uniqueStores.map(store => (
      <option key={store} value={store}>{store}</option>
    ))}
  </select>
</div>
```

---

### Pattern 15 — No-Results-After-Filter Empty State

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 478–484 (post-run no-results state)

```tsx
{hasRun && results.length === 0 && !error && (
  <div className="flex justify-center items-center py-16">
    <p className="text-[var(--color-text-muted)] text-[13px] text-center max-w-sm">
      No transfer matches found. Try adjusting the months cover target or uploading more store data.
    </p>
  </div>
)}
```

**New empty state** — same container, different copy, triggered when filters produce zero rows:

```tsx
{hasRun && results.length > 0 && filteredResults.length === 0 && (
  <div className="flex justify-center items-center py-16">
    <p className="text-[var(--color-text-muted)] text-[13px] text-center max-w-sm">
      No results match the current filters. Try adjusting or clearing the filters.
    </p>
  </div>
)}
```

This replaces the current `{results.length > 0 && ( <div className="border...">` block condition — when `filteredResults.length === 0` the table is not rendered and this empty state shows instead.

**Updated table condition** — change line 486 from `{results.length > 0 && (` to:

```tsx
{filteredResults.length > 0 && (
```

---

## Shared Patterns

### CSS Variables (All New JSX)

**Source:** Used throughout `apps/web/src/pages/MatchPage.tsx` and defined in `apps/web/src/index.css`

Every new element must use these variables:

| Variable | Usage in Phase 17 |
|---|---|
| `var(--color-surface-gray)` | Filter strip background, dropdown item hover, select/input background fallback |
| `var(--color-surface)` | Select/input backgrounds, dropdown panel background, sticky cell backgrounds |
| `var(--color-border-light)` | All input/select/dropdown borders |
| `var(--color-text-secondary)` | Filter labels, select text when unselected |
| `var(--color-text-primary)` | Select text when option selected, dropdown checkbox labels |
| `var(--color-text-muted)` | "Showing X of Y" counter text |
| `var(--color-teal)` | "Clear all" link color, focus ring on all inputs/selects |

### Font Family (All New JSX Containers)

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 283–285 and 362–364

Every new block-level container (filter strip, dropdowns) inherits from parent `style={{ fontFamily: "'Inter', system-ui, sans-serif" }}`. Individual inline elements do not need to repeat it — they inherit.

### `type="button"` on All Buttons

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 265, 305, 332, 376, 393, 414

Every `<button>` in MatchPage explicitly has `type="button"`. This must be applied to:
- Department dropdown trigger button
- "Clear all" button

### `transition-colors` on Interactive Elements

**Source:** `apps/web/src/pages/MatchPage.tsx` lines 309, 380

All buttons with hover states use `transition-colors` in className. The "Clear all" button uses only `hover:underline` (no background change), so `transition-colors` is not needed there. The department trigger button uses `hover:bg-[var(--color-surface-gray)]` so it needs `transition-colors`.

---

## Integration Points Summary

### Virtualization Data Flow Change

The only structural change to MatchPage's data flow:

```
BEFORE:  results → flatItems → visibleItems → rendered rows
AFTER:   results → filteredResults → flatItems → visibleItems → rendered rows
```

- `flatItems` memo: change `for (const result of results)` to `for (const result of filteredResults)` on line 178
- `flatItems` dependency array: replace `results` with `filteredResults`
- The `totalHeight`, `startIndex`/`endIndex`, and `visibleItems` derivations are unchanged

### Table Condition Change

Change `{results.length > 0 && (` (line 486) to `{filteredResults.length > 0 && (`.

The post-match sections (PostMatchChart, CostReport) at lines 607 and 629 continue to use `results` directly — they are unaffected by filters.

### Grid Template String Locations

The string `grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]` appears in **3 places**:
- Line 490: sticky header inner grid div
- Line 524: result row div (className template literal)
- Line 571: sub-match row div

All three must add `min-w-[900px]` alongside the grid class. The grid template itself is unchanged.

---

## No Analog Found

No files in this phase have zero analog — all patterns map to existing MatchPage.tsx code. The department dropdown's close-on-outside-click pattern has a structural analog in UploadModal.tsx's escape key handler (same addEventListener/removeEventListener cleanup shape).

---

## Metadata

**Analog search scope:** `apps/web/src/pages/`, `apps/web/src/components/`, `apps/web/src/hooks/`
**Files read:** 4 (`MatchPage.tsx`, `useMatchRun.ts`, `UploadModal.tsx`, `17-UI-SPEC.md`)
**Pattern extraction date:** 2026-05-14
