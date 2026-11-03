import { Flame } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ForecastBars } from '@/components/charts/forecast-bars';
import { GoalRing } from '@/components/charts/goal-ring';
import { MasteryLadder } from '@/components/charts/mastery-ladder';
import { WeekStrip } from '@/components/charts/week-strip';
import { Page } from '@/components/shell/app-shell';
import { LevelPill } from '@/components/word/level-pill';
import { MasteryMeter } from '@/components/word/mastery-meter';
import { Link, redirect } from '@/i18n/navigation';
import { formatNumber, formatRelative } from '@/lib/format';
import { getViewer, userGet } from '@/lib/server-api';
import type { ProgressData, Summary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Nav');
  return { title: t('home') };
}

export default function DashboardPage() {
  return (
    <Page>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </Page>
  );
}

async function Dashboard() {
  const locale = await getLocale();
  const [viewer, summary, progress, t] = await Promise.all([
    getViewer(),
    userGet<Summary>('/study/summary', '/dashboard'),
    userGet<ProgressData>('/study/progress', '/dashboard'),
    getTranslations('Dashboard'),
  ]);
  if (!viewer) return redirect({ href: '/login?next=/dashboard', locale });

  const { today } = summary;
  const firstName = viewer.name.trim().split(/\s+/).at(-1) ?? viewer.name;
  const done = today.newWords + today.reviews;
  const fresh = Math.min(summary.newAvailable, Math.max(0, 10 - today.newWords));

  const finding =
    summary.learnedCount === 0
      ? t('findingFirst', { count: Math.min(10, summary.newAvailable) })
      : summary.dueCount > 0
        ? t('findingDue', { due: summary.dueCount, fresh })
        : t('findingClear', { fresh });

  // Last seven days for the streak strip, from the heatmap (days in the learner's timezone).
  const met = new Map(progress.heatmap.map((d) => [d.date, d.goalMet]));
  const todayDate = new Date(`${today.date}T00:00:00Z`);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(todayDate.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, goalMet: met.get(date) ?? false, isToday: i === 6 };
  });

  const topics = [...progress.byTopic]
    .sort((a, b) => b.learned / b.total - a.learned / a.total || b.total - a.total)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
      {/* Title row: greeting with today's one fact, and the main job one click away */}
      <header className="flex flex-col gap-5 pb-3 col-span-2 lg:col-span-12 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
            {t('greeting', { name: firstName })}
          </h1>
          <p className="mt-2 max-w-[60ch] text-[17px] text-muted">{finding}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {summary.dueCount > 0 ? (
            <>
              <Link href="/flashcards" className="btn btn-primary btn-lg">
                {t('reviewNow', { count: summary.dueCount })}
              </Link>
              <Link href="/learn" className="btn btn-secondary btn-lg">
                {t('learnNew')}
              </Link>
            </>
          ) : (
            <>
              <Link href="/learn" className="btn btn-primary btn-lg">
                {t('learnNew')}
              </Link>
              {summary.learnedCount > 0 && (
                <Link href="/flashcards?mode=practice" className="btn btn-secondary btn-lg">
                  {t('practice')}
                </Link>
              )}
            </>
          )}
        </div>
      </header>

      {/* Today */}
      <section className="panel flex items-center gap-4 col-span-2 lg:col-span-3" aria-labelledby="goal-title">
        <GoalRing value={done} goal={today.goalCards}>
          <span className="num text-[15px] font-extrabold">{Math.min(100, Math.round((done / Math.max(1, today.goalCards)) * 100))}%</span>
        </GoalRing>
        <div className="min-w-0">
          <h2 id="goal-title" className="text-[14px] font-bold text-muted">
            {t('goal')}
          </h2>
          <p className="num text-[24px] font-extrabold">
            {done}
            <span className="text-[15px] font-bold text-muted"> / {today.goalCards}</span>
          </p>
          <p className="text-[13px] text-muted">
            {today.goalMet ? t('goalMet') : t('goalLeft', { count: Math.max(0, today.goalCards - done) })}
          </p>
        </div>
      </section>

      <section className="panel col-span-2 lg:col-span-3" aria-labelledby="streak-title">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="streak-title" className="text-[14px] font-bold text-muted">
              {t('streak')}
            </h2>
            <p className="num text-[24px] font-extrabold">
              {t('days', { count: today.streak })}
            </p>
          </div>
          <Flame size={26} strokeWidth={2.2} aria-hidden className={today.streak > 0 ? 'text-streak' : 'text-line-strong'} />
        </div>
        <div className="mt-3">
          <WeekStrip days={week} />
        </div>
      </section>

      <section className="panel col-span-1 lg:col-span-3" aria-labelledby="due-title">
        <h2 id="due-title" className="text-[14px] font-bold text-muted">
          {t('due')}
        </h2>
        <p className="num text-[24px] font-extrabold">{formatNumber(summary.dueCount, locale)}</p>
        <p className="mt-1 text-[13px] text-muted">
          {summary.dueCount > 0 ? t('dueCaption') : t('dueNone')}
        </p>
        {summary.dueCount > 0 && (
          <Link href="/flashcards" className="btn btn-ghost mt-2 -ml-2.5">
            {t('startReview')}
          </Link>
        )}
      </section>

      <section className="panel col-span-1 lg:col-span-3" aria-labelledby="learned-title">
        <h2 id="learned-title" className="text-[14px] font-bold text-muted">
          {t('learned')}
        </h2>
        <p className="num text-[24px] font-extrabold">{formatNumber(summary.learnedCount, locale)}</p>
        <p className="mt-1 text-[13px] text-muted">
          {t('learnedCaption', { total: formatNumber(summary.totalWords, locale), known: summary.knownCount })}
        </p>
        <Link href="/words?status=learned" className="btn btn-ghost mt-2 -ml-2.5">
          {t('viewWords')}
        </Link>
      </section>

      {/* Next week of reviews: the main chart, the one white card */}
      <section className="card p-5 col-span-2 lg:col-span-8" aria-labelledby="forecast-title">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="forecast-title" className="text-[17px] font-extrabold">
            {t('forecastTitle')}
          </h2>
          <span className="text-[13px] text-muted">
            {t('forecastTotal', { count: summary.forecast.reduce((n, d) => n + d.count, 0) })}
          </span>
        </div>
        <ForecastBars days={summary.forecast} todayLabel={t('today')} />
      </section>

      <section className="panel col-span-2 lg:col-span-4" aria-labelledby="mastery-title">
        <h2 id="mastery-title" className="mb-4 text-[17px] font-extrabold">
          {t('masteryTitle')}
        </h2>
        <MasteryLadder counts={summary.mastery} />
      </section>

      {/* Recent words and topics */}
      <section className="panel col-span-2 lg:col-span-6" aria-labelledby="recent-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="recent-title" className="text-[17px] font-extrabold">
            {t('recentTitle')}
          </h2>
          <Link href="/words?status=learned&sort=recent" className="text-[14px] font-bold">
            {t('viewAll')}
          </Link>
        </div>
        {summary.recent.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line-strong px-4 py-5 text-[15px] text-muted">
            {t('recentEmpty')}{' '}
            <Link href="/learn" className="font-bold">
              {t('learnNew')}
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.recent.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/words/${w.slug}`}
                  className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-raised px-4 py-2 text-ink no-underline hover:outline-2 hover:outline-line-strong"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-extrabold">{w.headword}</span>
                    <span className="block truncate text-[13px] text-muted">{w.meaningVi ?? w.definitionEn}</span>
                  </span>
                  <span className="hidden text-[12px] text-muted sm:block">
                    {w.progress.isKnown ? t('known') : formatRelative(w.progress.due, locale)}
                  </span>
                  <MasteryMeter level={w.progress.masteryLevel} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel col-span-2 lg:col-span-6" aria-labelledby="topics-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="topics-title" className="text-[17px] font-extrabold">
            {t('topicsTitle')}
          </h2>
          <Link href="/topics" className="text-[14px] font-bold">
            {t('viewAll')}
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="flex min-h-[60px] items-center gap-4 rounded-2xl bg-raised px-4 py-2 text-ink no-underline hover:outline-2 hover:outline-line-strong"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-extrabold">
                    {locale === 'vi' ? topic.nameVi : topic.nameEn}
                  </span>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-m0">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${(topic.learned / topic.total) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="num text-[14px] font-bold text-muted">
                  {topic.learned}/{topic.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel flex flex-wrap items-center gap-3 col-span-2 lg:col-span-12" aria-labelledby="levels-title">
        <h2 id="levels-title" className="mr-2 text-[15px] font-extrabold">
          {t('byLevel')}
        </h2>
        {progress.byLevel
          .filter((l) => l.total > 0)
          .map((l) => (
            <Link key={l.level} href={`/words?status=new&level=${l.level}`} className="chip">
              <LevelPill level={l.level} />
              <span className="num">
                {l.learned}/{l.total}
              </span>
            </Link>
          ))}
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  const bar = 'rounded-full bg-sunken';
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-hidden>
      <div className="pb-3 lg:col-span-12">
        <div className={`${bar} h-9 w-64`} />
        <div className={`${bar} mt-3 h-5 w-96 max-w-full`} />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="panel h-[132px] lg:col-span-3" />
      ))}
      <div className="card h-[260px] lg:col-span-8" />
      <div className="panel h-[260px] lg:col-span-4" />
    </div>
  );
}
