import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ForecastBars } from '@/components/charts/forecast-bars';
import { Heatmap } from '@/components/charts/heatmap';
import { MasteryLadder } from '@/components/charts/mastery-ladder';
import { Page } from '@/components/shell/app-shell';
import { Link } from '@/i18n/navigation';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';
import type { ProgressData } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Progress');
  return { title: t('title') };
}

export default async function ProgressPage() {
  const t = await getTranslations('Progress');
  return (
    <Page>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('title')}</h1>
      </header>
      <Suspense fallback={<div className="h-[520px] rounded-[22px] bg-surface" aria-hidden />}>
        <ProgressView />
      </Suspense>
    </Page>
  );
}

async function ProgressView() {
  const [data, t, td, locale] = await Promise.all([
    userGet<ProgressData>('/study/progress', '/progress'),
    getTranslations('Progress'),
    getTranslations('Dashboard'),
    getLocale(),
  ]);
  const { totals, today } = data;
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);
  const learnedLevels = data.byLevel.filter((l) => l.total > 0);
  const topics = [...data.byTopic].sort((a, b) => b.learned - a.learned || b.total - a.total);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <p className="-mt-4 mb-2 text-[17px] text-muted lg:col-span-12">
        {totals.learned === 0
          ? t('findingFirst')
          : t('finding', { learned: totals.learned, days: totals.daysStudied, streak: today.streak })}
      </p>

      {/* Totals: one divided strip */}
      <section className="panel grid grid-cols-2 gap-y-4 sm:grid-cols-4 lg:col-span-12" aria-label={t('totals')}>
        {(
          [
            ['learned', formatNumber(totals.learned, locale)],
            ['reviews', formatNumber(totals.reviews, locale)],
            ['time', formatDuration(totals.seconds, locale)],
            ['longest', td('days', { count: today.longestStreak })],
          ] as const
        ).map(([key, value], i) => (
          <div key={key} className={`px-4 ${i > 0 ? 'sm:border-l sm:border-line-strong' : ''} ${i % 2 === 1 ? 'border-l border-line-strong sm:border-l' : ''}`}>
            <p className="text-[14px] font-bold text-muted">{t(`total_${key}`)}</p>
            <p className="num text-[24px] font-extrabold">{value}</p>
          </div>
        ))}
      </section>

      <section className="card p-5 lg:col-span-12" aria-labelledby="heat-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="heat-title" className="text-[17px] font-extrabold">
            {t('heatmapTitle')}
          </h2>
          <span className="text-[13px] text-muted">{t('daysStudied', { count: totals.daysStudied })}</span>
        </div>
        <Heatmap today={today.date} days={data.heatmap} />
      </section>

      <section className="panel lg:col-span-5" aria-labelledby="mastery-title">
        <h2 id="mastery-title" className="mb-4 text-[17px] font-extrabold">
          {t('masteryTitle')}
        </h2>
        <MasteryLadder counts={data.mastery} />
      </section>

      <section className="panel lg:col-span-7" aria-labelledby="levels-title">
        <h2 id="levels-title" className="mb-4 text-[17px] font-extrabold">
          {t('levelsTitle')}
        </h2>
        <ul className="flex flex-col gap-3">
          {learnedLevels.map((l) => (
            <li key={l.level} className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
              <Link href={`/words?status=new&level=${l.level}`} className="pill justify-center no-underline">
                {l.level}
              </Link>
              {/* Learned (pale) with mastered (deep) inside it, against the level's total */}
              <span className="relative block h-3 overflow-hidden rounded-full bg-m0">
                <span className="absolute inset-y-0 left-0 rounded-full bg-m2" style={{ width: `${(l.learned / l.total) * 100}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-m5" style={{ width: `${(l.mastered / l.total) * 100}%` }} />
              </span>
              <span className="num w-24 text-right text-[14px] font-bold">
                {l.learned}
                <span className="text-muted">/{l.total}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full bg-m2" />
            {t('legendLearned')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full bg-m5" />
            {t('legendMastered')}
          </span>
        </p>
      </section>

      <section className="card p-5 lg:col-span-7" aria-labelledby="forecast-title">
        <h2 id="forecast-title" className="mb-4 text-[17px] font-extrabold">
          {td('forecastTitle')}
        </h2>
        <ForecastBars days={data.forecast} todayLabel={td('today')} />
      </section>

      <section className="panel lg:col-span-5" aria-labelledby="recall-title">
        <h2 id="recall-title" className="mb-1 text-[17px] font-extrabold">
          {t('recallTitle')}
        </h2>
        <p className="mb-4 text-[13px] text-muted">{t('recallLede')}</p>
        {data.weeklyRecall.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line-strong px-4 py-4 text-[14px] text-muted">{t('recallEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {data.weeklyRecall.map((w) => (
              <li key={w.week} className="grid grid-cols-[96px_1fr_48px] items-center gap-3 text-[14px]">
                <span className="text-muted">{t('weekOf', { date: formatDate(w.week, locale, { year: undefined }) })}</span>
                <span className="block h-3 overflow-hidden rounded-full bg-m0">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${w.rate * 100}%` }} />
                </span>
                <span className="num text-right font-extrabold" title={t('reviewsCount', { count: w.total })}>
                  {Math.round(w.rate * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel lg:col-span-12" aria-labelledby="topics-title">
        <h2 id="topics-title" className="mb-4 text-[17px] font-extrabold">
          {t('topicsTitle')}
        </h2>
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/topics/${topic.slug}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-ink no-underline hover:text-accent-ink">
                <span className="truncate text-[15px] font-bold">{name(topic)}</span>
                <span className="num text-[14px] text-muted">
                  {topic.learned}/{topic.total}
                </span>
                <span className="col-span-2 block h-2 overflow-hidden rounded-full bg-m0">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(topic.learned / topic.total) * 100}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
