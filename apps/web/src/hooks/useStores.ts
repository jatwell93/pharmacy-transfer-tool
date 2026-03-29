import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';

export interface Store {
  id: string;
  name: string;
  storeNumber: string | null;
  createdAt: string;
  rouUploadedAt: string | null;
  dsUploadedAt: string | null;
}

export function useStores() {
  const fetchApi = useFetch();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/stores');
      if (!res.ok) throw new Error('Failed to load stores');
      const data = await res.json();
      setStores(data.stores);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => { refresh(); }, [refresh]);

  return { stores, loading, error, refresh };
}
