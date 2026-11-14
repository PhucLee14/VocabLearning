import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { DemoCard } from '@/components/demo-card';
import { Island } from '@/components/island/island';
import { IslandStop } from '@/components/island/stop';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { landingData } from '@/lib/landing-data';
import { CEFR_LEVELS } from '@/lib/types';

/**
 * Landing page with the 3D "Word Island" behind it (PLAN.md Phase 3d).
 *
 * Every section is one screen-high "floor" of ordinary HTML in a narrow column
 * (`IslandStop`), and scrolling snaps from floor to floor. The island is a
 * fixed canvas behind the page: its camera moves to one stop per floor, and the
 * island and the text swap sides from one floor to the next. Without WebGL the page is the same, minus
 * the island.
 */
export default async function LandingPage() {
  const [{ topics, levels, demo }, locale, t] = await Promise.all([landingData(), getLocale(), getTranslations('Landing')]);
  const totalWords = Object.values(levels).reduce((n, c) => n + c, 0);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <>
      <Island topicSlugs={topics.map((topic) => topic.slug)} />

      {/* Hero: what it is. The island shows whole. */}
      <IslandStop stop="hero" panel="narrow">
        <h1 className="text-[36px] leading-[1.05] font-black tracking-tight sm:text-[48px]">{t('title')}</h1>
        <p className="mt-5 text-[17px] text-muted sm:text-[18px]">{t('lede')}</p>
        <div className="mt-7 flex flex-wrap gap-3">
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
      </IslandStop>

      {/* A real card to try. The island shows its own card on the first stepping stone. */}
      {demo.length > 0 && (
        <IslandStop stop="try" panel="never">
          <DemoCard words={demo} />
        </IslandStop>
      )}

      {/* The island shows the stepping-stone path of the review schedule. */}
      <IslandStop stop="how">
        <HowItWorks />
      </IslandStop>

      {/* CEFR levels with the real word counts. The island shows the mountain. */}
      <IslandStop stop="levels">
        <h2 className="text-[28px] font-extrabold tracking-tight">{t('levelsTitle')}</h2>
        <p className="mt-2 text-[16px] text-muted">{t('levelsLede')}</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CEFR_LEVELS.map((level) => (
            <li key={level} className="rounded-[18px] bg-surface p-4">
              <p className="text-[24px] font-black">{level}</p>
              <p className="text-[14px] font-bold">{t(`level_${level}`)}</p>
              <p className="num mt-1 text-[13px] text-muted">{t('levelWords', { count: levels[level] ?? 0 })}</p>
            </li>
          ))}
        </ul>
      </IslandStop>

      {/* The island shows the topic district. */}
      {topics.length > 0 && (
        <IslandStop stop="topics">
          <h2 className="text-[28px] font-extrabold tracking-tight">{t('topicsTitle')}</h2>
          <p className="mt-2 text-[16px] text-muted">{t('topicsLede')}</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic.slug}>
                <Link href={`/topics/${topic.slug}`} className="chip">
                  {name(topic)}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/topics" className="btn btn-secondary mt-6">
            {t('topicsAll')}
          </Link>
        </IslandStop>
      )}

      {/* Call to action. The camera pulls back to the whole island. */}
      <IslandStop stop="close">
        <h2 className="text-[28px] leading-tight font-extrabold tracking-tight">{t('closeTitle')}</h2>
        <Link href="/register" className="btn btn-primary btn-lg mt-6">
          {t('ctaPrimary')}
        </Link>
      </IslandStop>
    </>
  );
}

/** The three moves of the method, with the spaced-repetition ladder drawn from its real intervals. */
function HowItWorks() {
  const t = useTranslations('Landing');
  const ladder = ['10m', '1d', '3d', '8d', '3w', '2mo'] as const;
  return (
    <>
      <h2 className="text-[28px] font-extrabold tracking-tight">{t('howTitle')}</h2>
      <div className="mt-5 grid gap-4">
        <div>
          <h3 className="text-[18px] font-extrabold">{t('learnTitle')}</h3>
          <p className="mt-1 text-[15px] text-muted">{t('learnBody')}</p>
        </div>
        <div>
          <h3 className="text-[18px] font-extrabold">{t('reviewTitle')}</h3>
          <p className="mt-1 text-[15px] text-muted">{t('reviewBody')}</p>
        </div>
        <div>
          <h3 className="text-[18px] font-extrabold">{t('trackTitle')}</h3>
          <p className="mt-1 text-[15px] text-muted">{t('trackBody')}</p>
        </div>
      </div>
      {/* Same colours as the island's stepping stones: the mastery ramp m0 → m5. */}
      <figure className="mt-6 rounded-[18px] bg-surface p-4">
        <ol className="flex items-end gap-1.5 sm:gap-2" aria-label={t('ladderLabel')}>
          {ladder.map((step, i) => (
            <li key={step} className="flex flex-1 flex-col items-center gap-2">
              <span
                className="w-full rounded-t-[10px] rounded-b-[4px]"
                style={{ height: 14 + i * 12, background: `var(--m${i})` }}
              />
              <span className="text-[11px] font-extrabold whitespace-nowrap sm:text-[13px]">{t(`ladder_${step}`)}</span>
            </li>
          ))}
        </ol>
        <figcaption className="mt-3 text-[13px] text-muted">{t('ladderCaption')}</figcaption>
      </figure>
    </>
  );
}
