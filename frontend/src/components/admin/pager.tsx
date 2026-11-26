import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';

/** "1–30 of 412" and previous / next links that keep the other query parameters. */
export async function Pager({
  total,
  page,
  pageSize,
  shown,
  basePath,
  query,
}: {
  total: number;
  page: number;
  pageSize: number;
  shown: number;
  basePath: string;
  query: Record<string, string>;
}) {
  const [t, locale] = await Promise.all([getTranslations('Admin'), getLocale()]);
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v));
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="num text-[14px] text-muted">
        {t('showing', {
          from: formatNumber((page - 1) * pageSize + 1, locale),
          to: formatNumber((page - 1) * pageSize + shown, locale),
          total: formatNumber(total, locale),
        })}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn btn-secondary btn-sm" aria-label={t('prev')}>
              <ChevronLeft size={18} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40" aria-hidden>
              <ChevronLeft size={18} />
            </span>
          )}
          <span className="num min-w-16 text-center text-[14px] font-bold">
            {page}/{pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="btn btn-secondary btn-sm" aria-label={t('next')}>
              <ChevronRight size={18} aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40" aria-hidden>
              <ChevronRight size={18} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

type Search = Record<string, string | string[] | undefined>;

/** First value of a search parameter, or "". */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Page number from the query, at least 1. */
export const pageOf = (sp: Search) => Math.max(1, Math.min(10_000, Number(one(sp.page)) || 1));
