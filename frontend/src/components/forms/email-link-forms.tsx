'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';

/** Title + lede column shared by the account-email pages (same frame as sign-in). */
export function EmailPageFrame({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[460px] px-4 py-12 sm:py-16">
      <h1 className="text-[30px] font-extrabold tracking-tight">{title}</h1>
      {lede && <p className="mt-2 text-[16px] text-muted">{lede}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl px-4 py-3 text-[15px] font-bold ${tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-ink'}`}
    >
      {children}
    </p>
  );
}

/**
 * The token arrives in the URL fragment (#token=…), which never reaches a
 * server. Read it once, then drop it from the address bar and history.
 */
function useFragmentToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Reading location is only possible after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null);
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  }, []);
  return token;
}

export function ForgotPasswordForm() {
  const t = useTranslations('AccountEmail');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'tooMany' | 'error'>('idle');
  const [email, setEmail] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('email') ?? '');
    setState('sending');
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: value } });
      setEmail(value);
      setState('sent');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? 'tooMany' : 'error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="ok">{t('forgotSent', { email })}</Notice>
        <Link href="/login" className="btn btn-secondary w-full">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="f-email" className="field-label">
          {t('email')}
        </label>
        <input id="f-email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      {(state === 'tooMany' || state === 'error') && (
        <Notice tone="error">{state === 'tooMany' ? t('tooMany') : t('error')}</Notice>
      )}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={state === 'sending'}>
        {t('forgotSubmit')}
      </button>
      <p className="text-center text-[15px] text-muted">
        <Link href="/login" className="font-bold">
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations('AccountEmail');
  const token = useFragmentToken();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'invalid' | 'tooMany' | 'error'>('idle');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('saving');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: data.get('next') } });
      setState('done');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setState(status === 400 ? 'invalid' : status === 429 ? 'tooMany' : 'error');
    }
  }

  if (token === undefined) return <div className="h-[220px] rounded-[22px] bg-surface" aria-hidden />;
  if (token === null || state === 'invalid') {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="error">{t('linkInvalid')}</Notice>
        <Link href="/forgot-password" className="btn btn-primary w-full">
          {t('askAgain')}
        </Link>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="ok">{t('resetDone')}</Notice>
        <Link href="/login" className="btn btn-primary w-full">
          {t('toLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="r-next" className="field-label">
          {t('newPassword')}
        </label>
        <input
          id="r-next"
          name="next"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          aria-describedby="r-rule"
          className="input"
        />
        <p id="r-rule" className="mt-1.5 text-[13px] text-muted">
          {t('passwordRule')}
        </p>
      </div>
      {(state === 'tooMany' || state === 'error') && (
        <Notice tone="error">{state === 'tooMany' ? t('tooMany') : t('error')}</Notice>
      )}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={state === 'saving'}>
        {t('resetSubmit')}
      </button>
    </form>
  );
}

/**
 * Verification asks for a click instead of verifying on load: some mail
 * scanners open links (and may run scripts), and a verified email matters
 * for account linking (see the backend's signInWithGoogle).
 */
export function VerifyEmailForm() {
  const t = useTranslations('AccountEmail');
  const token = useFragmentToken();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'invalid' | 'tooMany' | 'error'>('idle');

  async function confirm() {
    setState('saving');
    try {
      await api('/auth/verify-email', { method: 'POST', body: { token } });
      setState('done');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setState(status === 400 ? 'invalid' : status === 429 ? 'tooMany' : 'error');
    }
  }

  if (token === undefined) return <div className="h-[120px] rounded-[22px] bg-surface" aria-hidden />;
  if (token === null || state === 'invalid') {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="error">{t('verifyInvalid')}</Notice>
        <Link href="/settings" className="btn btn-secondary w-full">
          {t('toSettings')}
        </Link>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="ok">{t('verifyDone')}</Notice>
        <Link href="/dashboard" className="btn btn-primary w-full">
          {t('toApp')}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {(state === 'tooMany' || state === 'error') && (
        <Notice tone="error">{state === 'tooMany' ? t('tooMany') : t('error')}</Notice>
      )}
      <button type="button" className="btn btn-primary btn-lg w-full" onClick={confirm} disabled={state === 'saving'}>
        {t('verifySubmit')}
      </button>
    </div>
  );
}

/** "Your email isn't verified" with a resend button (dashboard and settings). */
export function VerifyEmailNotice({ email }: { email: string }) {
  const t = useTranslations('AccountEmail');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'tooMany' | 'error'>('idle');

  async function resend() {
    setState('sending');
    try {
      await api('/auth/verify-email/send', { method: 'POST' });
      setState('sent');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? 'tooMany' : 'error');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-warning-soft px-5 py-4 text-warning-ink sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px]" role="status">
        <span className="font-bold">{t('unverifiedTitle')}</span>{' '}
        {state === 'sent'
          ? t('unverifiedSent', { email })
          : state === 'tooMany'
            ? t('tooMany')
            : state === 'error'
              ? t('error')
              : t('unverifiedBody', { email })}
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm shrink-0"
        onClick={resend}
        disabled={state === 'sending' || state === 'sent'}
      >
        {t('unverifiedResend')}
      </button>
    </div>
  );
}
