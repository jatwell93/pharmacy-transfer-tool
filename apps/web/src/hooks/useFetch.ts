import { useCallback, useRef } from 'react';
import { useAuth } from '@clerk/react';

export function useFetch() {
  const { getToken } = useAuth();
  // Keep a ref so the stable callback always calls the latest getToken
  // without needing it as a dependency (which causes render loops when
  // Clerk refreshes its session state).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useCallback(async (endpoint: string, options?: RequestInit): Promise<Response> => {
    const token = await getTokenRef.current();
    return fetch(`${import.meta.env.VITE_WORKER_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, []); // empty deps — function is created once, ref keeps getToken current
}
