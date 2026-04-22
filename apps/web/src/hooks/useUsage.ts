import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';

export interface UsageData {
  count: number;
  limit: number;
  plan_tier: 'free' | 'pro' | 'enterprise';
  store_count: number;
}

export function useUsage() {
  const fetchApi = useFetch();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchApi('/api/usage');
      if (res.ok) {
        const data = (await res.json()) as UsageData;
        setUsage(data);
        setError(null);
      } else {
        setError('Could not load usage');
      }
    } catch {
      setError('Could not load usage');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { usage, loading, error, refresh };
}
