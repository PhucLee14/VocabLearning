import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { FeedbackItem } from '@/components/admin/feedback-item';
import { one, Pager, pageOf } from '@/components/admin/pager';
import { Link } from '@/i18n/navigation';
import { type AdminFeedbackList, FEEDBACK_STATUSES, FEEDBACK_TYPES } from '@/lib/admin-types';
import { formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('fbTitle') };
}

const TYPE_FILTERS = ['WORD', ...FEEDBACK_TYPES] as const;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function AdminFeedbackPage({ searchParams }: PageProps<'/[locale]/admin/feedback'>) {
  const sp = await searchParams;
  const filters = {
    status: FEEDBACK_STATUSES.find((s) => s === one(sp.status)) ?? '',
    type: TYPE_FILTERS.find((s) => s === one(sp.type)) ?? '',
    wordId: UUID.test(one(sp.wordId)) ? one(sp.wordId) : '',
    userId: UUID.test(one(sp.userId)) ? one(sp.userId) : '',
  };
  const page = pageOf(sp);
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);

  const [t, tf, locale, data] = await Promise.all([
    getTranslations('Admin'),
    getTranslations('Feedback'),
    getLocale(),
    userGet<AdminFeedbackList>(`/admin/feedback?${query}`, '/admin/feedback'),
  ]);
  const href = (patch: Partial<typeof filters>) => {
    const q = new URLSearchParams(Object.entries({ ...filters, ...patch }).filter(([, v]) => v));
    const s = q.toString();
    return s ? `/admin/feedback?${s}` : '/admin/feedback';
  };
  const all = Object.values(data.counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <h1 className="mb-5 text-[28px] font-extrabold tracking-tight">{t('fbTitle')}</h1>
      <nav className="seg mb-3 max-w-full overflow-x-auto" aria-label={t('fbStatus')}>
        <Link href={href({ status: '' })} aria-current={filters.status === '' ? 'page' : undefined}>
          {t('fbAll')}
          <span className="num text-[13px] opacity-75">{formatNumber(all, locale)}</span>
        </Link>
        {FEEDBACK_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s })} aria-current={filters.status === s ? 'page' : undefined}>
            {tf(`status_${s}`)}
            <span className="num text-[13px] opacity-75">{formatNumber(data.counts[s] ?? 0, locale)}</span>
          </Link>
        ))}
      </nav>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t('fbAllTypes')}>
        <Link href={href({ type: '' })} className="chip" aria-current={filters.type === '' ? 'page' : undefined}>
          {t('fbAllTypes')}
        </Link>
        {TYPE_FILTERS.map((ty) => (
          <Link key={ty} href={href({ type: ty })} className="chip" aria-current={filters.type === ty ? 'page' : undefined}>
            {ty === 'WORD' ? t('fbType_WORD') : tf(`type_${ty}`)}
          </Link>
        ))}
        {(filters.wordId || filters.userId) && (
          <Link href={href({ wordId: '', userId: '' })} className="chip" aria-current="page">
            {filters.wordId ? t('fbWord') : t('colUser')} ×
          </Link>
        )}
      </nav>

      {data.items.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-6 py-8 text-center text-muted">{t('fbEmpty')}</p>
      ) : (
        <div className="flex max-w-[900px] flex-col gap-4">
          {data.items.map((item) => (
            <FeedbackItem key={`${item.id}:${item.updatedAt}`} item={item} />
          ))}
        </div>
      )}
      <Pager
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        shown={data.items.length}
        basePath="/admin/feedback"
        query={filters}
      />
    </>
  );
}
