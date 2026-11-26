'use client';

import { useTranslations } from 'next-intl';

/**
 * The outcome of an admin action: a notice, or the generic error with the
 * API's own (English) message after it, which is often the useful part.
 */
export function AdminMessage({ error, notice }: { error: string | null; notice?: string | null }) {
  const t = useTranslations('Admin');
  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-bold text-danger">
        {t('error')} <span className="font-normal">({error})</span>
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-[14px] font-bold text-accent-ink">
        {notice}
      </p>
    );
  }
  return null;
}
