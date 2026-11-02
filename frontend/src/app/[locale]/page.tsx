import { useTranslations } from 'next-intl';
import { Suspense, type ReactNode } from 'react';
import {
  TocLink,
  TopicSections,
  TopicSectionsSkeleton,
  TopicStats,
  TopicToc,
} from '@/components/topic-list';
import type { CefrLevel } from '@/lib/types';

/** Roadmap phase each feature ships in (PLAN.md §9). Phase 1 = next release. */
const FEATURES = [
  { key: 'srs', phase: 1 },
  { key: 'english', phase: 1 },
  { key: 'topics', phase: 1 },
  { key: 'notes', phase: 1 },
  { key: 'progress', phase: 2 },
  { key: 'reminders', phase: 2 },
] as const;

/** CEFR bands; the badge fades from basic (solid) to proficient (dashed). */
const BANDS = [
  { key: 'A', levels: ['A1', 'A2'], badge: 'badge-solid' },
  { key: 'B', levels: ['B1', 'B2'], badge: 'badge-soft' },
  { key: 'C', levels: ['C1', 'C2'], badge: 'badge-dashed' },
] as const satisfies readonly { key: string; levels: readonly CefrLevel[]; badge: string }[];

const featureAnchor = (key: string) => `feature-${key}`;

export default function HomePage() {
  const t = useTranslations('Home');

  return (
    <div className="mx-auto max-w-[1160px] px-4 pt-10 pb-[72px]">
      {/* Header */}
      <header>
        <p className="eyebrow mb-2.5">{t('eyebrow')}</p>
        <h1 className="m-0 font-mono text-[clamp(28px,5vw,44px)] leading-[1.12] font-bold tracking-[-0.02em] text-balance">
          {t('title')}
        </h1>
        <p className="mt-3.5 max-w-[64ch] text-base text-muted">{t('subtitle')}</p>

        {/* CEFR bands */}
        <h2 className="mt-7 mb-0 font-mono text-[11px] font-normal tracking-[0.08em] text-muted uppercase">
          {t('levelsTitle')}
        </h2>
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-7 gap-y-4">
          {BANDS.map((band) => (
            <div key={band.key} className="min-w-0 border-t border-line pt-2.5">
              <span className={`badge ${band.badge}`}>{t(`bands.${band.key}.name`)}</span>
              <p className="mt-1.5 mb-0 max-w-[48ch]">{t(`bands.${band.key}.body`)}</p>
              <p className="mt-1.5 mb-0 font-mono text-xs text-muted">
                {band.levels.map((level) => `${level} ${t(`levels.${level}`)}`).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </header>

      {/* Status strip */}
      <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3.5 border-y border-line py-3.5">
        <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[13px] text-muted">{t('statsLabel')}</span>
          <Suspense fallback={<span className="h-4 w-48 animate-pulse rounded bg-line" />}>
            <TopicStats />
          </Suspense>
        </div>
        <p className="m-0 text-[13px] text-muted">{t('status')}</p>
        <a href="#part-b" className="btn-outline">
          {t('cta')} <span aria-hidden>↓</span>
        </a>
      </div>

      <div className="grid gap-10 min-[960px]:grid-cols-[220px_minmax(0,1fr)]">
        {/* Contents rail (desktop) */}
        <nav
          aria-label={t('tocLabel')}
          className="hidden min-[960px]:sticky min-[960px]:top-[76px] min-[960px]:block min-[960px]:max-h-[calc(100vh-96px)] min-[960px]:self-start min-[960px]:overflow-auto min-[960px]:pt-10"
        >
          <TocHeading>{`A · ${t('featuresShort')}`}</TocHeading>
          <ol>
            {FEATURES.map((f, i) => (
              <li key={f.key}>
                <TocLink
                  href={`#${featureAnchor(f.key)}`}
                  code={`A${i + 1}`}
                  label={t(`features.${f.key}.title`)}
                />
              </li>
            ))}
          </ol>
          <TocHeading>{`B · ${t('topicsShort')}`}</TocHeading>
          <Suspense fallback={null}>
            <TopicToc />
          </Suspense>
        </nav>

        <div className="min-w-0">
          {/* Part A: features */}
          <section id="part-a" aria-labelledby="part-a-title" className="mt-10 scroll-mt-20">
            <PartHead letter="A" titleId="part-a-title" title={t('featuresTitle')}>
              {t('featuresLede')}
            </PartHead>
            <ul className="grid border-t border-line">
              {FEATURES.map((f, i) => (
                <li
                  key={f.key}
                  id={featureAnchor(f.key)}
                  className="flex scroll-mt-20 items-start gap-3 border-t border-line py-3 first:border-t-0"
                >
                  <span className="w-7 flex-none pt-0.5 font-mono text-xs font-semibold text-accent">
                    A{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-[15px] font-semibold">{t(`features.${f.key}.title`)}</h3>
                    <p className="mt-0.5 mb-0 max-w-[68ch] text-muted">
                      {t(`features.${f.key}.body`)}
                    </p>
                  </div>
                  <span className={`badge mt-0.5 ${f.phase === 1 ? 'badge-solid' : 'badge-soft'}`}>
                    {t(f.phase === 1 ? 'phase1' : 'phase2')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Part B: topics (from the backend) */}
          <section id="part-b" aria-labelledby="part-b-title" className="mt-10 scroll-mt-20">
            <PartHead letter="B" titleId="part-b-title" title={t('topicsTitle')}>
              {t('topicsLede')}
            </PartHead>
            <Suspense fallback={<TopicSectionsSkeleton />}>
              <TopicSections />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}

function PartHead({
  letter,
  titleId,
  title,
  children,
}: {
  letter: string;
  titleId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 pb-[18px]">
      <span aria-hidden className="font-mono text-[44px] leading-none font-bold text-accent">
        {letter}
      </span>
      <div>
        <h2 id={titleId} className="mt-0.5 mb-1.5 text-[26px] font-bold tracking-[-0.01em] text-balance">
          {title}
        </h2>
        <p className="m-0 max-w-[62ch] text-muted">{children}</p>
      </div>
    </div>
  );
}

function TocHeading({ children }: { children: string }) {
  return (
    <p className="mt-5 mb-1.5 font-mono text-[11px] tracking-[0.08em] text-muted uppercase first:mt-0">
      {children}
    </p>
  );
}
