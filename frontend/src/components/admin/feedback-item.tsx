'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/client-api';
import { type AdminFeedback, FEEDBACK_STATUSES, type FeedbackStatus } from '@/lib/admin-types';
import { formatDate, formatRelative } from '@/lib/format';
import { AdminMessage } from './admin-message';
import { useAdminAction } from './use-action';

const STATUS_PILL: Record<FeedbackStatus, string> = {
  OPEN: 'pill-danger',
  IN_PROGRESS: 'pill-streak',
  DONE: 'pill-accent',
  WONT_FIX: '',
};

/** One message in the admin inbox: who, what, where; status and a reply. */
export function FeedbackItem({ item }: { item: AdminFeedback }) {
  const t = useTranslations('Admin');
  const tf = useTranslations('Feedback');
  const locale = useLocale();
  const { run, pending, error, notice } = useAdminAction();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      status,
      reply: String(f.get('reply') ?? ''),
      notify: f.get('notify') === 'on',
    };
    run(() => api<{ mailed: boolean }>(`/admin/feedback/${item.id}`, { method: 'PATCH', body }), {
      done: (r) => (r.mailed ? t('fbMailed') : t('saved')),
    });
  }

  return (
    <article className="card p-5">
      <header className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className={`pill ${STATUS_PILL[item.status]}`}>{tf(`status_${item.status}`)}</span>
        <span className="font-extrabold">{tf(`type_${item.type}`)}</span>
        <span className="text-muted">
          ·{' '}
          {item.user ? (
            <Link href={`/admin/users/${item.user.id}`} className="font-bold">
              {item.user.name}
            </Link>
          ) : (
            t('fbDeletedUser')
          )}
          {item.user && ` (${item.user.email})`}
        </span>
        <time dateTime={item.createdAt} className="ml-auto text-muted">
          {formatDate(item.createdAt, locale, { hour: '2-digit', minute: '2-digit' })}
        </time>
      </header>

      {(item.word || item.pagePath) && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
          {item.word && (
            <span>
              {t('fbWord')}:{' '}
              <Link href={`/words/${item.word.slug}`} className="font-bold" lang="en">
                {item.word.headword}
              </Link>{' '}
              <span className="italic">
                ({item.word.pos} {item.word.senseNo})
              </span>{' '}
              ·{' '}
              <Link href={`/admin/words/${item.word.id}`} className="font-bold">
                {t('fbEditWord')}
              </Link>
            </span>
          )}
          {item.pagePath && (
            <span>
              {t('fbPage')}: <code className="font-sans">{item.pagePath}</code>
            </span>
          )}
        </p>
      )}

      <p className="mt-3 text-[16px] whitespace-pre-line">{item.message}</p>

      <form onSubmit={save} className="mt-4 flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <fieldset>
          <legend className="field-label">{t('fbStatus')}</legend>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_STATUSES.map((s) => (
              <label key={s} className="chip cursor-pointer">
                <input
                  type="radio"
                  name={`status-${item.id}`}
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  className="sr-only"
                />
                {tf(`status_${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`reply-${item.id}`} className="field-label">
            {t('fbReply')}
          </label>
          <textarea
            id={`reply-${item.id}`}
            name="reply"
            rows={3}
            maxLength={2000}
            defaultValue={item.reply ?? ''}
            aria-describedby={`reply-help-${item.id}`}
            className="input"
          />
          <p id={`reply-help-${item.id}`} className="mt-1 text-[13px] text-muted">
            {t('fbReplyHelp')}
            {item.repliedAt && (
              <>
                {' '}
                {t('fbRepliedBy', { name: item.repliedBy?.name ?? '—', when: formatRelative(item.repliedAt, locale) })} ·{' '}
                {item.replySeenAt ? t('fbSeen') : t('fbUnseen')}
              </>
            )}
          </p>
        </div>
        {item.user && (
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" name="notify" className="mt-1 size-4 accent-[var(--accent)]" />
            {t('fbNotify')}
          </label>
        )}
        <AdminMessage error={error} notice={notice} />
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </article>
  );
}
