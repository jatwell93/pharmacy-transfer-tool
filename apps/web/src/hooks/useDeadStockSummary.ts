import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';

// Response shape from GET /api/dead-stock-summary (Worker route)
// See apps/worker/src/routes/dead-stock-summary.ts for the source of truth.
export interface StoreSummary {
  name: string;
  totalUnits: number;
  totalValue: number;
  hasCostData: boolean;
}

export interface DeadStockSummary {
  stores: StoreSummary[];
}

/**
 * Fetches per-store unit totals and dollar values from the Worker.
 * Per D-12: per-page instantiation — UploadPage and MatchPage each call this hook
 * independently. No shared context.
 * Per D-13: refetch() is exposed so UploadPage can refresh after a successful upload.
 * Per D-14: MatchPage calls on mount; no re-fetch trigger needed (summary is pre-match data).
 */
export function useDeadStockSummary() {
  const fetchApi = useFetch();
  const [summary, setSummary] = useState<DeadStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/dead-stock-summary');
      if (!res.ok) throw new Error('Failed to load dead stock summary');
      const data = (await res.json()) as DeadStockSummary;
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => { refetch(); }, [refetch]);

  return { summary, loading, error, refetch };
}
