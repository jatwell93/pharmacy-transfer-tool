import { useState } from 'react';
import type { StoreSummary } from '../hooks/useDeadStockSummary';
import type { MatchResult } from '../hooks/useMatchRun';

interface CostReportProps {
  stores: StoreSummary[];       // from summary?.stores ?? [] in MatchPage
  results: MatchResult[];       // from useMatchRun
  hasRun: boolean;              // from useMatchRun — gates recoverable KPI display
}

function formatAUD(value: number): string {
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CostReport({ stores, results, hasRun }: CostReportProps) {
  const [sohInput, setSohInput] = useState('');

  // --- Derived values ---
  const hasCostData = stores.some(s => s.hasCostData);
  const costStoreCount = stores.filter(s => s.hasCostData).length;
  const totalStoreCount = stores.length;
  const hasPartialCoverage = costStoreCount > 0 && costStoreCount < totalStoreCount;

  const totalDeadStockValue = stores.reduce((sum, s) => sum + s.totalValue, 0);

  // SOH percentage — only computed when input is a valid positive number (D-07: guard against Infinity/NaN)
  const sohValue = parseFloat(sohInput);
  const sohValid = isFinite(sohValue) && sohValue > 0;
  const pct = sohValid ? Math.min(100, (totalDeadStockValue / sohValue) * 100) : null;
  const barColor = pct === null ? '#0F766E' : pct > 25 ? '#DC2626' : pct >= 10 ? '#D97706' : '#0F766E';

  // Recoverable value — sum(qtyToTransfer * cost) for results where cost > 0 (D-09)
  const recoverableValue = results
    .filter(r => r.cost > 0)
    .reduce((sum, r) => sum + r.bestMatch.qtyToTransfer * r.cost, 0);

  // D-08: show KPI when hasRun AND at least one store has cost data AND recoverableValue > 0 (D-12)
  const showRecoverable = hasRun && hasCostData && recoverableValue > 0;

  // --- No cost data state (D-02) ---
  if (!hasCostData) {
    return (
      <p className="text-[13px] text-[var(--color-text-muted)]">
        Re-upload dead stock using FRED Stock Valuation report format to see dollar values.
      </p>
    );
  }

  return (
    <div>
      {/* Recoverable Value KPI — top of panel, post-match only (D-08, D-12) */}
      {showRecoverable && (
        <div className="mb-6">
          <div className="inline-block rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4 min-w-[160px]">
            <p className="text-[12px] text-[var(--color-text-muted)] mb-1 leading-snug">
              Recoverable Value<br />from matched transfers
            </p>
            <p
              className="text-2xl font-semibold text-[#0F766E]"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              {formatAUD(recoverableValue)}
            </p>
          </div>
        </div>
      )}

      {/* Partial coverage notice (Pitfall 2 guard) */}
      {hasPartialCoverage && (
        <p className="text-[12px] text-[var(--color-text-muted)] mb-3">
          {costStoreCount} of {totalStoreCount} stores have cost data
        </p>
      )}

      {/* Per-store dead stock dollar cards — horizontal row (D-03, D-04) */}
      {(() => {
        const costStores = stores.filter(s => s.hasCostData);
        const n = costStores.length;
        const labelSize = n <= 2 ? '15px' : n <= 4 ? '13px' : '12px';
        const valueSize = n <= 1 ? '3rem' : n <= 2 ? '2.25rem' : n <= 4 ? '1.75rem' : '1.5rem';
        const minH = n <= 1 ? '160px' : n <= 2 ? '130px' : '100px';
        return (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-6">
            {costStores.map(s => (
              <div
                key={s.name}
                className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] flex flex-col items-center justify-center text-center p-6"
                style={{ minHeight: minH }}
              >
                <p className="text-[var(--color-text-muted)] mb-2 leading-snug" style={{ fontSize: labelSize }}>
                  {s.name}<br />Dead Stock Value
                </p>
                <p
                  className="font-semibold text-[#0F766E]"
                  style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: valueSize }}
                >
                  {formatAUD(s.totalValue)}
                </p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* SOH input — below store cards, above percentage (D-05) */}
      <div className="mb-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <label
          htmlFor="soh-input"
          className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1"
        >
          Total SOH value ($)
        </label>
        <input
          id="soh-input"
          type="number"
          min={0}
          step={0.01}
          value={sohInput}
          onChange={e => setSohInput(e.target.value)}
          placeholder="e.g. 500000"
          className="w-48 rounded-md border border-[var(--color-border-light)] px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
          aria-label="Enter total stock on hand dollar value"
        />
      </div>

      {/* Percentage bar or placeholder (D-06, D-07) */}
      {pct === null ? (
        <p className="text-[13px] text-[var(--color-text-muted)]">
          Enter total SOH value above to see dead stock percentage.
        </p>
      ) : (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
              Dead stock as % of total SOH
            </span>
            <span
              className="text-base font-semibold"
              style={{ color: barColor, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              {pct.toFixed(1)}%
            </span>
          </div>
          {/* Progress bar with threshold markers (D-06) */}
          <div
            style={{
              position: 'relative',
              height: 12,
              background: 'var(--color-surface-gray)',
              borderRadius: 6,
              overflow: 'visible',
              border: '1px solid var(--color-border-light)',
            }}
          >
            {/* Fill */}
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: barColor,
                borderRadius: 6,
                transition: 'width 0.2s, background 0.2s',
              }}
            />
            {/* Amber threshold marker at 10% */}
            <div
              style={{
                position: 'absolute',
                top: -4,
                left: '10%',
                width: 2,
                height: 20,
                background: '#D97706',
                borderRadius: 1,
              }}
              title="10% threshold (amber zone)"
            />
            {/* Red threshold marker at 25% */}
            <div
              style={{
                position: 'absolute',
                top: -4,
                left: '25%',
                width: 2,
                height: 20,
                background: '#DC2626',
                borderRadius: 1,
              }}
              title="25% threshold (red zone)"
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">0%</span>
            <span className="text-[11px] text-[#D97706]">10%</span>
            <span className="text-[11px] text-[#DC2626]">25%</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">100%</span>
          </div>
        </div>
      )}
    </div>
  );
}
