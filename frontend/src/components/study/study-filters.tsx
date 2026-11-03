import Form from 'next/form';
import { getLocale, getTranslations } from 'next-intl/server';
import { getTopics } from '@/lib/api';
import { CEFR_LEVELS } from '@/lib/types';

/**
 * Topic / level (/ source) picker for a learn or practice session. A plain GET
 * form, so the choice lives in the URL and works without JavaScript.
 */
export async function StudyFilters({
  path,
  hidden = {},
  defaults = {},
  withSource = false,
  withCount = false,
  submitLabel,
}: {
  path: '/learn' | '/flashcards';
  hidden?: Record<string, string>;
  defaults?: { topic?: string; level?: string; source?: string; limit?: string };
  withSource?: boolean;
  withCount?: boolean;
  submitLabel: string;
}) {
  const [locale, t, topics] = await Promise.all([getLocale(), getTranslations('StudyFilters'), getTopics()]);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <Form action={`/${locale}${path}`} className="panel grid gap-5 sm:grid-cols-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div>
        <label htmlFor="f-topic" className="field-label">
          {t('topic')}
        </label>
        <select id="f-topic" name="topic" defaultValue={defaults.topic ?? ''} className="input">
          <option value="">{t('anyTopic')}</option>
          {topics.map((topic) => (
            <optgroup key={topic.slug} label={name(topic)}>
              <option value={topic.slug}>{t('allOf', { name: name(topic) })}</option>
              {topic.children.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {name(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-level" className="field-label">
          {t('level')}
        </label>
        <select id="f-level" name="level" defaultValue={defaults.level ?? ''} className="input">
          <option value="">{t('anyLevel')}</option>
          {CEFR_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {withSource && (
        <fieldset className="sm:col-span-2">
          <legend className="field-label">{t('source')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['learned', 'all'] as const).map((s) => (
              <label key={s} className="chip has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink">
                <input type="radio" name="source" value={s} defaultChecked={(defaults.source ?? 'learned') === s} className="sr-only" />
                {t(s === 'learned' ? 'sourceLearned' : 'sourceAll')}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {withCount && (
        <fieldset className="sm:col-span-2">
          <legend className="field-label">{t('count')}</legend>
          <div className="flex flex-wrap gap-2">
            {['5', '10', '15', '20'].map((n) => (
              <label key={n} className="chip has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink">
                <input type="radio" name="limit" value={n} defaultChecked={(defaults.limit ?? '10') === n} className="sr-only" />
                {t('words', { count: Number(n) })}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto">
          {submitLabel}
        </button>
      </div>
    </Form>
  );
}
