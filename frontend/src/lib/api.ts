import type { TopicNode } from './types';

// Server (Server Components): call the backend directly via API_URL.
// Browser: same-origin /api, proxied to the backend by the rewrite in next.config.ts.
const API_URL =
  typeof window === 'undefined' ? (process.env.API_URL ?? 'http://localhost:4100/api') : '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const getTopics = () => apiGet<TopicNode[]>('/topics');
