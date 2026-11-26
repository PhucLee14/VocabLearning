import { Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import { getLocale, getTranslations } from 'next-intl/server';
import { one, Pager, pageOf } from '@/components/admin/pager';
import { Link } from '@/i18n/navigation';
import type { AdminTopicNode, AdminWordRow, Paged } from '@/lib/admin-types';
import { formatDate, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';
import { CEFR_LEVELS } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('wordsTitle') };
}

const SORTS = ['az', 'recent', 'level'] as const;

export default async function AdminWords({ searchParams }: PageProps<'/[locale]/admin/words'>) {
  const sp = await searchParams;
  const filters = {
    q: one(sp.q),
    level: CEFR_LEVELS.find((l) => l === one(sp.level)) ?? '',
    topic: one(sp.topic),
    pos: one(sp.pos),
    reported: one(sp.reported) === '1' ? '1' : '',
    sort: SORTS.find((s) => s === one(sp.sort)) ?? 'az',
  };
  const page = pageOf(sp);
  const query = new URLSearchParams({ page: String(page) });
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);

  const [t, locale, data, topics, parts] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGet<Paged<AdminWordRow>>(`/admin/words?${query}`, '/admin/words'),
    userGet<AdminTopicNode[]>('/admin/topics', '/admin/words'),
    userGet<{ pos: string; count: number }[]>('/admin/words/parts-of-speech', '/admin/words'),
  ]);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('wordsTitle')}</h1>
        <Link href="/admin/words/new" className="btn btn-primary">
          <Plus size={18} aria-hidden />
          {t('wordsNew')}
        </Link>
      </header>

      <Form action={`/${locale}/admin/words`} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-[2_1_260px]">
          <label htmlFor="aw-q" className="sr-only">
            {t('search')}
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input id="aw-q" name="q" type="search" defaultValue={filters.q} placeholder={t('wordsSearch')} className="input !pl-11" />
        </div>
        <Select name="level" label={t('colLevel')} value={filters.level}>
          <option value="">{t('anyLevel')}</option>
          {CEFR_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select name="pos" label={t('fieldPos')} value={filters.pos}>
          <option value="">{t('anyPos')}</option>
          {parts.map((p) => (
            <option key={p.pos} value={p.pos}>
              {p.pos} ({n(p.count)})
            </option>
          ))}
        </Select>
        <Select name="topic" label={t('fieldTopics')} value={filters.topic}>
          <option value="">{t('anyTopic')}</option>
          {topics.map((top) => (
            <optgroup key={top.id} label={name(top)}>
              <option value={top.slug}>{name(top)}</option>
              {top.children.map((c) => (
                <option key={c.id} value={c.slug}>
                  {name(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select name="sort" label={t('sort')} value={filters.sort}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort_${s}`)}
            </option>
          ))}
        </Select>
        <label className="chip cursor-pointer">
          <input type="checkbox" name="reported" value="1" defaultChecked={filters.reported === '1'} className="sr-only" />
          {t('onlyReported')}
        </label>
        <button type="submit" className="btn btn-secondary">
          {t('apply')}
        </button>
      </Form>

      {data.items.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-6 py-8 text-center text-muted">{t('empty')}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 font-bold">{t('colWord')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('colLevel')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('fieldDefinition')}</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">{t('colLearners')}</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">{t('colReports')}</th>
                <th scope="col" className="px-4 py-3 font-bold">{t('colUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w) => (
                <tr key={w.id} className="border-b border-line align-top last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/admin/words/${w.id}`} className="font-extrabold text-ink" lang="en">
                      {w.headword}
                    </Link>
                    <span className="block text-muted italic">
                      {w.pos} {w.senseNo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="pill">{w.cefrLevel}</span>
                  </td>
                  <td className="max-w-[420px] px-4 py-3">
                    <span className="line-clamp-2" lang="en">
                      {w.definitionEn}
                    </span>
                    {w.meaningVi && <span className="line-clamp-1 text-muted">{w.meaningVi}</span>}
                  </td>
                  <td className="num px-4 py-3 text-right">{n(w.learners)}</td>
                  <td className="px-4 py-3 text-right">
                    {w.openReports > 0 ? <span className="pill pill-danger num">{n(w.openReports)}</span> : <span className="text-muted">0</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(w.updatedAt, locale)}</td>
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
        basePath="/admin/words"
        query={{ ...filters, sort: filters.sort === 'az' ? '' : filters.sort }}
      />
    </>
  );
}

function Select({ name, label, value, children }: { name: string; label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex-[1_1_150px]">
      <label htmlFor={`aw-${name}`} className="sr-only">
        {label}
      </label>
      <select id={`aw-${name}`} name={name} defaultValue={value} className="input">
        {children}
      </select>
    </div>
  );
}
