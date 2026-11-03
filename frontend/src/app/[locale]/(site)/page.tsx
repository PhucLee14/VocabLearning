import { cacheLife } from 'next/cache';
import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { DemoCard } from '@/components/demo-card';
import { Link } from '@/i18n/navigation';
import { apiGet } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { CEFR_LEVELS, type TopicNode, type WordDetail, type WordList } from '@/lib/types';

/**
 * Public data for the landing page, cached so the page stays in the static
 * shell. If the API is down (e.g. while building), the page still renders
 * without the numbers and the demo card.
 */
async function landingData() {
  'use cache';
  cacheLife('hours');
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
    return { topics, levels, demo };
  } catch {
    return { topics: [] as TopicNode[], levels: {} as Record<string, number>, demo: [] };
  }
}

export default async function LandingPage() {
  const [{ topics, levels, demo }, locale, t] = await Promise.all([landingData(), getLocale(), getTranslations('Landing')]);
  const totalWords = Object.values(levels).reduce((n, c) => n + c, 0);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <>
      {/* Hero: what it is, and a real card to try */}
      <section className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-20">
        <div>
          <h1 className="text-[40px] leading-[1.05] font-black tracking-tight sm:text-[56px]">{t('title')}</h1>
          <p className="mt-5 max-w-[52ch] text-[18px] text-muted">{t('lede')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary btn-lg">
              {t('ctaPrimary')}
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              {t('ctaSecondary')}
            </Link>
          </div>
          {totalWords > 0 && (
            <p className="mt-6 text-[15px] text-muted">
              {t('stats', {
                words: formatNumber(totalWords, locale),
                topics: topics.length,
                subtopics: topics.reduce((n, x) => n + x.children.length, 0),
              })}
            </p>
          )}
        </div>
        <DemoCard words={demo} />
      </section>

      <HowItWorks />

      {/* CEFR levels with the real word counts */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
          <h2 className="text-[30px] font-extrabold tracking-tight">{t('levelsTitle')}</h2>
          <p className="mt-2 max-w-[60ch] text-[16px] text-muted">{t('levelsLede')}</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CEFR_LEVELS.map((level) => (
              <li key={level} className="rounded-[22px] bg-raised p-5">
                <p className="text-[28px] font-black">{level}</p>
                <p className="text-[15px] font-bold">{t(`level_${level}`)}</p>
                <p className="num mt-2 text-[14px] text-muted">{t('levelWords', { count: levels[level] ?? 0 })}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {topics.length > 0 && (
        <section className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[30px] font-extrabold tracking-tight">{t('topicsTitle')}</h2>
              <p className="mt-2 max-w-[60ch] text-[16px] text-muted">{t('topicsLede')}</p>
            </div>
            <Link href="/topics" className="btn btn-secondary">
              {t('topicsAll')}
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {topics.map((topic) => (
              <li key={topic.slug}>
                <Link href={`/topics/${topic.slug}`} className="chip !min-h-11 !px-5 !text-[15px]">
                  {name(topic)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-accent text-on-accent">
        <div className="mx-auto flex max-w-[1100px] flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-[30ch] text-[30px] leading-tight font-extrabold tracking-tight">{t('closeTitle')}</h2>
          <Link href="/register" className="btn btn-lg border-white border-b-black/25 bg-white text-accent-lip">
            {t('ctaPrimary')}
          </Link>
        </div>
      </section>
    </>
  );
}

/** The three moves of the method, with the spaced-repetition ladder drawn from its real intervals. */
function HowItWorks() {
  const t = useTranslations('Landing');
  const ladder = ['10m', '1d', '3d', '8d', '3w', '2mo'] as const;
  return (
    <section className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
      <h2 className="text-[30px] font-extrabold tracking-tight">{t('howTitle')}</h2>
      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div>
          <h3 className="text-[20px] font-extrabold">{t('learnTitle')}</h3>
          <p className="mt-2 text-[16px] text-muted">{t('learnBody')}</p>
        </div>
        <div>
          <h3 className="text-[20px] font-extrabold">{t('reviewTitle')}</h3>
          <p className="mt-2 text-[16px] text-muted">{t('reviewBody')}</p>
        </div>
        <div>
          <h3 className="text-[20px] font-extrabold">{t('trackTitle')}</h3>
          <p className="mt-2 text-[16px] text-muted">{t('trackBody')}</p>
        </div>
      </div>
      <figure className="mt-10 rounded-[22px] bg-surface p-6">
        <ol className="flex items-end gap-2 sm:gap-3" aria-label={t('ladderLabel')}>
          {ladder.map((step, i) => (
            <li key={step} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={`w-full rounded-t-[12px] rounded-b-[4px] ${i === ladder.length - 1 ? 'bg-accent' : 'bg-m2'}`}
                style={{ height: 18 + i * 22 }}
              />
              <span className="text-[13px] font-extrabold sm:text-[15px]">{t(`ladder_${step}`)}</span>
            </li>
          ))}
        </ol>
        <figcaption className="mt-4 text-[14px] text-muted">{t('ladderCaption')}</figcaption>
      </figure>
    </section>
  );
}
