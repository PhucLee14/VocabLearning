import { Flame } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Avatar } from '@/components/avatar';
import { ProfileForm } from '@/components/forms/profile-form';
import { Page } from '@/components/shell/app-shell';
import { Link } from '@/i18n/navigation';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';
import type { Profile, ProgressData } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Profile');
  return { title: t('title') };
}

export default function ProfilePage() {
  return (
    <Page>
      <Suspense fallback={<div className="h-[520px] rounded-[22px] bg-surface" aria-hidden />}>
        <ProfileView />
      </Suspense>
    </Page>
  );
}

async function ProfileView() {
  const [profile, progress, t, td, locale] = await Promise.all([
    userGet<Profile>('/me', '/profile'),
    userGet<ProgressData>('/study/progress', '/profile'),
    getTranslations('Profile'),
    getTranslations('Dashboard'),
    getLocale(),
  ]);
  const { totals, today } = progress;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center lg:col-span-12">
        <Avatar id={profile.id} name={profile.name} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-extrabold tracking-tight">{profile.name}</h1>
          <p className="text-[15px] text-muted">
            {profile.email} · {t('memberSince', { date: formatDate(profile.createdAt, locale, { day: undefined }) })}
          </p>
          {profile.bio && <p className="mt-2 max-w-[60ch] text-[16px]">{profile.bio}</p>}
        </div>
        {profile.targetLevel && (
          <p className="pill pill-accent !min-h-9 !px-4 !text-[15px]">{t('aimingFor', { level: profile.targetLevel })}</p>
        )}
      </header>

      {/* Study record */}
      <section className="panel grid grid-cols-2 gap-y-5 sm:grid-cols-4 lg:col-span-12" aria-label={t('statsTitle')}>
        <div className="px-4">
          <p className="text-[14px] font-bold text-muted">{td('streak')}</p>
          <p className="num flex items-center gap-1.5 text-[24px] font-extrabold">
            <Flame size={22} aria-hidden className={today.streak > 0 ? 'text-streak' : 'text-line-strong'} />
            {td('days', { count: today.streak })}
          </p>
        </div>
        <div className="border-l border-line-strong px-4">
          <p className="text-[14px] font-bold text-muted">{t('wordsLearned')}</p>
          <p className="num text-[24px] font-extrabold">{formatNumber(totals.learned, locale)}</p>
        </div>
        <div className="px-4 sm:border-l sm:border-line-strong">
          <p className="text-[14px] font-bold text-muted">{t('daysStudied')}</p>
          <p className="num text-[24px] font-extrabold">{formatNumber(totals.daysStudied, locale)}</p>
        </div>
        <div className="border-l border-line-strong px-4">
          <p className="text-[14px] font-bold text-muted">{t('studyTime')}</p>
          <p className="num text-[24px] font-extrabold">{formatDuration(totals.seconds, locale)}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:col-span-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-10">
        <div>
          <h2 className="text-[18px] font-extrabold">{t('detailsTitle')}</h2>
          <p className="mt-1 text-[15px] text-muted">{t('detailsLede')}</p>
          <Link href="/settings" className="btn btn-ghost mt-3 -ml-2.5">
            {t('toSettings')}
          </Link>
        </div>
        <div className="panel">
          <ProfileForm profile={profile} />
        </div>
      </section>
    </div>
  );
}
