import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TopicManager } from '@/components/admin/topic-manager';
import type { AdminTopicNode } from '@/lib/admin-types';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('topicsTitle') };
}

export default async function AdminTopics() {
  const [t, tree] = await Promise.all([getTranslations('Admin'), userGet<AdminTopicNode[]>('/admin/topics', '/admin/topics')]);
  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('topicsTitle')}</h1>
        <p className="mt-1 max-w-[720px] text-[15px] text-muted">{t('topicsLede')}</p>
      </header>
      <div className="max-w-[900px]">
        <TopicManager tree={tree} />
      </div>
    </>
  );
}
