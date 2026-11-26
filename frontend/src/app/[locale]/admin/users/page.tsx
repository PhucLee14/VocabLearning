import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import { getLocale, getTranslations } from 'next-intl/server';
import { one, Pager, pageOf } from '@/components/admin/pager';
import { Link } from '@/i18n/navigation';
import type { AdminUserRow, Paged } from '@/lib/admin-types';
import { formatDate, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('usersTitle') };
}

const FILTERS = ['all', 'admins', 'disabled', 'unverified'] as const;

export default async function AdminUsers({ searchParams }: PageProps<'/[locale]/admin/users'>) {
  const sp = await searchParams;
  const q = one(sp.q);
  const filter = FILTERS.find((f) => f === one(sp.filter)) ?? 'all';
  const page = pageOf(sp);
  const query = new URLSearchParams({ page: String(page), filter });
  if (q) query.set('q', q);

  const [t, locale, data] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGet<Paged<AdminUserRow>>(`/admin/users?${query}`, '/admin/users'),
  ]);
  const filterHref = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (f !== 'all') p.set('filter', f);
    const s = p.toString();
    return s ? `/admin/users?${s}` : '/admin/users';
  };

  return (
    <>
      <h1 className="mb-5 text-[28px] font-extrabold tracking-tight">{t('usersTitle')}</h1>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Form action={`/${locale}/admin/users`} className="flex min-w-[260px] flex-[1_1_320px] gap-2">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <div className="relative flex-1">
            <label htmlFor="u-q" className="sr-only">
              {t('search')}
            </label>
            <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input id="u-q" name="q" type="search" defaultValue={q} placeholder={t('usersSearch')} className="input !pl-11" />
          </div>
          <button type="submit" className="btn btn-secondary">
            {t('search')}
          </button>
        </Form>
        <nav className="flex flex-wrap gap-2" aria-label={t('usersTitle')}>
          {FILTERS.map((f) => (
            <Link key={f} href={filterHref(f)} className="chip" aria-current={filter === f ? 'page' : undefined}>
              {t(`filter_${f}`)}
            </Link>
          ))}
        </nav>
      </div>

      {data.items.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-6 py-8 text-center text-muted">{t('empty')}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 font-bold">{t('colUser')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('colRole')}</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">{t('colCards')}</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">{t('colStreak')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('colLastActive')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('colJoined')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-extrabold text-ink">
                      {u.name}
                    </Link>
                    <span className="block text-muted">{u.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      <span className={`pill ${u.role === 'ADMIN' ? 'pill-streak' : ''}`}>{t(`role_${u.role}`)}</span>
                      {u.disabledAt && <span className="pill pill-danger">{t('statusDisabled')}</span>}
                      {!u.emailVerifiedAt && <span className="pill">{t('statusUnverified')}</span>}
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-right">{formatNumber(u.cards, locale)}</td>
                  <td className="num px-4 py-3 text-right">{formatNumber(u.streak, locale)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.lastActiveDate ? formatDate(u.lastActiveDate, locale) : <span className="text-muted">{t('never')}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(u.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        shown={data.items.length}
        basePath="/admin/users"
        query={{ q, filter: filter === 'all' ? '' : filter }}
      />
    </>
  );
}
