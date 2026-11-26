import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { UserActions } from '@/components/admin/user-actions';
import { Link } from '@/i18n/navigation';
import type { AdminUserDetail } from '@/lib/admin-types';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { notFound } from 'next/navigation';
import { getViewer, userGetOrNull } from '@/lib/server-api';

/** A short, readable name for a User-Agent string, e.g. "Chrome · Windows". */
function browserName(ua: string | null) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}

export default async function AdminUser({ params }: PageProps<'/[locale]/admin/users/[id]'>) {
  const { id } = await params;
  const [t, locale, user, viewer] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGetOrNull<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`, '/admin/users'),
    getViewer(),
  ]);
  if (!user) notFound();
  const n = (v: number) => formatNumber(v, locale);
  const stats: [string, string][] = [
    [t('statCards'), n(user.counts.cards)],
    [t('statKnown'), n(user.counts.known)],
    [t('statDue'), n(user.counts.due)],
    [t('statReviews'), n(user.counts.reviewLogs)],
    [t('statStreak'), n(user.streak.current)],
    [t('statLongest'), n(user.streak.longest)],
    [t('statNotes'), n(user.counts.notes)],
    [t('statFeedback'), n(user.counts.feedback)],
  ];
  const maxDay = Math.max(1, ...user.days.map((d) => d.reviews + d.newWords));

  return (
    <>
      <Link href="/admin/users" className="btn btn-ghost -ml-2.5 mb-3">
        <ChevronLeft size={18} aria-hidden />
        {t('allUsers')}
      </Link>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{user.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[16px] text-muted">
          {user.email}
          <span className={`pill ${user.role === 'ADMIN' ? 'pill-streak' : ''}`}>{t(`role_${user.role}`)}</span>
          {user.disabledAt && <span className="pill pill-danger">{t('statusDisabled')}</span>}
          {!user.emailVerifiedAt && <span className="pill">{t('statusUnverified')}</span>}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <section className="card p-5" aria-labelledby="study-title">
            <h2 id="study-title" className="mb-3 text-[18px] font-extrabold">
              {t('study')}
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-surface px-3 py-2.5">
                  <dt className="text-[13px] font-bold text-muted">{label}</dt>
                  <dd className="num text-[20px] font-extrabold">{value}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-5 mb-2 text-[15px] font-extrabold">{t('last30')}</h3>
            {user.days.length === 0 ? (
              <p className="text-[14px] text-muted">{t('last30Empty')}</p>
            ) : (
              <ul className="flex h-24 items-end gap-1" aria-label={t('last30')}>
                {user.days.map((d) => {
                  const cards = d.reviews + d.newWords;
                  return (
                    <li
                      key={d.date}
                      title={`${formatDate(d.date, locale)}: ${n(cards)}`}
                      className={`flex-1 rounded-t-md ${d.goalMet ? 'bg-accent' : 'bg-m2'}`}
                      style={{ height: `${Math.max(6, (cards / maxDay) * 100)}%` }}
                    >
                      <span className="sr-only">{`${formatDate(d.date, locale)}: ${n(cards)}`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-5" aria-labelledby="sessions-title">
            <h2 id="sessions-title" className="mb-3 text-[18px] font-extrabold">
              {t('sessions')}
            </h2>
            {user.sessions.length === 0 ? (
              <p className="text-[14px] text-muted">{t('sessionsNone')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {user.sessions.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-surface px-4 py-3 text-[14px]">
                    <p className="font-bold">{browserName(s.userAgent) ?? t('unknownBrowser')}</p>
                    <p className="text-muted">
                      {t('sessionLastUsed', { when: formatRelative(s.lastUsedAt, locale) })} ·{' '}
                      {t('sessionCreated', { date: formatDate(s.createdAt, locale) })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          <section className="panel" aria-labelledby="actions-title">
            <h2 id="actions-title" className="mb-3 text-[17px] font-extrabold">
              {t('actions')}
            </h2>
            <UserActions
              user={{ id: user.id, email: user.email, role: user.role, disabled: user.disabledAt !== null }}
              isSelf={viewer?.id === user.id}
            />
          </section>
          <section className="panel text-[14px]">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="font-bold text-muted">{t('signIn')}</dt>
              <dd>
                {[user.hasPassword && t('methodPassword'), user.hasGoogle && t('methodGoogle')].filter(Boolean).join(', ') ||
                  '—'}
              </dd>
              <dt className="font-bold text-muted">{t('emailVerified')}</dt>
              <dd>{user.emailVerifiedAt ? formatDate(user.emailVerifiedAt, locale) : '—'}</dd>
              <dt className="font-bold text-muted">{t('joined')}</dt>
              <dd>{formatDate(user.createdAt, locale)}</dd>
              <dt className="font-bold text-muted">{t('colLastActive')}</dt>
              <dd>{user.streak.lastActiveDate ? formatDate(user.streak.lastActiveDate, locale) : t('never')}</dd>
              <dt className="font-bold text-muted">{t('language')}</dt>
              <dd>{user.locale}</dd>
              <dt className="font-bold text-muted">{t('timezone')}</dt>
              <dd>{user.timezone}</dd>
              <dt className="font-bold text-muted">{t('target')}</dt>
              <dd>{user.targetLevel ?? '—'}</dd>
            </dl>
            <div className="mt-4 flex flex-col gap-1">
              <Link href={`/admin/feedback?userId=${user.id}`} className="font-bold">
                {t('theirFeedback')}
              </Link>
              <Link href={`/admin/audit?targetType=user&targetId=${user.id}`} className="font-bold">
                {t('theirHistory')}
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
