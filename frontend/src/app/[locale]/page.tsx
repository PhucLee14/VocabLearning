import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { TopicGrid, TopicGridSkeleton } from '@/components/topic-grid';
import { CEFR_LEVELS } from '@/lib/types';

const FEATURES = ['srs', 'english', 'topics', 'progress', 'reminders', 'notes'] as const;

export default function HomePage() {
  const t = useTranslations('Home');

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-20">
      {/* Hero */}
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-primary">{t('eyebrow')}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg text-pretty text-muted">{t('subtitle')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="#topics"
            className="rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('cta')}
          </a>
          <span className="text-sm text-muted">{t('status')}</span>
        </div>
      </section>

      {/* Features */}
      <section className="mt-20" aria-labelledby="features-title">
        <h2 id="features-title" className="text-2xl font-semibold tracking-tight">
          {t('featuresTitle')}
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((key) => (
            <li key={key} className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-medium">{t(`features.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-muted">{t(`features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* CEFR levels */}
      <section className="mt-20" aria-labelledby="levels-title">
        <h2 id="levels-title" className="text-2xl font-semibold tracking-tight">
          {t('levelsTitle')}
        </h2>
        <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CEFR_LEVELS.map((level) => (
            <li key={level} className="rounded-xl border border-border bg-card p-4">
              <span className="text-xl font-semibold text-primary">{level}</span>
              <p className="mt-1 text-sm text-muted">{t(`levels.${level}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Topics (fetched from the backend) */}
      <section id="topics" className="mt-20 scroll-mt-20" aria-labelledby="topics-title">
        <h2 id="topics-title" className="text-2xl font-semibold tracking-tight">
          {t('topicsTitle')}
        </h2>
        <Suspense fallback={<TopicGridSkeleton />}>
          <TopicGrid />
        </Suspense>
      </section>
    </div>
  );
}
