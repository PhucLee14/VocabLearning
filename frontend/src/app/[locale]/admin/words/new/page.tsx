import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WordForm } from '@/components/admin/word-form';
import { Link } from '@/i18n/navigation';
import type { AdminTopicNode } from '@/lib/admin-types';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('wordNewTitle') };
}

export default async function AdminNewWord() {
  const [t, topics] = await Promise.all([getTranslations('Admin'), userGet<AdminTopicNode[]>('/admin/topics', '/admin/words/new')]);
  return (
    <>
      <Link href="/admin/words" className="btn btn-ghost -ml-2.5 mb-3">
        <ChevronLeft size={18} aria-hidden />
        {t('allWords')}
      </Link>
      <h1 className="mb-6 text-[28px] font-extrabold tracking-tight">{t('wordNewTitle')}</h1>
      <section className="card max-w-[860px] p-5 sm:p-6">
        <WordForm topics={topics} />
      </section>
    </>
  );
}
