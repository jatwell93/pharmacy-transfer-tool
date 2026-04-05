import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useMatchRun, MatchResult, DestinationMatch } from '../hooks/useMatchRun';
import { useStores } from '../hooks/useStores';

// --- Constants ---

const PRESET_VALUES = [1, 2, 3, 6, 12];
const ROW_HEIGHT = 44;
const SUB_ROW_HEIGHT = 36;
const BUFFER_ROWS = 5;

// --- Virtualized table item types ---

type FlatItem =
  | { type: 'result'; data: MatchResult }
  | { type: 'subMatch'; data: DestinationMatch; parentSku: string; parentSourceStore: string; parentDescription: string };

// --- MatchPage component ---

export default function MatchPage() {
  const { results, warnings, loading, error, hasRun, runMatch } = useMatchRun();
  const { stores } = useStores();

  // --- State ---
  const [monthsCoverTarget, setMonthsCoverTarget] = useState(3);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  // Initialise store selection to all stores once loaded
  useEffect(() => {
    if (stores.length > 0) {
      setSelectedStores(prev => {
        if (prev.size === 0) return new Set(stores.map(s => s.name));
        return prev;
      });
    }
  }, [stores]);

  // Scroll container ref for virtualization
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  // --- Handlers ---

  const handleRunMatch = useCallback(() => {
    runMatch(monthsCoverTarget, Array.from(selectedStores));
  }, [runMatch, monthsCoverTarget, selectedStores]);

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

  const handlePreset = useCallback((value: number) => {
    setMonthsCoverTarget(value);
  }, []);

  const handleMonthsInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 24) {
      setMonthsCoverTarget(v);
    }
  }, []);

  const handleToggleRow = useCallback((key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop);
      setContainerHeight(scrollContainerRef.current.clientHeight);
    }
  }, []);

  // Initialize container height on mount
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (node) {
      setContainerHeight(node.clientHeight);
    }
  }, []);

  // --- Flat list for virtualization ---

  const flatItems = useMemo<Array<FlatItem & { top: number; height: number }>>(() => {
    const items: Array<FlatItem & { top: number; height: number }> = [];
    let offset = 0;

    for (const result of results) {
      const rowKey = `${result.sku}::${result.sourceStore}`;
      items.push({ type: 'result', data: result, top: offset, height: ROW_HEIGHT });
      offset += ROW_HEIGHT;

      if (expandedRows.has(rowKey)) {
        // Show all matches (index 0 is best match — skip since already shown in parent row)
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
  }, [results, expandedRows]);

  const totalHeight = flatItems.length > 0
    ? flatItems[flatItems.length - 1].top + flatItems[flatItems.length - 1].height
    : 0;

  // Visible range calculation
  const { startIndex, endIndex } = useMemo(() => {
    if (flatItems.length === 0) return { startIndex: 0, endIndex: 0 };

    let start = 0;
    let end = flatItems.length - 1;

    // Binary-search-style: find first item whose bottom >= scrollTop
    for (let i = 0; i < flatItems.length; i++) {
      if (flatItems[i].top + flatItems[i].height > scrollTop) {
        start = i;
        break;
      }
    }

    // Find last item whose top <= scrollTop + containerHeight
    for (let i = flatItems.length - 1; i >= 0; i--) {
      if (flatItems[i].top < scrollTop + containerHeight) {
        end = i;
        break;
      }
    }

    return {
      startIndex: Math.max(0, start - BUFFER_ROWS),
      endIndex: Math.min(flatItems.length - 1, end + BUFFER_ROWS),
    };
  }, [flatItems, scrollTop, containerHeight]);

  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  // --- Column headers ---
  const columnHeaders = ['SKU', 'Description', 'Source Store', 'Destination Store', 'Qty to Transfer', 'Dest ROU', 'Months Cover', 'Sell-Through Time'];

  // --- Render ---

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold text-[#0F172A] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Match Results
        </h1>
      </div>

      {/* Control bar */}
      <div
        className="flex items-center justify-between gap-4 mb-4 p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* Left: months cover controls */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[#475569]">Months Cover</span>

          {/* Number input */}
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            value={monthsCoverTarget}
            onChange={handleMonthsInput}
            className="w-16 rounded-md border border-[#E2E8F0] px-2 py-1 text-[13px] text-center text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            aria-label="Months cover target"
          />

          {/* Preset buttons */}
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map(value => (
              <button
                key={value}
                type="button"
                onClick={() => handlePreset(value)}
                className={`rounded-md px-3 min-h-[36px] text-[13px] font-medium transition-colors ${
                  monthsCoverTarget === value
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                }`}
                aria-pressed={monthsCoverTarget === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Run Match button */}
        <button
          type="button"
          onClick={handleRunMatch}
          className="bg-[#0F766E] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 hover:bg-[#0D5D5A] transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] focus-visible:outline-offset-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              <span>Running...</span>
            </>
          ) : (
            <span>Run Match</span>
          )}
        </button>
      </div>

      {/* Store selector — shown when stores are available */}
      {stores.length > 0 && (
        <div
          className="flex items-center gap-3 mb-4 p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <span className="text-[13px] font-medium text-[#475569] flex-shrink-0">Stores</span>
          <div className="flex flex-wrap gap-2">
            {stores.map(store => {
              const active = selectedStores.has(store.name);
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => handleToggleStore(store.name)}
                  className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-[#0F766E] text-white'
                      : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                  }`}
                  aria-pressed={active}
                >
                  {store.name}
                </button>
              );
            })}
          </div>
          {selectedStores.size !== stores.length && (
            <button
              type="button"
              onClick={() => setSelectedStores(new Set(stores.map(s => s.name)))}
              className="ml-auto text-[12px] text-[#0F766E] hover:underline flex-shrink-0"
            >
              Select all
            </button>
          )}
        </div>
      )}

      {/* Data quality banners — only shown after first run (D-13) */}
      {hasRun && (
        <>
          {warnings.length > 0 ? (
            // Amber warning banner (collapsible)
            <div
              className="mb-4 rounded-md overflow-hidden"
              style={{ borderLeft: '4px solid #D97706', background: '#FFFBEB' }}
            >
              <button
                type="button"
                onClick={() => setWarningsExpanded(prev => !prev)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                aria-expanded={warningsExpanded}
              >
                <AlertTriangle size={16} color="#D97706" aria-hidden="true" />
                <span className="text-[13px] font-medium text-[#92400E]">
                  {warnings.length} item{warnings.length !== 1 ? 's' : ''} had data quality issues
                </span>
                <span className="ml-auto text-[12px] text-[#92400E]">
                  {warningsExpanded ? 'Hide details' : 'Show details'}
                </span>
              </button>

              {warningsExpanded && (
                <div className="px-4 pb-3 flex flex-col gap-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[13px] text-[#92400E]">
                      SKU: {w.sku} — {w.field}: {w.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Green/teal confirmation banner
            <div
              className="mb-4 rounded-md flex items-center gap-2 px-4 py-3"
              style={{ borderLeft: '4px solid #0F766E', background: '#F0FDF4' }}
            >
              <CheckCircle2 size={16} color="#0F766E" aria-hidden="true" />
              <span className="text-[13px] text-[#065F46]">All data passed quality checks.</span>
            </div>
          )}
        </>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="mb-4 rounded-md flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderLeft: '4px solid #EF4444', background: '#FEF2F2' }}
        >
          <p className="text-[13px] text-[#991B1B]">{error}</p>
          <button
            type="button"
            onClick={handleRunMatch}
            className="text-[13px] font-semibold text-[#EF4444] hover:text-[#B91C1C] transition-colors flex-shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Results table or empty state */}
      {!hasRun && !error && (
        <div className="flex justify-center items-center py-16">
          <p className="text-[#94A3B8] text-[13px] text-center max-w-sm">
            Upload store data, then click Run Match to find transfer opportunities.
          </p>
        </div>
      )}

      {hasRun && results.length === 0 && !error && (
        <div className="flex justify-center items-center py-16">
          <p className="text-[#94A3B8] text-[13px] text-center max-w-sm">
            No transfer matches found. Try adjusting the months cover target or uploading more store data.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
          {/* Sticky header row */}
          <div className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <div className="grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center">
              {/* Expand chevron column */}
              <div className="h-10" />
              {columnHeaders.map(header => (
                <div
                  key={header}
                  className="px-3 py-2.5 text-[13px] font-semibold text-[#475569]"
                >
                  {header}
                </div>
              ))}
            </div>
          </div>

          {/* Virtualized scrollable body */}
          <div
            ref={setContainerRef}
            onScroll={handleScroll}
            style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', position: 'relative' }}
          >
            {/* Spacer div to define total scroll height */}
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleItems.map(item => {
                if (item.type === 'result') {
                  const result = item.data;
                  const rowKey = `${result.sku}::${result.sourceStore}`;
                  const isExpanded = expandedRows.has(rowKey);
                  const hasMultiple = result.allMatches.length > 1;

                  return (
                    <div
                      key={rowKey}
                      onClick={() => hasMultiple && handleToggleRow(rowKey)}
                      style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
                      className={`grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
                    >
                      {/* Expand/collapse chevron */}
                      <div className="flex items-center justify-center">
                        {hasMultiple ? (
                          isExpanded
                            ? <ChevronDown size={14} className="text-[#94A3B8]" aria-hidden="true" />
                            : <ChevronRight size={14} className="text-[#94A3B8]" aria-hidden="true" />
                        ) : null}
                      </div>

                      {/* SKU */}
                      <div className="px-3 text-[13px] font-medium text-[#0F172A] truncate">{result.sku}</div>
                      {/* Description */}
                      <div className="px-3 text-[13px] text-[#475569] truncate">{result.description}</div>
                      {/* Source Store */}
                      <div className="px-3 text-[13px] text-[#475569] truncate">{result.sourceStore}</div>
                      {/* Destination Store */}
                      <div className="px-3 text-[13px] text-[#475569] truncate">{result.bestMatch.store}</div>
                      {/* Qty to Transfer */}
                      <div className="px-3 text-[13px] text-[#0F172A] font-medium">{result.bestMatch.qtyToTransfer}</div>
                      {/* Dest ROU */}
                      <div className="px-3 text-[13px] text-[#475569]">{result.bestMatch.rou.toFixed(1)}</div>
                      {/* Months Cover */}
                      <div className="px-3 text-[13px] text-[#475569]">{result.bestMatch.monthsCover}</div>
                      {/* Sell-Through Time */}
                      <div className="px-3 text-[13px] text-[#475569]">{result.bestMatch.sellThrough.toFixed(1)} mo</div>
                    </div>
                  );
                }

                // Sub-match row
                const sub = item.data as DestinationMatch;
                const subKey = `sub::${item.parentSku}::${item.parentSourceStore}::${sub.store}`;

                return (
                  <div
                    key={subKey}
                    style={{ position: 'absolute', top: item.top, height: item.height, width: '100%' }}
                    className="grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[#E2E8F0] bg-[#FAFAFA] hover:bg-[#F8FAFC] transition-colors"
                  >
                    {/* Indent chevron placeholder */}
                    <div className="flex items-center justify-center pl-4">
                      <div className="w-px h-4 bg-[#E2E8F0]" />
                    </div>

                    {/* SKU — greyed out (same as parent) */}
                    <div className="px-3 text-[13px] text-[#94A3B8] truncate">{item.parentSku}</div>
                    {/* Description — greyed out */}
                    <div className="px-3 text-[13px] text-[#94A3B8] truncate">{item.parentDescription}</div>
                    {/* Source Store — greyed out */}
                    <div className="px-3 text-[13px] text-[#94A3B8] truncate">{item.parentSourceStore}</div>
                    {/* Destination Store */}
                    <div className="px-3 text-[13px] text-[#475569] truncate">{sub.store}</div>
                    {/* Qty to Transfer */}
                    <div className="px-3 text-[13px] text-[#475569]">{sub.qtyToTransfer}</div>
                    {/* Dest ROU */}
                    <div className="px-3 text-[13px] text-[#475569]">{sub.rou.toFixed(1)}</div>
                    {/* Months Cover */}
                    <div className="px-3 text-[13px] text-[#475569]">{sub.monthsCover}</div>
                    {/* Sell-Through Time */}
                    <div className="px-3 text-[13px] text-[#475569]">{sub.sellThrough.toFixed(1)} mo</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
