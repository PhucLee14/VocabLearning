'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';

type ConfirmAction = 'set_password' | 'delete_account';

/**
 * "Send code" + a 6-digit code input. The backend emails the code
 * (POST /me/confirm-code) and checks it when the form is submitted.
 */
function CodeField({ action, email }: { action: ConfirmAction; email: string }) {
  const t = useTranslations('Settings');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'wait' | 'error'>('idle');

  async function send() {
    setState('sending');
    try {
      await api('/me/confirm-code', { method: 'POST', body: { action } });
      setState('sent');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? 'wait' : 'error');
    }
  }

  return (
    <div>
      <label htmlFor={`code-${action}`} className="field-label">
        {t('code')}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={`code-${action}`}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="123456"
          aria-describedby={`code-${action}-help`}
          className="input max-w-[160px] tracking-[0.3em]"
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={send} disabled={state === 'sending'}>
          {state === 'sent' || state === 'wait' ? t('codeResend') : t('codeSend')}
        </button>
      </div>
      <p
        id={`code-${action}-help`}
        role="status"
        className={`mt-1.5 text-[13px] ${state === 'error' || state === 'wait' ? 'text-danger' : 'text-muted'}`}
      >
        {state === 'sent'
          ? t('codeSent', { email })
          : state === 'wait'
            ? t('codeWait')
            : state === 'error'
              ? t('codeSendError')
              : t('codeHelp', { email })}
      </p>
    </div>
  );
}

/**
 * Change the password, or set a first one for a Google-only account (then
 * confirmed with a code emailed to the account). Every other signed-in
 * browser is signed out.
 */
export function PasswordForm({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'wrong' | 'error'>('idle');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setState('saving');
    try {
      await api('/me/password', {
        method: 'POST',
        body: {
          ...(hasPassword ? { currentPassword: data.get('current') } : { code: data.get('code') }),
          newPassword: data.get('next'),
        },
      });
      form.reset();
      setState('saved');
      if (!hasPassword) router.refresh();
    } catch (error) {
      setState(error instanceof ApiError && error.status === 403 ? 'wrong' : 'error');
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {hasPassword ? (
        <div>
          <label htmlFor="pw-current" className="field-label">
            {t('currentPassword')}
          </label>
          <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input" />
        </div>
      ) : (
        <p className="text-[15px] text-muted">{t('setPasswordLede')}</p>
      )}
      <div>
        <label htmlFor="pw-next" className="field-label">
          {t('newPassword')}
        </label>
        <input
          id="pw-next"
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="pw-rule"
          className="input"
        />
        <p id="pw-rule" className="mt-1.5 text-[13px] text-muted">
          {t('passwordRule')}
        </p>
      </div>
      {!hasPassword && <CodeField action="set_password" email={email} />}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-secondary" disabled={state === 'saving'}>
          {hasPassword ? t('changePassword') : t('setPassword')}
        </button>
        <span role="status" className={`text-[13px] font-bold ${state === 'wrong' || state === 'error' ? 'text-danger' : 'text-muted'}`}>
          {state === 'saved'
            ? hasPassword
              ? t('passwordChanged')
              : t('passwordSet')
            : state === 'wrong'
              ? hasPassword
                ? t('wrongPassword')
                : t('wrongCode')
              : state === 'error'
                ? t('saveError')
                : ''}
        </span>
      </div>
    </form>
  );
}

/** Delete the account after confirming with the password, or with an emailed code (Google-only accounts). */
export function DeleteAccountForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'deleting' | 'wrong' | 'error'>('idle');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('deleting');
    try {
      await api('/me/delete', {
        method: 'POST',
        body: hasPassword ? { password: data.get('password') } : { code: data.get('code') },
      });
      router.replace('/');
      router.refresh();
    } catch (error) {
      setState(error instanceof ApiError && error.status === 403 ? 'wrong' : 'error');
    }
  }

  if (!open) {
    return (
      <div>
        <p className="mb-4 text-[15px]">{t('deleteWarning', { email })}</p>
        <button type="button" className="btn btn-secondary text-danger" onClick={() => setOpen(true)}>
          {t('deleteAccount')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[15px]">{t('deleteConfirm', { email })}</p>
      {hasPassword ? (
        <div>
          <label htmlFor="del-pw" className="field-label">
            {t('currentPassword')}
          </label>
          <input id="del-pw" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
      ) : (
        <CodeField action="delete_account" email={email} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-danger" disabled={state === 'deleting'}>
          {t('deleteForever')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          {t('cancel')}
        </button>
        <span role="status" className="text-[13px] font-bold text-danger">
          {state === 'wrong' ? (hasPassword ? t('wrongPassword') : t('wrongCode')) : state === 'error' ? t('saveError') : ''}
        </span>
      </div>
    </form>
  );
}
