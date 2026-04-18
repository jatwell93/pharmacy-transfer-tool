import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MatchResult } from '../hooks/useMatchRun';
import type { StoreSummary } from '../hooks/useDeadStockSummary';

interface PostMatchChartProps {
  results: MatchResult[];
  summary: StoreSummary[];
}

export function PostMatchChart({ results, summary }: PostMatchChartProps) {
  // Compute outgoing transfers per source store
  const outgoingByStore = new Map<string, number>();
  for (const r of results) {
    const prev = outgoingByStore.get(r.sourceStore) ?? 0;
    outgoingByStore.set(r.sourceStore, prev + r.bestMatch.qtyToTransfer);
  }

  // Compute incoming transfers per destination store
  const incomingByStore = new Map<string, number>();
  for (const r of results) {
    const prev = incomingByStore.get(r.bestMatch.store) ?? 0;
    incomingByStore.set(r.bestMatch.store, prev + r.bestMatch.qtyToTransfer);
  }

  // Build bar chart data for ALL stores (not just source stores)
  // Destination-only stores have after === before (they receive sellable items, not dead stock)
  const chartData = summary.map(s => ({
    store: s.name,
    before: s.totalUnits,
    after: Math.max(0, s.totalUnits - (outgoingByStore.get(s.name) ?? 0)),
  }));

  // Per-store net: incoming − outgoing for ALL stores in summary
  const storeNets = summary.map(s => ({
    name: s.name,
    net: (incomingByStore.get(s.name) ?? 0) - (outgoingByStore.get(s.name) ?? 0),
  }));

  const hasChartData = summary.some(s => s.totalUnits > 0);

  return (
    <div>
      {/* Per-store Net Units Received KPI cards — all stores */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 mb-6">
        {storeNets.map(({ name, net }) => (
          <div
            key={name}
            className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4"
          >
            <p className="text-[12px] text-[var(--color-text-muted)] mb-1 leading-snug">
              {name}<br />Net Units Received
            </p>
            <p
              className={`text-2xl font-semibold ${net >= 0 ? 'text-[#0F766E]' : 'text-[#DC2626]'}`}
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              {net > 0 ? '+' : ''}{Math.round(net).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Bar chart — only render when stores have dead stock data */}
      {hasChartData && (
        <div>
          <p className="text-[12px] text-[var(--color-text-muted)] mb-2">
            Projected if all transfers complete
          </p>
          <div className="min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barCategoryGap="20%" barGap={4}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-light)"
                />
                <XAxis
                  dataKey="store"
                  tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="before"
                  name="Before"
                  fill="#D97706"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="after"
                  name="After"
                  fill="#0F766E"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
