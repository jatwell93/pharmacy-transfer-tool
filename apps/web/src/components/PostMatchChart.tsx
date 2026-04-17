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
  // Step 1 -- Compute outgoing transfers per source store (D-01, D-02)
  const outgoingByStore = new Map<string, number>();
  for (const r of results) {
    const prev = outgoingByStore.get(r.sourceStore) ?? 0;
    outgoingByStore.set(r.sourceStore, prev + r.bestMatch.qtyToTransfer);
  }

  // Step 2 -- Build chart data array. Only include stores that appear as a source store (D-01)
  // Per D-03: stores appearing as both source and destination are treated as source only.
  const chartData = summary
    .filter(s => outgoingByStore.has(s.name))
    .map(s => ({
      store: s.name,
      before: s.totalUnits,
      after: Math.max(0, s.totalUnits - (outgoingByStore.get(s.name) ?? 0)), // D-04 clamp
    }));

  // Step 3 -- Compute net units recovered across ALL match results (D-05)
  const netUnitsRecovered = results.reduce(
    (sum, r) => sum + r.bestMatch.qtyToTransfer,
    0
  );

  return (
    <div>
      {/* KPI card (D-05) */}
      <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-4 mb-6">
        <p className="text-[12px] text-[var(--color-text-muted)] mb-1">Net Units Recovered</p>
        <p
          className="text-3xl font-semibold text-[#0F766E]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          {Math.round(netUnitsRecovered).toLocaleString()}
        </p>
      </div>

      {/* Bar chart -- only render when there are source stores to show (D-01) */}
      {chartData.length > 0 && (
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
