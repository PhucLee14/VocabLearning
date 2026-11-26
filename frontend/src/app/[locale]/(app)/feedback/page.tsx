import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FeedbackDialog } from '@/components/feedback/feedback-dialog';
import { MarkRepliesSeen } from '@/components/feedback/mark-replies-seen';
import { Page } from '@/components/shell/app-shell';
import { Link } from '@/i18n/navigation';
import type { FeedbackStatus, MyFeedback } from '@/lib/admin-types';
import { formatDate } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Feedback');
  return { title: t('mineTitle') };
}

export default async function FeedbackPage() {
  const t = await getTranslations('Feedback');
  return (
    <Page narrow>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight">{t('mineTitle')}</h1>
          <p className="mt-1 text-[16px] text-muted">{t('mineLede')}</p>
        </div>
        <FeedbackDialog triggerClassName="btn btn-primary" />
      </header>
      <Suspense fallback={<div className="h-64 rounded-[22px] bg-surface" aria-hidden />}>
        <FeedbackList />
      </Suspense>
    </Page>
  );
}

const STATUS_PILL: Record<FeedbackStatus, string> = {
  OPEN: '',
  IN_PROGRESS: 'pill-streak',
  DONE: 'pill-accent',
  WONT_FIX: '',
};

async function FeedbackList() {
  const [t, locale, data] = await Promise.all([
    getTranslations('Feedback'),
    getLocale(),
    userGet<{ items: MyFeedback[]; unread: number }>('/feedback/mine', '/feedback'),
  ]);
  if (data.items.length === 0) {
    return <p className="rounded-[22px] bg-surface px-6 py-8 text-center text-[16px] text-muted">{t('mineEmpty')}</p>;
  }
  return (
    <>
      {data.unread > 0 && <MarkRepliesSeen />}
      <ul className="flex flex-col gap-3">
        {data.items.map((f) => (
          <li key={f.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="font-extrabold">{t(`type_${f.type}`)}</span>
              <span className={`pill ${STATUS_PILL[f.status]}`}>{t(`status_${f.status}`)}</span>
              <span className="ml-auto text-muted">{t('sentOn', { date: formatDate(f.createdAt, locale) })}</span>
            </div>
            {f.word && (
              <p className="mt-2 text-[14px] text-muted">
                {t('aboutWord')}:{' '}
                <Link href={`/words/${f.word.slug}`} className="font-bold" lang="en">
                  {f.word.headword}
                </Link>{' '}
                <span className="italic">({f.word.pos})</span>
              </p>
            )}
            <p className="mt-3 text-[16px] whitespace-pre-line">{f.message}</p>
            {f.reply ? (
              <div className="mt-4 rounded-2xl bg-accent-soft px-4 py-3">
                <p className="flex items-center gap-2 text-[14px] font-extrabold text-accent-ink">
                  {t('reply')}
                  {!f.replySeenAt && <span className="pill pill-streak">{t('newReply')}</span>}
                  {f.repliedAt && <span className="ml-auto font-bold opacity-80">{formatDate(f.repliedAt, locale)}</span>}
                </p>
                <p className="mt-1 text-[16px] whitespace-pre-line text-ink">{f.reply}</p>
              </div>
            ) : (
              <p className="mt-3 text-[14px] text-muted">{t('noReply')}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
