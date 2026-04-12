import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { useOrganization } from '@clerk/react';
import AppShell from '../components/AppShell';
import { useMatchRun, MatchResult, DestinationMatch } from '../hooks/useMatchRun';
import { useStores } from '../hooks/useStores';
import { useUsage } from '../hooks/useUsage';
import { useFetch } from '../hooks/useFetch';

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
  const { stores, loading: storesLoading } = useStores();
  const { usage, loading: usageLoading, refresh: refreshUsage } = useUsage();
  const fetchApi = useFetch();
  const { organization } = useOrganization();
  const orgName = organization?.name ?? 'PharmIQ';

  // --- State ---
  const [monthsCoverTarget, setMonthsCoverTarget] = useState(3);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Derived: true when free-plan org is at their monthly run limit
  const isAtLimit = usage?.plan === 'free' && usage.count >= usage.limit;

  // Initialise store selection to all stores once loaded
  useEffect(() => {
    if (stores.length > 0) {
      setSelectedStores(prev => {
        if (prev.size === 0) return new Set(stores.map(s => s.name));
        return prev;
      });
    }
  }, [stores]);

  // Show upgrade modal when error contains the 429 limit message (D-04)
  useEffect(() => {
    if (error && error.includes('Monthly match run limit reached')) {
      setShowUpgradeModal(true);
    }
  }, [error]);

  // Scroll container ref for virtualization
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  // Suppress unused variable warning for usageLoading
  void usageLoading;

  // --- Handlers ---

  const handleRunMatch = useCallback(async () => {
    if (isAtLimit) {
      setShowUpgradeModal(true);
      return;
    }
    await runMatch(monthsCoverTarget, Array.from(selectedStores));
    // Re-fetch usage after match run — harmless on error, needed on success (D-09)
    refreshUsage();
  }, [runMatch, monthsCoverTarget, selectedStores, isAtLimit, refreshUsage]);

  const handleUpgrade = useCallback(async () => {
    try {
      const res = await fetchApi('/api/billing/create-checkout', { method: 'POST' });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [fetchApi]);

  const handleExportPdf = useCallback(async () => {
    if (results.length === 0 || pdfLoading) return;
    setPdfLoading(true);
    try {
      const [{ pdf }, { TransferReportPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TransferReportPDF'),
      ]);
      const blob = await pdf(<TransferReportPDF results={results} orgName={orgName} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmiq-transfer-report-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }, [results, orgName, pdfLoading]);

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
          className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Match Results
        </h1>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={pdfLoading || results.length === 0}
          className={`text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D97706] ${
            results.length === 0
              ? 'bg-[#D97706]/40 text-white cursor-not-allowed'
              : 'bg-[#D97706] text-white hover:bg-[#B45309]'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          aria-label="Export match results as PDF"
        >
          {pdfLoading ? 'Preparing...' : 'Export PDF'}
        </button>
      </div>

      {/* Control bar */}
      <div
        className="flex items-center justify-between gap-4 mb-4 p-4 bg-[var(--color-surface-gray)] rounded-lg border border-[var(--color-border-light)]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* Left: months cover controls */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">Months Cover</span>

          {/* Number input */}
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

          {/* Preset buttons */}
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map(value => (
              <button
                key={value}
                type="button"
                onClick={() => handlePreset(value)}
                className={`rounded-md px-3 min-h-[36px] text-[13px] font-medium transition-colors ${
                  monthsCoverTarget === value
                    ? 'bg-[var(--color-teal)] text-white'
                    : 'bg-[var(--color-surface-gray)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]'
                }`}
                aria-pressed={monthsCoverTarget === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Usage counter + Run Match button */}
        <div className="flex items-center gap-3">
          {/* Usage counter — only for free-plan orgs (D-07, D-08) */}
          {usage && usage.plan === 'free' && (
            <span className="text-[13px] text-[var(--color-text-secondary)]">
              {usage.count} of {usage.limit} free run{usage.limit !== 1 ? 's' : ''} used this month
            </span>
          )}

          {/* Run Match button — disabled state when at limit (D-06) */}
          <button
            type="button"
            onClick={isAtLimit ? () => setShowUpgradeModal(true) : handleRunMatch}
            disabled={loading}
            className={`text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isAtLimit
                ? 'bg-[#D97706] text-white hover:bg-[#B45309] focus-visible:outline-[#D97706]'
                : 'bg-[var(--color-teal)] text-white hover:bg-[var(--color-teal-dark)] focus-visible:outline-[var(--color-teal)]'
            }`}
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {isAtLimit ? (
              <>
                <Lock size={16} aria-hidden="true" />
                <span>Upgrade to run again</span>
              </>
            ) : loading ? (
              <>
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                <span>Running...</span>
              </>
            ) : (
              <span>Run Match</span>
            )}
          </button>
        </div>
      </div>

      {/* Store selector — always visible so users can pick stores before first run */}
      <div
        className="flex items-center gap-3 mb-4 p-3 bg-[var(--color-surface-gray)] rounded-lg border border-[var(--color-border-light)]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <span className="text-[13px] font-medium text-[var(--color-text-secondary)] flex-shrink-0">Stores</span>
        {storesLoading ? (
          <span className="text-[13px] text-[var(--color-text-muted)]">Loading stores...</span>
        ) : stores.length === 0 ? (
          <span className="text-[13px] text-[var(--color-text-muted)]">No stores uploaded yet — go to Upload to add stores.</span>
        ) : (
          <>
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
                        ? 'bg-[var(--color-teal)] text-white'
                        : 'bg-[var(--color-surface-gray)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]'
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
                className="ml-auto text-[12px] text-[var(--color-teal)] hover:underline flex-shrink-0"
              >
                Select all
              </button>
            )}
          </>
        )}
      </div>

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
          <p className="text-[var(--color-text-muted)] text-[13px] text-center max-w-sm">
            Upload store data, select stores, then click Run Match to find transfer opportunities.
          </p>
        </div>
      )}

      {hasRun && results.length === 0 && !error && (
        <div className="flex justify-center items-center py-16">
          <p className="text-[var(--color-text-muted)] text-[13px] text-center max-w-sm">
            No transfer matches found. Try adjusting the months cover target or uploading more store data.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-[var(--color-border-light)] rounded-lg overflow-hidden">
          {/* Sticky header row */}
          <div className="bg-[var(--color-surface-gray)] border-b border-[var(--color-border-light)]">
            <div className="grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center">
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
                      className={`grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[var(--color-border-light)] hover:bg-[var(--color-surface-gray)] transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
                    >
                      {/* Expand/collapse chevron */}
                      <div className="flex items-center justify-center">
                        {hasMultiple ? (
                          isExpanded
                            ? <ChevronDown size={14} className="text-[var(--color-text-muted)]" aria-hidden="true" />
                            : <ChevronRight size={14} className="text-[var(--color-text-muted)]" aria-hidden="true" />
                        ) : null}
                      </div>

                      {/* SKU */}
                      <div className="px-3 text-[13px] font-medium text-[var(--color-text-primary)] truncate">{result.sku}</div>
                      {/* Description */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)] truncate">{result.description}</div>
                      {/* Source Store */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)] truncate">{result.sourceStore}</div>
                      {/* Destination Store */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)] truncate">{result.bestMatch.store}</div>
                      {/* Qty to Transfer */}
                      <div className="px-3 text-[13px] text-[var(--color-text-primary)] font-medium">{result.bestMatch.qtyToTransfer.toFixed(1)}</div>
                      {/* Dest ROU */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{result.bestMatch.rou.toFixed(1)}</div>
                      {/* Months Cover */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{result.bestMatch.monthsCover}</div>
                      {/* Sell-Through Time */}
                      <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{result.bestMatch.sellThrough.toFixed(1)} mo</div>
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
                    className="grid grid-cols-[36px_1fr_1.2fr_1fr_1fr_100px_80px_100px_100px] items-center border-b border-[var(--color-border-light)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-gray)] transition-colors"
                  >
                    {/* Indent chevron placeholder */}
                    <div className="flex items-center justify-center pl-4">
                      <div className="w-px h-4 bg-[var(--color-border-light)]" />
                    </div>

                    {/* SKU — greyed out (same as parent) */}
                    <div className="px-3 text-[13px] text-[var(--color-text-muted)] truncate">{item.parentSku}</div>
                    {/* Description — greyed out */}
                    <div className="px-3 text-[13px] text-[var(--color-text-muted)] truncate">{item.parentDescription}</div>
                    {/* Source Store — greyed out */}
                    <div className="px-3 text-[13px] text-[var(--color-text-muted)] truncate">{item.parentSourceStore}</div>
                    {/* Destination Store */}
                    <div className="px-3 text-[13px] text-[var(--color-text-secondary)] truncate">{sub.store}</div>
                    {/* Qty to Transfer */}
                    <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{sub.qtyToTransfer.toFixed(1)}</div>
                    {/* Dest ROU */}
                    <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{sub.rou.toFixed(1)}</div>
                    {/* Months Cover */}
                    <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{sub.monthsCover}</div>
                    {/* Sell-Through Time */}
                    <div className="px-3 text-[13px] text-[var(--color-text-secondary)]">{sub.sellThrough.toFixed(1)} mo</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal overlay (D-04) */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-xl p-8 max-w-sm w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="upgrade-modal-title"
            aria-modal="true"
          >
            <h2
              id="upgrade-modal-title"
              className="text-lg font-semibold text-[var(--color-text-primary)] mb-2"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              You've used your free run for this month
            </h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-6">
              Upgrade to PharmIQ Pro for unlimited match runs.
            </p>
            <button
              onClick={handleUpgrade}
              className="w-full bg-[#D97706] text-white font-semibold rounded-md px-4 py-3 hover:bg-[#B45309] transition-colors"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Upgrade Now
            </button>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full mt-2 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] py-2 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
