import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatNumber, formatRelative } from '@/lib/format';
import type { WordList, WordStatus } from '@/lib/types';
import { CardActions } from './card-actions';
import { LevelPill } from './level-pill';
import { MasteryMeter } from './mastery-meter';

/** Rows of words with the learner's progress, and paging links that keep the other filters. */
export async function WordListView({
  data,
  status,
  basePath,
  query,
  signedIn,
}: {
  data: WordList;
  status: WordStatus;
  basePath: string;
  query: Record<string, string>;
  signedIn: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('Words'), getLocale()]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pageHref = (page: number) => {
    const q = new URLSearchParams({ ...query, page: String(page) });
    if (page === 1) q.delete('page');
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  if (data.items.length === 0) {
    return (
      <p className="rounded-[22px] border-2 border-dashed border-line-strong px-5 py-6 text-[16px] text-muted">
        {query.q || query.level || query.topic ? t('emptyFiltered') : t(`empty_${status}` as 'empty_all')}{' '}
        {status === 'learned' || status === 'due' ? (
          <Link href="/learn" className="font-bold">
            {t('goLearn')}
          </Link>
        ) : null}
      </p>
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {data.items.map((w) => (
          <li
            key={w.id}
            className="flex flex-col gap-3 rounded-[18px] bg-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-5 sm:px-5"
          >
            <Link href={`/words/${w.slug}`} className="min-w-0 flex-1 text-ink no-underline hover:[&_.hw]:text-accent-ink">
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="hw text-[18px] font-extrabold" lang="en">
                  {w.headword}
                </span>
                <span className="text-[14px] text-muted italic">{w.pos}</span>
                {w.ipa && (
                  <span className="text-[14px] text-muted" lang="en">
                    {w.ipa}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[15px] text-muted">{w.meaningVi ?? w.definitionEn}</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3 sm:flex-none sm:justify-end">
              <LevelPill level={w.cefrLevel} />
              {w.progress ? (
                <>
                  <MasteryMeter level={w.progress.masteryLevel} />
                  <span className="w-28 text-[13px] text-muted">
                    {w.progress.isKnown
                      ? t('known')
                      : new Date(w.progress.due) <= new Date()
                        ? t('dueNow')
                        : formatRelative(w.progress.due, locale)}
                  </span>
                </>
              ) : signedIn ? (
                <CardActions wordId={w.id} started={false} compact />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t('paging')}>
        <p className="text-[14px] text-muted">
          {t('showing', {
            from: formatNumber((data.page - 1) * data.pageSize + 1, locale),
            to: formatNumber((data.page - 1) * data.pageSize + data.items.length, locale),
            total: formatNumber(data.total, locale),
          })}
        </p>
        {pages > 1 && (
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link href={pageHref(data.page - 1)} className="btn btn-secondary btn-sm" aria-label={t('prev')}>
                <ChevronLeft size={18} aria-hidden />
              </Link>
            ) : null}
            <span className="num grid min-h-9 place-items-center px-2 text-[14px] font-bold">
              {data.page}/{pages}
            </span>
            {data.page < pages ? (
              <Link href={pageHref(data.page + 1)} className="btn btn-secondary btn-sm" aria-label={t('next')}>
                <ChevronRight size={18} aria-hidden />
              </Link>
            ) : null}
          </div>
        )}
      </nav>
    </div>
  );
}
