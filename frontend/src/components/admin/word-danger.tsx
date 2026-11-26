'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/client-api';
import type { AdminWordDetail } from '@/lib/admin-types';
import { AdminMessage } from './admin-message';
import { useAdminAction } from './use-action';

type Merged = { cards: number; reviews: number; notes: number };

/** Merge this entry into another one with the same headword, or delete it. */
export function WordDanger({ word }: { word: AdminWordDetail }) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const { run, pending, error, notice } = useAdminAction();
  const [intoId, setIntoId] = useState(word.sameHeadword[0]?.id ?? '');
  const label = (w: { headword: string; pos: string; senseNo: number }) => `${w.headword} (${w.pos} ${w.senseNo})`;
  const into = word.sameHeadword.find((w) => w.id === intoId);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="merge-title">
        <h3 id="merge-title" className="text-[16px] font-extrabold">
          {t('mergeTitle')}
        </h3>
        <p className="mt-1 mb-3 text-[14px] text-muted">{t('mergeHelp')}</p>
        {word.sameHeadword.length === 0 ? (
          <p className="text-[14px] text-muted">{t('mergeNone')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="merge-into" className="field-label">
                {t('mergeInto')}
              </label>
              <select id="merge-into" value={intoId} onChange={(e) => setIntoId(e.target.value)} className="input">
                {word.sameHeadword.map((w) => (
                  <option key={w.id} value={w.id}>
                    {label(w)} · {w.cefrLevel} · {w.definitionEn.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pending || !into}
                onClick={() =>
                  into &&
                  run(() => api<Merged>(`/admin/words/${word.id}/merge`, { method: 'POST', body: { intoId } }), {
                    confirm: t('confirmMerge', { from: label(word), into: label(into) }),
                    then: () => router.replace(`/admin/words/${intoId}`),
                  })
                }
              >
                {t('mergeButton')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="delete-title" className="border-t border-line-strong pt-5">
        <h3 id="delete-title" className="text-[16px] font-extrabold text-danger">
          {t('deleteTitle')}
        </h3>
        <p className="mt-1 mb-3 text-[14px] text-muted">{t('deleteHelp')}</p>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() =>
            run(() => api(`/admin/words/${word.id}`, { method: 'DELETE' }), {
              confirm: t('confirmDeleteWord', { word: label(word) }),
              then: () => router.replace('/admin/words'),
            })
          }
        >
          {t('delete')}
        </button>
      </section>
      <AdminMessage error={error} notice={notice} />
    </div>
  );
}
