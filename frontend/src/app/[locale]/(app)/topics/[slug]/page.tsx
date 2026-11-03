import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { WordListView } from '@/components/word/word-list';
import { Link } from '@/i18n/navigation';
import { getTopic } from '@/lib/api';
import { getViewer, optionalUserGet } from '@/lib/server-api';
import type { WordList } from '@/lib/types';

export async function generateMetadata({ params }: PageProps<'/[locale]/topics/[slug]'>): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const topic = await getTopic(slug).catch(() => null);
  return topic ? { title: locale === 'vi' ? topic.nameVi : topic.nameEn } : {};
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default function TopicPage({ params, searchParams }: PageProps<'/[locale]/topics/[slug]'>) {
  return (
    <Page>
      <Suspense fallback={<div className="h-[420px] rounded-[22px] bg-surface" aria-hidden />}>
        <Topic params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Topic({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sub = one(sp.sub);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [topic, viewer, locale, t] = await Promise.all([getTopic(slug), getViewer(), getLocale(), getTranslations('Topics')]);
  if (!topic) notFound();

  const listTopic = sub && topic.children.some((c) => c.slug === sub) ? sub : topic.slug;
  const query = new URLSearchParams({ topic: listTopic, status: 'all', page: String(page), pageSize: '24' });
  const words = (await optionalUserGet<WordList>(`/words?${query}`)) as WordList;
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);
  const description = locale === 'vi' ? topic.descriptionVi : topic.descriptionEn;

  return (
    <>
      <Link href={topic.parent ? `/topics/${topic.parent.slug}` : '/topics'} className="btn btn-ghost -ml-2.5 mb-3">
        <ChevronLeft size={18} aria-hidden />
        {topic.parent ? name(topic.parent) : t('title')}
      </Link>

      <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight">{name(topic)}</h1>
          <p className="mt-1 max-w-[62ch] text-[16px] text-muted">
            {description ?? t('topicLede', { count: topic.totalWords, subtopics: topic.children.length })}
          </p>
        </div>
        {topic.totalWords > 0 && (
          <div className="flex flex-wrap gap-3">
            <Link href={`/learn?topic=${listTopic}&start=1`} className="btn btn-primary">
              {t('learnTopic')}
            </Link>
            <Link href={`/flashcards?mode=practice&start=1&source=all&topic=${listTopic}`} className="btn btn-secondary">
              {t('practiceTopic')}
            </Link>
          </div>
        )}
      </header>

      {topic.children.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label={t('subtopics')}>
          <Link href={`/topics/${topic.slug}`} className="chip" aria-current={listTopic === topic.slug ? 'page' : undefined}>
            {t('allSubtopics')}
          </Link>
          {topic.children.map((c) => (
            <Link
              key={c.slug}
              href={`/topics/${topic.slug}?sub=${c.slug}`}
              className="chip"
              aria-current={listTopic === c.slug ? 'page' : undefined}
            >
              {name(c)}
              <span className="num text-[13px] opacity-70">{c._count.words}</span>
            </Link>
          ))}
        </nav>
      )}

      <WordListView
        data={words}
        status="all"
        basePath={`/topics/${topic.slug}`}
        query={sub ? { sub } : {}}
        signedIn={Boolean(viewer)}
      />
    </>
  );
}
