import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { LearnSession } from '@/components/study/learn-session';
import { StudyFilters } from '@/components/study/study-filters';
import { Link } from '@/i18n/navigation';
import { getSettings, userGet } from '@/lib/server-api';
import type { LearnQueue, Summary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Nav');
  return { title: t('learn') };
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default function LearnPage({ searchParams }: PageProps<'/[locale]/learn'>) {
  return (
    <Page>
      <Suspense fallback={<div className="mx-auto h-[520px] max-w-[680px] rounded-[22px] bg-surface" aria-hidden />}>
        <Learn searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Learn({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const topic = one(sp.topic);
  const level = one(sp.level);
  const limit = ['5', '10', '15', '20'].includes(one(sp.limit)) ? one(sp.limit) : '';
  const t = await getTranslations('Learn');

  if (one(sp.start) === '1') {
    const query = new URLSearchParams();
    if (topic) query.set('topic', topic);
    if (level) query.set('level', level);
    if (limit) query.set('limit', limit);
    const [queue, settings] = await Promise.all([
      userGet<LearnQueue>(`/study/learn?${query}`, '/learn'),
      getSettings(),
    ]);
    if (queue.words.length > 0) {
      return <LearnSession key={`${query}-${queue.words[0].id}`} queue={queue} showVietnamese={settings.showVietnamese} />;
    }
    return (
      <>
        <Heading />
        <div className="mb-5 flex flex-col items-start gap-3 rounded-[22px] bg-warning-soft px-5 py-4 text-warning-ink">
          <p className="text-[16px] font-bold">{t('emptyFilter')}</p>
          <Link href="/flashcards?mode=practice" className="font-bold">
            {t('emptyPractice')}
          </Link>
        </div>
        <StudyFilters path="/learn" hidden={{ start: '1' }} defaults={{ topic, level, limit }} withCount submitLabel={t('start')} />
      </>
    );
  }

  return (
    <>
      <Heading />
      <StudyFilters path="/learn" hidden={{ start: '1' }} defaults={{ topic, level, limit }} withCount submitLabel={t('start')} />
    </>
  );
}

async function Heading() {
  const [t, summary] = await Promise.all([getTranslations('Learn'), userGet<Summary>('/study/summary', '/learn')]);
  return (
    <header className="mb-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[16px] text-muted">
        {t('lede', { today: summary.today.newWords, available: summary.newAvailable })}
      </p>
    </header>
  );
}
