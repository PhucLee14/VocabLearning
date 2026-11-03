'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';
import { GoogleButton } from './google-button';

const GOOGLE_ERRORS = [
  'google_cancelled',
  'google_failed',
  'google_unverified',
  'google_unavailable',
  'google_conflict',
] as const;

/** Only same-site paths, so ?next= cannot send the user to another site. */
function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/dashboard';
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  // Set by the backend when the Google flow ends in an error (?error=google_…).
  const googleError = GOOGLE_ERRORS.find((e) => e === params.get('error'));
  const [error, setError] = useState<string | null>(googleError ? t(`error_${googleError}`) : null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body:
          mode === 'login'
            ? { email: data.get('email'), password: data.get('password') }
            : {
                name: data.get('name'),
                email: data.get('email'),
                password: data.get('password'),
                locale,
              },
      });
      router.replace(next);
      router.refresh();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 401
          ? `${t('errorCredentials')} ${t('googleHint')}`
          : status === 409
            ? t('errorExists')
            : status === 400
              ? t('errorInvalid')
              : t('errorGeneric'),
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <GoogleButton href={`/api/auth/google?${new URLSearchParams({ next, locale })}`} label={t('google')} />
      <p className="flex items-center gap-3 text-[14px] text-muted before:h-px before:flex-1 before:bg-line-strong after:h-px after:flex-1 after:bg-line-strong">
        {t('or')}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {mode === 'register' && (
          <div>
            <label htmlFor="a-name" className="field-label">
              {t('name')}
            </label>
            <input id="a-name" name="name" required maxLength={80} autoComplete="name" className="input" />
          </div>
        )}
        <div>
          <label htmlFor="a-email" className="field-label">
            {t('email')}
          </label>
          <input id="a-email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label htmlFor="a-password" className="field-label">
            {t('password')}
          </label>
          <input
            id="a-password"
            name="password"
            type="password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            aria-describedby={mode === 'register' ? 'a-password-rule' : undefined}
            className="input"
          />
          {mode === 'register' && (
            <p id="a-password-rule" className="mt-1.5 text-[13px] text-muted">
              {t('passwordRule')}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending}>
          {mode === 'login' ? t('submitLogin') : t('submitRegister')}
        </button>
        <p className="text-center text-[15px] text-muted">
          {mode === 'login' ? t('noAccount') : t('haveAccount')}{' '}
          <Link
            href={{
              pathname: mode === 'login' ? '/register' : '/login',
              query: next !== '/dashboard' ? { next } : {},
            }}
            className="font-bold"
          >
            {mode === 'login' ? t('toRegister') : t('toLogin')}
          </Link>
        </p>
      </form>
    </div>
  );
}
