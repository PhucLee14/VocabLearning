'use client';

import { Flag, MessageSquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';
import type { FeedbackType } from '@/lib/admin-types';

const GENERAL_TYPES: FeedbackType[] = ['BUG', 'IDEA', 'GENERAL'];
const WORD_TYPES: FeedbackType[] = ['WORD_MEANING', 'WORD_EXAMPLE', 'WORD_OTHER'];

type State = 'idle' | 'sending' | 'sent' | 'error' | 'tooMany';

/**
 * "Send feedback" (general) or "Report a problem" (about one word): a button
 * that opens a small form in a modal <dialog>. Signed-in users only.
 */
export function FeedbackDialog({
  word,
  trigger,
  triggerClassName,
}: {
  /** Set for a report about this word. */
  word?: { slug: string; headword: string };
  /** The button's content; defaults to an icon and the label. */
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const t = useTranslations('Feedback');
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const id = useId();
  const types = word ? WORD_TYPES : GENERAL_TYPES;
  const [type, setType] = useState<FeedbackType>(types[0]);
  const [state, setState] = useState<State>('idle');

  function open() {
    setState('idle');
    setType(types[0]);
    dialog.current?.showModal();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const message = String(new FormData(form).get('message') ?? '').trim();
    setState('sending');
    try {
      await api('/feedback', {
        method: 'POST',
        body: { type, message, wordSlug: word?.slug, pagePath: pathname.slice(0, 300) },
      });
      form.reset();
      setState('sent');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 429 ? 'tooMany' : 'error');
    }
  }

  const Icon = word ? Flag : MessageSquarePlus;
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={open} className={triggerClassName ?? 'btn btn-ghost btn-sm'}>
        {trigger ?? (
          <>
            <Icon size={18} aria-hidden />
            {word ? t('report') : t('button')}
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[min(520px,calc(100vw-32px))] max-w-none rounded-[28px] bg-canvas p-0 text-ink backdrop:bg-black/40"
      >
        <div className="p-6 sm:p-7">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 id={`${id}-title`} className="text-[20px] font-extrabold">
              {word ? t('reportTitle', { word: word.headword }) : t('title')}
            </h2>
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => dialog.current?.close()}
              className="-mt-1 -mr-2 grid size-11 flex-none place-items-center rounded-full text-muted hover:bg-surface"
            >
              <X size={22} aria-hidden />
            </button>
          </div>

          {state === 'sent' ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] font-bold text-accent-ink">
                {t('sent')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>
                  {t('close')}
                </button>
                <Link href="/feedback" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
                  {t('openMine')}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              {!word && <p className="text-[15px] text-muted">{t('lede')}</p>}
              <fieldset>
                <legend className="field-label">{t('type')}</legend>
                <div className="flex flex-wrap gap-2">
                  {types.map((value) => (
                    <label key={value} className="chip cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value={value}
                        checked={type === value}
                        onChange={() => setType(value)}
                        className="sr-only"
                      />
                      {t(`type_${value}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor={`${id}-message`} className="field-label">
                  {t('message')}
                </label>
                <textarea
                  id={`${id}-message`}
                  name="message"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={5}
                  placeholder={word ? t('reportPlaceholder') : t('messagePlaceholder')}
                  className="input"
                />
              </div>
              {(state === 'error' || state === 'tooMany') && (
                <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger">
                  {state === 'tooMany' ? t('tooMany') : t('error')}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
                  {state === 'sending' ? t('sending') : t('send')}
                </button>
                <Link href="/feedback" className="text-[14px] font-bold" onClick={() => dialog.current?.close()}>
                  {t('openMine')}
                </Link>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
