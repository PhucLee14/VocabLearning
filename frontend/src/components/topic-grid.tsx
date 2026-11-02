import { getLocale, getTranslations } from 'next-intl/server';
import { getTopics } from '@/lib/api';
import type { TopicNode } from '@/lib/types';

/** Topic grid fetched from the backend (GET /api/topics). Rendered at request time inside <Suspense>. */
export async function TopicGrid() {
  const [t, locale] = await Promise.all([getTranslations('Home'), getLocale()]);

  let topics: TopicNode[];
  try {
    topics = await getTopics();
  } catch {
    return (
      <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
        {t('topicsError')}
      </p>
    );
  }

  const name = (x: { nameEn: string; nameVi: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <>
      <p className="mt-1 text-muted">{t('topicsSubtitle', { count: topics.length })}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <li key={topic.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-2xl leading-none">
                {topic.icon}
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">{name(topic)}</h3>
                {locale === 'vi' && <p className="text-sm text-muted">{topic.nameEn}</p>}
                <p className="mt-2 text-xs text-muted">
                  {t('subtopicCount', { count: topic.children.length })} ·{' '}
                  {t('wordCount', { count: topic._count.words })}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TopicGridSkeleton() {
  return (
    <ul aria-hidden className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </ul>
  );
}
