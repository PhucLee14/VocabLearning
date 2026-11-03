import { cache } from 'react';
import type { TopicDetail, TopicNode } from './types';

// Server (Server Components): call the backend directly via API_URL.
// Browser: same-origin /api, proxied to the backend by the rewrite in next.config.ts.
export const API_URL =
  typeof window === 'undefined' ? (process.env.API_URL ?? 'http://localhost:4300/api') : '/api';

/** Public (anonymous) GET. For the signed-in user's data use lib/server-api.ts. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

// Several Server Components on one page read the topic tree; share one request per render.
export const getTopics = cache(() => apiGet<TopicNode[]>('/topics'));

/** null when the topic does not exist. */
export const getTopic = cache(async (slug: string) => {
  const res = await fetch(`${API_URL}/topics/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /topics/${slug} → ${res.status}`);
  return (await res.json()) as TopicDetail;
});
