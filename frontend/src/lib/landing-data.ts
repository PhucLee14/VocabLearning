import { cacheLife } from 'next/cache';
import { apiGet } from '@/lib/api';
import type { TopicNode, WordDetail, WordList } from '@/lib/types';

/**
 * Public data for the landing page (and the island prototype), cached so the
 * page stays in the static shell. If the API is down (e.g. while building),
 * the page still renders without the numbers and the demo card.
 */
export async function landingData() {
  'use cache';
  try {
    const [topics, levels, list] = await Promise.all([
      apiGet<TopicNode[]>('/topics'),
      apiGet<Record<string, number>>('/levels'),
      apiGet<WordList>('/words?level=A1&pageSize=60'),
    ]);
    // A few A1 words with an example, for the demo card.
    const picks = list.items.filter((w) => w.meaningVi).slice(0, 40);
    const step = Math.max(1, Math.floor(picks.length / 6));
    const chosen = picks.filter((_, i) => i % step === 0).slice(0, 6);
    const details = await Promise.all(chosen.map((w) => apiGet<WordDetail>(`/words/${w.slug}`).catch(() => null)));
    const demo = chosen.map((w, i) => ({ ...w, example: details[i]?.examples[0]?.sentence ?? null }));
    cacheLife('hours');
    return { topics, levels, demo };
  } catch {
    // Kept only briefly: a page built while the API was down would otherwise
    // go without the demo card and the topics (two whole floors) for hours.
    cacheLife('minutes');
    return { topics: [] as TopicNode[], levels: {} as Record<string, number>, demo: [] };
  }
}
