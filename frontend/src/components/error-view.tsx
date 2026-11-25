'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Logo } from '@/components/logo';
import { Link } from '@/i18n/navigation';

/**
 * What an error boundary (`error.tsx`) shows: what happened, "Try again" and a
 * way home. `standalone` is for boundaries above the site header / app shell:
 * the view then brings its own logo and fills the screen.
 *
 * Errors from Server Components reach the browser without their message (in
 * production); `digest` is the id of the full error in the server's logs.
 */
export function ErrorView({ error, retry, standalone = false }: { error: unknown; retry: () => void; standalone?: boolean }) {
  const t = useTranslations('Errors');
  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  const body = (
    <div role="alert" className="card w-full max-w-[480px] p-6 sm:p-8">
      <h1 className="text-[24px] font-extrabold tracking-tight">{t('errorTitle')}</h1>
      <p className="mt-2 text-[15px] text-muted">{t('errorBody')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          {t('retry')}
        </button>
        <Link href="/" className="btn btn-secondary">
          {t('home')}
        </Link>
      </div>
      {digest && <p className="num mt-5 text-[13px] text-muted">{t('code', { digest })}</p>}
    </div>
  );

  if (!standalone) return <div className="flex justify-center px-4 py-12 sm:py-20">{body}</div>;
  return (
    <div className="flex min-h-screen flex-col items-center gap-10 px-4 py-10 sm:py-16">
      <Logo />
      {body}
    </div>
  );
}
