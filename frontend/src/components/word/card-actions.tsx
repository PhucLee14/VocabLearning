'use client';

import { Check, Plus, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/client-api';

/** "Learn" / "I know it" for a word without a card, "Start over" for one with a card. */
export function CardActions({
  wordId,
  started,
  compact = false,
}: {
  wordId: string;
  started: boolean;
  compact?: boolean;
}) {
  const t = useTranslations('CardActions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(false);
      try {
        await fn();
        router.refresh();
      } catch {
        setError(true);
      }
    });

  const size = compact ? 'btn-sm' : '';

  if (started) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={`btn btn-secondary ${size}`}
          onClick={() => {
            if (window.confirm(t('resetConfirm'))) run(() => api(`/study/cards/${wordId}`, { method: 'DELETE' }));
          }}
        >
          <RotateCcw size={16} aria-hidden />
          {t('reset')}
        </button>
        {error && <span className="text-[13px] text-danger">{t('error')}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`btn btn-primary ${size}`}
        onClick={() => run(() => api('/study/cards', { method: 'POST', body: { wordId, action: 'learn' } }))}
      >
        <Plus size={16} strokeWidth={3} aria-hidden />
        {t('learn')}
      </button>
      <button
        type="button"
        disabled={pending}
        className={`btn btn-secondary ${size}`}
        onClick={() => run(() => api('/study/cards', { method: 'POST', body: { wordId, action: 'known' } }))}
      >
        <Check size={16} strokeWidth={3} aria-hidden />
        {t('known')}
      </button>
      {error && <span className="text-[13px] text-danger">{t('error')}</span>}
    </div>
  );
}
