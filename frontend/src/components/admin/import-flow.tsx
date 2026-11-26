'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';
import type { ImportPreview } from '@/lib/admin-types';
import { formatNumber } from '@/lib/format';
import { AdminMessage } from './admin-message';

/** Same limits as the API (backend/src/admin/admin.dto.ts). */
export const IMPORT_MAX_CHARS = 3_500_000;
export const IMPORT_MAX_ROWS = 5_000;

type Step =
  | { name: 'pick' }
  | { name: 'checking' }
  | { name: 'preview'; preview: ImportPreview; content: string }
  | { name: 'importing'; preview: ImportPreview }
  | { name: 'done'; created: number; updated: number };

/**
 * Upload → preview → confirm. The file is read in the browser and sent as
 * text; the server keeps only its hash between the two steps, so the confirm
 * sends the same text again.
 */
export function ImportFlow() {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const n = (v: number) => formatNumber(v, locale);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
    const content = await file.text();
    if (content.length > IMPORT_MAX_CHARS) {
      setError(t('importTooBig'));
      return;
    }
    setStep({ name: 'checking' });
    try {
      const preview = await api<ImportPreview>('/admin/import/preview', {
        method: 'POST',
        body: { fileName: file.name, format, content },
      });
      setStep({ name: 'preview', preview, content });
      router.refresh();
    } catch (err) {
      setStep({ name: 'pick' });
      setError(err instanceof ApiError && err.status === 413 ? t('importTooBig') : err instanceof Error ? err.message : String(err));
    }
  }

  async function commit(preview: ImportPreview, content: string) {
    setStep({ name: 'importing', preview });
    setError(null);
    try {
      const result = await api<{ created: number; updated: number }>(`/admin/import/${preview.id}/commit`, {
        method: 'POST',
        body: { content },
      });
      setStep({ name: 'done', ...result });
      router.refresh();
    } catch (err) {
      setStep({ name: 'preview', preview, content });
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (step.name === 'done') {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] font-bold text-accent-ink">
          {t('importDone', { created: n(step.created), updated: n(step.updated) })}
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setStep({ name: 'pick' })}>
          {t('importAnother')}
        </button>
      </div>
    );
  }

  const preview = step.name === 'preview' || step.name === 'importing' ? step.preview : null;

  return (
    <div className="flex flex-col gap-5">
      {!preview && (
        <div>
          <label htmlFor="import-file" className="field-label">
            {t('importFile', { max: n(IMPORT_MAX_ROWS) })}
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={pick}
            disabled={step.name === 'checking'}
            className="input file:mr-3 file:rounded-full file:border-0 file:bg-sunken file:px-3 file:py-1 file:font-bold"
          />
          {step.name === 'checking' && (
            <p role="status" className="mt-2 text-[14px] text-muted">
              {t('importChecking')}
            </p>
          )}
        </div>
      )}

      <AdminMessage error={error} />

      {preview && (
        <section aria-labelledby="preview-title" className="flex flex-col gap-4">
          <h2 id="preview-title" className="text-[18px] font-extrabold">
            {preview.fileName}
          </h2>
          <div className="flex flex-wrap gap-2">
            <span className="pill">{t('importRows', { count: preview.totalRows })}</span>
            {preview.creates !== null && <span className="pill pill-accent">{t('importCreates', { count: preview.creates })}</span>}
            {preview.updates !== null && <span className="pill">{t('importUpdates', { count: preview.updates })}</span>}
            {preview.invalidRows > 0 && <span className="pill pill-danger">{t('importInvalid', { count: preview.invalidRows })}</span>}
          </div>

          {preview.errors.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-extrabold">{t('importErrors')}</h3>
              <ul className="max-h-[320px] overflow-y-auto rounded-2xl bg-danger-soft px-4 py-3 text-[14px]">
                {preview.errors.map((e, i) => (
                  <li key={i} className="py-0.5">
                    <span className="font-bold">{t('importRowError', { row: e.index + 1 })}</span>
                    {e.headword && <span lang="en"> · {e.headword}</span>}: {e.message}
                  </li>
                ))}
                {preview.errorCount > preview.errors.length && (
                  <li className="py-0.5 font-bold">{t('importMoreErrors', { count: preview.errorCount - preview.errors.length })}</li>
                )}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-[15px] font-extrabold">{t('importSample')}</h3>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <tbody>
                  {preview.sample.map((w, i) => (
                    <tr key={i} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-extrabold" lang="en">
                          {w.headword}
                        </span>
                        <span className="block text-muted italic">
                          {w.pos} {w.sense_no}
                        </span>
                      </td>
                      <td className="px-3 py-2">{w.cefr_level}</td>
                      <td className="px-3 py-2">
                        <span lang="en">{w.definition_en}</span>
                        {w.meaning_vi && <span className="block text-muted">{w.meaning_vi}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted">{w.topics.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {preview.invalidRows === 0 && step.name === 'preview' && (
              <button type="button" className="btn btn-primary" onClick={() => commit(preview, step.content)}>
                {t('importConfirm', { count: n(preview.totalRows) })}
              </button>
            )}
            {step.name === 'importing' ? (
              <p role="status" className="text-[14px] font-bold text-muted">
                {t('importImporting')}
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setError(null);
                  setStep({ name: 'pick' });
                }}
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
