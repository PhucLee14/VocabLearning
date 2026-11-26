import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { AdminNav, AdminNavFallback } from '@/components/admin/admin-nav';
import { Logo } from '@/components/logo';
import { SessionKeepAlive } from '@/components/shell/session-keep-alive';
import { Link } from '@/i18n/navigation';
import { userGet } from '@/lib/server-api';
import type { Profile } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: { default: t('title'), template: `%s · ${t('title')}` }, robots: { index: false, follow: false } };
}

/**
 * The admin site: its own frame, outside the learner's app shell. Every
 * page streams in behind <AdminGate>, which shows our 404 to anyone who is
 * not an admin (the API refuses them with 403 anyway).
 */
export default async function AdminLayout({ children }: LayoutProps<'/[locale]/admin'>) {
  const t = await getTranslations('Admin');
  return (
    <div className="min-h-screen">
      <SessionKeepAlive />
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-10">
          <Logo href="/admin" />
          <span className="pill pill-streak">{t('title')}</span>
          <Link href="/dashboard" className="btn btn-ghost btn-sm ml-auto">
            <ChevronLeft size={18} aria-hidden />
            {t('backToApp')}
          </Link>
        </div>
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-3 sm:px-6 lg:px-10">
          <Suspense fallback={<AdminNavFallback />}>
            <AdminNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Suspense fallback={<div className="h-[480px] rounded-[22px] bg-surface" aria-hidden />}>
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </main>
    </div>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  const me = await userGet<Profile>('/me', '/admin');
  if (me.role !== 'ADMIN') notFound();
  return children;
}
