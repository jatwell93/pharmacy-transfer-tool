import { useAuth } from '@clerk/react';

export function useFetch() {
  const { getToken } = useAuth();

  return async (endpoint: string, options?: RequestInit): Promise<Response> => {
    const token = await getToken();
    return fetch(`${import.meta.env.VITE_WORKER_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  };
}
