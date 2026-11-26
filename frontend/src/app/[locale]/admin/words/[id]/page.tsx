import { ChevronLeft, ExternalLink } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { WordDanger } from '@/components/admin/word-danger';
import { WordForm } from '@/components/admin/word-form';
import { Link } from '@/i18n/navigation';
import type { AdminTopicNode, AdminWordDetail } from '@/lib/admin-types';
import { formatDate, formatNumber } from '@/lib/format';
import { userGet, userGetOrNull } from '@/lib/server-api';

export default async function AdminWord({ params }: PageProps<'/[locale]/admin/words/[id]'>) {
  const { id } = await params;
  const [t, locale, word, topics] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGetOrNull<AdminWordDetail>(`/admin/words/${encodeURIComponent(id)}`, '/admin/words'),
    userGet<AdminTopicNode[]>('/admin/topics', '/admin/words'),
  ]);
  if (!word) notFound();
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <Link href="/admin/words" className="btn btn-ghost -ml-2.5 mb-3">
        <ChevronLeft size={18} aria-hidden />
        {t('allWords')}
      </Link>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight" lang="en">
          {t('wordEditTitle', { word: word.headword })}
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          {t('slugNote', { slug: word.slug })} ·{' '}
          <Link href={`/words/${word.slug}`} className="inline-flex items-center gap-1 font-bold">
            {t('viewPublic')}
            <ExternalLink size={14} aria-hidden />
          </Link>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="card p-5 sm:p-6 lg:col-span-8">
          <WordForm word={word} topics={topics} />
        </section>
        <aside className="flex flex-col gap-5 lg:col-span-4">
          <section className="panel text-[14px]">
            <p className="font-bold">
              {t('wordCounts', { learners: n(word.counts.learners), notes: n(word.counts.notes), reviews: n(word.counts.reviews) })}
            </p>
            {word.counts.openReports > 0 && (
              <p className="mt-2">
                <span className="pill pill-danger">{t('openReports', { count: word.counts.openReports })}</span>{' '}
                <Link href={`/admin/feedback?wordId=${word.id}`} className="font-bold">
                  {t('seeReports')}
                </Link>
              </p>
            )}
            <p className="mt-2 text-muted">
              {t('colUpdated')}: {formatDate(word.updatedAt, locale, { hour: '2-digit', minute: '2-digit' })}
            </p>
            <Link href={`/admin/audit?targetType=word&targetId=${word.id}`} className="mt-2 inline-block font-bold">
              {t('nav_audit')}
            </Link>
          </section>
          <section className="panel">
            <WordDanger word={word} />
          </section>
        </aside>
      </div>
    </>
  );
}
