import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { AuthForm } from './auth-form';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('Auth');
  return (
    <div className="mx-auto w-full max-w-[460px] px-4 py-12 sm:py-16">
      <h1 className="text-[30px] font-extrabold tracking-tight">{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
      <p className="mt-2 mb-8 text-[16px] text-muted">{mode === 'login' ? t('loginLede') : t('registerLede')}</p>
      {/* useSearchParams (?next=) needs a boundary during prerendering. */}
      <Suspense fallback={<div className="h-[320px] rounded-[22px] bg-surface" aria-hidden />}>
        <AuthForm mode={mode} />
      </Suspense>
    </div>
  );
}
