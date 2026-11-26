import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ImportFlow } from '@/components/admin/import-flow';
import type { ImportJobRow } from '@/lib/admin-types';
import { formatDate, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('importTitle') };
}

export default async function AdminImport() {
  const [t, locale, jobs] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGet<ImportJobRow[]>('/admin/import', '/admin/import'),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('importTitle')}</h1>
        <p className="mt-1 max-w-[760px] text-[15px] text-muted">{t('importLede')}</p>
      </header>
      <section className="card max-w-[960px] p-5 sm:p-6">
        <ImportFlow />
      </section>

      {jobs.length > 0 && (
        <section className="mt-8 max-w-[960px]" aria-labelledby="history-title">
          <h2 id="history-title" className="mb-3 text-[18px] font-extrabold">
            {t('importHistory')}
          </h2>
          <ul className="flex flex-col gap-2">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface px-4 py-3 text-[14px]">
                <span className="font-bold">{j.fileName}</span>
                <span
                  className={`pill ${j.status === 'COMPLETED' ? 'pill-accent' : j.status === 'FAILED' ? 'pill-danger' : ''}`}
                >
                  {t(`importStatus_${j.status}`)}
                </span>
                <span className="text-muted">
                  {t('importRows', { count: j.totalRows })}
                  {j.status === 'COMPLETED' && ` · ${t('importDone', { created: n(j.inserted), updated: n(j.updated) })}`}
                  {j.failed > 0 && ` · ${t('importInvalid', { count: j.failed })}`}
                </span>
                <span className="ml-auto text-muted">
                  {formatDate(j.createdAt, locale, { hour: '2-digit', minute: '2-digit' })}
                  {j.createdBy && ` · ${t('importBy', { name: j.createdBy.name })}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
