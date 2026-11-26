'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';
import type { AdminTopicNode, AdminWordDetail } from '@/lib/admin-types';
import { CEFR_LEVELS } from '@/lib/types';
import { AdminMessage } from './admin-message';

type Example = { sentence: string; translationVi: string };

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Create or edit one word: every field, its example sentences and its topics. */
export function WordForm({ word, topics }: { word?: AdminWordDetail; topics: AdminTopicNode[] }) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const router = useRouter();
  const [examples, setExamples] = useState<Example[]>(
    word?.examples.map((e) => ({ sentence: e.sentence, translationVi: e.translationVi ?? '' })) ?? [],
  );
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set(word?.topics.map((x) => x.id)));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const body = {
      headword: text('headword'),
      pos: text('pos'),
      senseNo: Number(text('senseNo')) || 1,
      ipa: text('ipa') || null,
      cefrLevel: text('cefrLevel'),
      definitionEn: text('definitionEn'),
      meaningVi: text('meaningVi') || null,
      synonyms: splitList(text('synonyms')),
      antonyms: splitList(text('antonyms')),
      collocations: splitList(text('collocations')),
      source: text('source') || null,
      examples: examples
        .filter((x) => x.sentence.trim())
        .map((x) => ({ sentence: x.sentence.trim(), translationVi: x.translationVi.trim() || null })),
      topicIds: [...topicIds],
    };
    setState('saving');
    setError(null);
    try {
      if (word) {
        await api(`/admin/words/${word.id}`, { method: 'PATCH', body });
        setState('saved');
        router.refresh();
      } else {
        const created = await api<AdminWordDetail>('/admin/words', { method: 'POST', body });
        router.push(`/admin/words/${created.id}`);
      }
    } catch (err) {
      setState('idle');
      setError(err instanceof ApiError && err.status === 409 ? t('errorConflict') : err instanceof Error ? err.message : String(err));
    }
  }

  const toggleTopic = (id: string) =>
    setTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form onSubmit={submit} onChange={() => state === 'saved' && setState('idle')} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={t('fieldHeadword')} name="headword" defaultValue={word?.headword} required maxLength={120} lang="en" />
        <Field label={t('fieldPos')} name="pos" defaultValue={word?.pos} required maxLength={40} lang="en" />
        <Field label={t('fieldSenseNo')} name="senseNo" type="number" min={1} max={99} defaultValue={String(word?.senseNo ?? 1)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('fieldIpa')} name="ipa" defaultValue={word?.ipa ?? ''} maxLength={120} />
        <div>
          <label htmlFor="w-cefrLevel" className="field-label">
            {t('fieldLevel')}
          </label>
          <select id="w-cefrLevel" name="cefrLevel" required defaultValue={word?.cefrLevel ?? 'A1'} className="input">
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Area label={t('fieldDefinition')} name="definitionEn" defaultValue={word?.definitionEn} required maxLength={1000} lang="en" />
      <Field label={t('fieldMeaningVi')} name="meaningVi" defaultValue={word?.meaningVi ?? ''} maxLength={500} lang="vi" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('fieldSynonyms')} name="synonyms" defaultValue={word?.synonyms.join(', ')} help={t('listHelp')} lang="en" />
        <Field label={t('fieldAntonyms')} name="antonyms" defaultValue={word?.antonyms.join(', ')} help={t('listHelp')} lang="en" />
        <Field label={t('fieldCollocations')} name="collocations" defaultValue={word?.collocations.join(', ')} help={t('listHelp')} lang="en" />
      </div>

      <fieldset>
        <legend className="field-label">{t('fieldExamples')}</legend>
        <ol className="flex flex-col gap-3">
          {examples.map((ex, i) => (
            <li key={i} className="flex gap-2 rounded-2xl bg-surface p-3">
              <div className="flex flex-1 flex-col gap-2">
                <input
                  aria-label={t('exampleSentence', { n: i + 1 })}
                  value={ex.sentence}
                  maxLength={500}
                  onChange={(e) => setExamples((all) => all.map((x, j) => (j === i ? { ...x, sentence: e.target.value } : x)))}
                  className="input"
                  lang="en"
                />
                <input
                  aria-label={t('exampleTranslation', { n: i + 1 })}
                  value={ex.translationVi}
                  maxLength={500}
                  onChange={(e) => setExamples((all) => all.map((x, j) => (j === i ? { ...x, translationVi: e.target.value } : x)))}
                  className="input"
                  lang="vi"
                />
              </div>
              <button
                type="button"
                aria-label={t('removeExample', { n: i + 1 })}
                onClick={() => setExamples((all) => all.filter((_, j) => j !== i))}
                className="grid size-11 flex-none place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger"
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        {examples.length < 10 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2"
            onClick={() => setExamples((all) => [...all, { sentence: '', translationVi: '' }])}
          >
            <Plus size={18} aria-hidden />
            {t('addExample')}
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="field-label">{t('fieldTopics')}</legend>
        <div className="flex flex-col gap-3">
          {topics.map((top) => (
            <div key={top.id} className="flex flex-wrap gap-2">
              {[top, ...top.children].map((topic) => (
                <label key={topic.id} className={`chip cursor-pointer ${topic.parentId ? '' : 'font-extrabold'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={topicIds.has(topic.id)}
                    onChange={() => toggleTopic(topic.id)}
                  />
                  {name(topic)}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <Field label={t('fieldSource')} name="source" defaultValue={word?.source ?? ''} maxLength={500} />

      <AdminMessage error={error} notice={state === 'saved' ? t('saved') : null} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={state === 'saving'}>
          {state === 'saving' ? t('saving') : word ? t('save') : t('create')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  help,
  ...input
}: { label: string; name: string; help?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `w-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} name={name} className="input" aria-describedby={help ? `${id}-help` : undefined} {...input} />
      {help && (
        <p id={`${id}-help`} className="mt-1 text-[13px] text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

function Area({ label, name, ...input }: { label: string; name: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `w-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea id={id} name={name} rows={3} className="input" {...input} />
    </div>
  );
}
