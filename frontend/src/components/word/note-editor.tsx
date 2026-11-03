'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { api } from '@/lib/client-api';

/** The learner's own note for a word (mnemonic, own sentence). Shown on the back of its flashcard. */
export function NoteEditor({ slug, initial }: { slug: string; initial: string }) {
  const t = useTranslations('Word');
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        await api(`/words/${slug}/note`, { method: 'PUT', body: { content: value } });
        setSaved(value.trim());
        setState('saved');
      } catch {
        setState('error');
      }
    });

  return (
    <div>
      <label htmlFor="note" className="field-label">
        {t('noteTitle')}
      </label>
      <textarea
        id="note"
        className="input"
        value={value}
        maxLength={5000}
        placeholder={t('notePlaceholder')}
        onChange={(e) => {
          setValue(e.target.value);
          setState('idle');
        }}
      />
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending || value.trim() === saved} onClick={save}>
          {t('noteSave')}
        </button>
        <span role="status" className={`text-[13px] ${state === 'error' ? 'text-danger' : 'text-muted'}`}>
          {state === 'saved' ? t('noteSaved') : state === 'error' ? t('noteError') : ''}
        </span>
      </div>
    </div>
  );
}
