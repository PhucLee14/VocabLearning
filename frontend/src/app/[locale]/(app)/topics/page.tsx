import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { Link } from '@/i18n/navigation';
import { getTopics } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { getViewer, optionalUserGet } from '@/lib/server-api';
import type { ProgressData, TopicNode } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Topics');
  return { title: t('title') };
}

export default async function TopicsPage() {
  const t = await getTranslations('Topics');
  return (
    <Page>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('title')}</h1>
        <p className="mt-1 max-w-[62ch] text-[16px] text-muted">{t('lede')}</p>
      </header>
      <Suspense fallback={<TopicsSkeleton />}>
        <TopicGrid />
      </Suspense>
    </Page>
  );
}

/** Words in a topic and all of its subtopics (a word may sit in two subtopics: an upper bound). */
const subtreeWords = (topic: TopicNode) => topic._count.words + topic.children.reduce((n, c) => n + c._count.words, 0);

async function TopicGrid() {
  const [topics, viewer, locale, t] = await Promise.all([getTopics(), getViewer(), getLocale(), getTranslations('Topics')]);
  const progress = viewer ? await optionalUserGet<ProgressData>('/study/progress').catch(() => null) : null;
  const learned = new Map(progress?.byTopic.map((b) => [b.slug, b]) ?? []);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {topics.map((topic) => {
        const mine = learned.get(topic.slug);
        const total = mine?.total ?? subtreeWords(topic);
        return (
          <li key={topic.slug}>
            <Link
              href={`/topics/${topic.slug}`}
              className="flex h-full flex-col rounded-[22px] bg-surface p-5 text-ink no-underline transition-colors hover:bg-sunken"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[18px] font-extrabold">{name(topic)}</span>
                <span className="num flex-none text-[14px] font-bold text-muted">
                  {t('words', { count: total })}
                </span>
              </span>
              <span className="mt-1 line-clamp-2 text-[14px] text-muted">
                {topic.children.map(name).join(' · ')}
              </span>
              {viewer && (
                <span className="mt-auto pt-4">
                  <span className="block h-2 overflow-hidden rounded-full bg-m0">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: total ? `${((mine?.learned ?? 0) / total) * 100}%` : 0 }}
                    />
                  </span>
                  <span className="num mt-1.5 block text-[13px] font-bold text-muted">
                    {t('learned', { learned: formatNumber(mine?.learned ?? 0, locale), total: formatNumber(total, locale) })}
                  </span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TopicsSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <li key={i} className="h-[132px] rounded-[22px] bg-surface" />
      ))}
    </ul>
  );
}
