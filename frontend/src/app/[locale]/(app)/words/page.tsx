import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { WordListView } from '@/components/word/word-list';
import { Link } from '@/i18n/navigation';
import { getTopics } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';
import { CEFR_LEVELS, type WordList, type WordStatus } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Words');
  return { title: t('title') };
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const TABS: { status: WordStatus; key: 'tabNew' | 'tabLearned' | 'tabDue' | 'tabAll' }[] = [
  { status: 'new', key: 'tabNew' },
  { status: 'learned', key: 'tabLearned' },
  { status: 'due', key: 'tabDue' },
  { status: 'all', key: 'tabAll' },
];

const SORTS: Record<string, string[]> = {
  new: ['az', 'level'],
  all: ['az', 'level'],
  learned: ['recent', 'az', 'level', 'due', 'mastery'],
  due: ['due', 'az', 'level', 'mastery'],
};

export default function WordsPage({ searchParams }: PageProps<'/[locale]/words'>) {
  return (
    <Page>
      <Suspense fallback={<WordsSkeleton />}>
        <Words searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Words({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = one(sp.status);
  // "known" and "learning" are parts of "learned"; the list shows them under that tab.
  const status: WordStatus = (['new', 'learned', 'due', 'all', 'known', 'learning'] as const).includes(raw as WordStatus)
    ? (raw as WordStatus)
    : 'new';
  const tab = status === 'known' || status === 'learning' ? 'learned' : status;
  const filters = { q: one(sp.q), level: one(sp.level), topic: one(sp.topic) };
  const sort = SORTS[tab].includes(one(sp.sort)) ? one(sp.sort) : SORTS[tab][0];
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const query = new URLSearchParams({ status, sort, page: String(page), pageSize: '24' });
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);

  const [t, locale, data, topics] = await Promise.all([
    getTranslations('Words'),
    getLocale(),
    userGet<WordList>(`/words?${query}`, `/words?status=${status}`),
    getTopics(),
  ]);

  const keep = Object.fromEntries(Object.entries({ ...filters, sort: sort === SORTS[tab][0] ? '' : sort }).filter(([, v]) => v));
  const tabHref = (s: WordStatus) => {
    const q = new URLSearchParams({ status: s, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    return `/words?${q}`;
  };
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t(tab === 'new' ? 'titleNew' : tab === 'all' ? 'title' : 'titleLearned')}</h1>
        <p className="mt-1 text-[16px] text-muted">{t(`lede_${tab}` as 'lede_all')}</p>
      </header>

      <nav className="seg mb-4 max-w-full overflow-x-auto" aria-label={t('tabsLabel')}>
        {TABS.map(({ status: s, key }) => (
          <Link key={s} href={tabHref(s)} aria-current={tab === s ? 'page' : undefined}>
            {t(key)}
            <span className="num text-[13px] opacity-75">{formatNumber(data.counts[s] ?? 0, locale)}</span>
          </Link>
        ))}
      </nav>

      <Form action={`/${locale}/words`} className="mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={status} />
        <div className="relative min-w-[220px] flex-[2_1_260px]">
          <label htmlFor="w-q" className="sr-only">
            {t('search')}
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input id="w-q" name="q" type="search" defaultValue={filters.q} placeholder={t('searchPlaceholder')} className="input !pl-11" />
        </div>
        <div className="flex-[1_1_140px]">
          <label htmlFor="w-level" className="sr-only">
            {t('level')}
          </label>
          <select id="w-level" name="level" defaultValue={filters.level} className="input">
            <option value="">{t('anyLevel')}</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-[1_1_180px]">
          <label htmlFor="w-topic" className="sr-only">
            {t('topic')}
          </label>
          <select id="w-topic" name="topic" defaultValue={filters.topic} className="input">
            <option value="">{t('anyTopic')}</option>
            {topics.map((topic) => (
              <optgroup key={topic.slug} label={name(topic)}>
                <option value={topic.slug}>{name(topic)}</option>
                {topic.children.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {name(c)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex-[1_1_160px]">
          <label htmlFor="w-sort" className="sr-only">
            {t('sort')}
          </label>
          <select id="w-sort" name="sort" defaultValue={sort} className="input">
            {SORTS[tab].map((s) => (
              <option key={s} value={s}>
                {t(`sort_${s}` as 'sort_az')}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          {t('apply')}
        </button>
      </Form>

      <WordListView
        data={data}
        status={tab}
        basePath="/words"
        query={{ status, ...keep }}
        signedIn
      />
    </>
  );
}

function WordsSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-52 rounded-full bg-sunken" />
      <div className="mt-3 h-5 w-80 max-w-full rounded-full bg-sunken" />
      <div className="mt-6 h-10 w-96 max-w-full rounded-full bg-sunken" />
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[72px] rounded-[18px] bg-surface" />
        ))}
      </div>
    </div>
  );
}
