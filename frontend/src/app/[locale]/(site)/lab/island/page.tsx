import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Island } from '@/components/island/island';
import { IslandStop } from '@/components/island/stop';
import { Link } from '@/i18n/navigation';
import { landingData } from '@/lib/landing-data';
import { CEFR_LEVELS } from '@/lib/types';

/**
 * Prototype of the 3D landing page ("Word Island", PLAN.md Phase 3d): the
 * scene, the camera path and the scroll sync, with the landing page's own copy
 * as stand-in sections. Not linked from anywhere and not indexed.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function IslandLabPage() {
  const [{ topics, levels }, t] = await Promise.all([landingData(), getTranslations('Landing')]);

  return (
    <>
      <Island topicSlugs={topics.map((topic) => topic.slug)} debug />

      <IslandStop stop="hero">
        <h1 className="text-[32px] leading-[1.1] font-black tracking-tight">{t('title')}</h1>
        <p className="mt-3 text-[16px] text-muted">{t('lede')}</p>
      </IslandStop>

      <IslandStop stop="how">
        <h2 className="text-[26px] font-extrabold tracking-tight">{t('howTitle')}</h2>
        <p className="mt-3 text-[16px] text-muted">{t('reviewBody')}</p>
      </IslandStop>

      <IslandStop stop="levels">
        <h2 className="text-[26px] font-extrabold tracking-tight">{t('levelsTitle')}</h2>
        <p className="mt-3 text-[16px] text-muted">{t('levelsLede')}</p>
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {CEFR_LEVELS.map((level) => (
            <li key={level} className="rounded-[14px] bg-surface px-3 py-2">
              <p className="text-[18px] font-black">{level}</p>
              <p className="num text-[13px] text-muted">{t('levelWords', { count: levels[level] ?? 0 })}</p>
            </li>
          ))}
        </ul>
      </IslandStop>

      <IslandStop stop="topics">
        <h2 className="text-[26px] font-extrabold tracking-tight">{t('topicsTitle')}</h2>
        <p className="mt-3 text-[16px] text-muted">{t('topicsLede')}</p>
      </IslandStop>

      <IslandStop stop="close">
        <h2 className="text-[26px] leading-tight font-extrabold tracking-tight">{t('closeTitle')}</h2>
        <Link href="/register" className="btn btn-primary btn-lg mt-5">
          {t('ctaPrimary')}
        </Link>
      </IslandStop>
    </>
  );
}
