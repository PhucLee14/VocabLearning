import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { FlashcardSession } from '@/components/study/flashcard-session';
import { StudyFilters } from '@/components/study/study-filters';
import { Link } from '@/i18n/navigation';
import { getSettings, userGet } from '@/lib/server-api';
import type { StudyItem, Summary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Nav');
  return { title: t('flashcards') };
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default function FlashcardsPage({ searchParams }: PageProps<'/[locale]/flashcards'>) {
  return (
    <Page>
      <Suspense fallback={<div className="mx-auto h-[520px] max-w-[680px] rounded-[22px] bg-surface" aria-hidden />}>
        <Flashcards searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Flashcards({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const mode = one(sp.mode) === 'practice' ? 'practice' : 'review';
  const [t, settings] = await Promise.all([getTranslations('Flashcards'), getSettings()]);

  if (mode === 'review') {
    const data = await userGet<{ totalDue: number; items: StudyItem[] }>('/study/review?limit=50', '/flashcards');
    if (data.items.length > 0) {
      return <FlashcardSession items={data.items} mode="REVIEW" showVietnamese={settings.showVietnamese} />;
    }
    return (
      <>
        <Heading mode="review" />
        <ReviewEmpty />
      </>
    );
  }

  const topic = one(sp.topic);
  const level = one(sp.level);
  const source = one(sp.source) === 'all' ? 'all' : 'learned';
  if (one(sp.start) === '1') {
    const query = new URLSearchParams({ limit: '20', source });
    if (topic) query.set('topic', topic);
    if (level) query.set('level', level);
    const data = await userGet<{ items: StudyItem[] }>(`/study/practice?${query}`, '/flashcards?mode=practice');
    if (data.items.length > 0) {
      return (
        <FlashcardSession
          key={query.toString()}
          items={data.items}
          mode="PRACTICE"
          showVietnamese={settings.showVietnamese}
          exitHref="/flashcards?mode=practice"
        />
      );
    }
    return (
      <>
        <Heading mode="practice" />
        <p className="mb-5 rounded-2xl bg-warning-soft px-4 py-3 text-[15px] text-warning-ink">
          {source === 'learned' ? t('practiceEmptyLearned') : t('practiceEmpty')}
        </p>
        <StudyFilters
          path="/flashcards"
          hidden={{ mode: 'practice', start: '1' }}
          defaults={{ topic, level, source }}
          withSource
          submitLabel={t('startPractice')}
        />
      </>
    );
  }

  return (
    <>
      <Heading mode="practice" />
      <StudyFilters
        path="/flashcards"
        hidden={{ mode: 'practice', start: '1' }}
        defaults={{ topic, level, source }}
        withSource
        submitLabel={t('startPractice')}
      />
    </>
  );
}

async function Heading({ mode }: { mode: 'review' | 'practice' }) {
  const t = await getTranslations('Flashcards');
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[16px] text-muted">{mode === 'review' ? t('reviewLede') : t('practiceLede')}</p>
      </div>
      <nav className="seg" aria-label={t('modeLabel')}>
        <Link href="/flashcards" aria-current={mode === 'review' ? 'page' : undefined}>
          {t('modeReview')}
        </Link>
        <Link href="/flashcards?mode=practice" aria-current={mode === 'practice' ? 'page' : undefined}>
          {t('modePractice')}
        </Link>
      </nav>
    </header>
  );
}

async function ReviewEmpty() {
  const [t, locale, summary] = await Promise.all([
    getTranslations('Flashcards'),
    getLocale(),
    userGet<Summary>('/study/summary', '/flashcards'),
  ]);
  const next = summary.forecast.find((d) => d.count > 0);
  return (
    <section className="panel flex flex-col items-start gap-4 sm:p-8">
      <h2 className="text-[20px] font-extrabold">{t('nothingDue')}</h2>
      <p className="text-[16px] text-muted">
        {summary.learnedCount === 0
          ? t('nothingLearned')
          : next
            ? t('nextDue', {
                count: next.count,
                // Calendar days from today, in the learner's timezone: "today", "tomorrow", "in 3 days".
                when: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
                  Math.round((Date.parse(next.date) - Date.parse(summary.today.date)) / 86_400_000),
                  'day',
                ),
              })
            : t('nothingThisWeek')}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/learn" className="btn btn-primary">
          {t('learnMore')}
        </Link>
        {summary.learnedCount > 0 && (
          <Link href="/flashcards?mode=practice" className="btn btn-secondary">
            {t('modePractice')}
          </Link>
        )}
      </div>
    </section>
  );
}
