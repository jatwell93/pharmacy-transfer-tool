import { useState, useCallback } from 'react';
import { useFetch } from './useFetch';

// Mirror the API response types (keep in sync with apps/worker/src/matcher.ts)

export interface DestinationMatch {
  store: string;
  rou: number;
  isRanged: boolean;
  sellThrough: number;
  monthsCover: number;
  qtyToTransfer: number;
  destSoh: number;
}

export interface MatchResult {
  sku: string;
  description: string;
  soh: number;
  cost: number;
  sourceStore: string;
  bestMatch: DestinationMatch;
  allMatches: DestinationMatch[];
}

export interface DataQualityWarning {
  sku: string;
  field: 'rou' | 'soh' | 'cost';
  reason: string;
}

interface UseMatchRunReturn {
  results: MatchResult[];
  warnings: DataQualityWarning[];
  loading: boolean;
  error: string | null;
  hasRun: boolean;
  runMatch: (monthsCoverTarget: number, storeFilter: string[]) => Promise<void>;
  upgradeTo: string | null;
}

export function useMatchRun(): UseMatchRunReturn {
  const fetchApi = useFetch();
  const [results, setResults] = useState<MatchResult[]>([]);
  const [warnings, setWarnings] = useState<DataQualityWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [upgradeTo, setUpgradeTo] = useState<string | null>(null);

  const runMatch = useCallback(async (monthsCoverTarget: number, storeFilter: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthsCoverTarget, storeFilter }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string; upgrade_to?: string };
        setUpgradeTo(body.upgrade_to ?? null);
        throw new Error(body.error || `Match run failed (${res.status})`);
      }
      const body = await res.json() as { results: MatchResult[]; warnings: DataQualityWarning[] };
      setResults(body.results);
      setWarnings(body.warnings);
      setHasRun(true);
      setUpgradeTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match run failed');
      setResults([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  return { results, warnings, loading, error, hasRun, runMatch, upgradeTo };
}
