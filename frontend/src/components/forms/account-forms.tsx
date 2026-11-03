'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';

/** Change the password; every other signed-in browser is signed out. */
export function PasswordForm() {
  const t = useTranslations('Settings');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'wrong' | 'error'>('idle');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setState('saving');
    try {
      await api('/me/password', {
        method: 'POST',
        body: { currentPassword: data.get('current'), newPassword: data.get('next') },
      });
      form.reset();
      setState('saved');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 403 ? 'wrong' : 'error');
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="pw-current" className="field-label">
          {t('currentPassword')}
        </label>
        <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
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
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-secondary" disabled={state === 'saving'}>
          {t('changePassword')}
        </button>
        <span role="status" className={`text-[13px] font-bold ${state === 'wrong' || state === 'error' ? 'text-danger' : 'text-muted'}`}>
          {state === 'saved' ? t('passwordChanged') : state === 'wrong' ? t('wrongPassword') : state === 'error' ? t('saveError') : ''}
        </span>
      </div>
    </form>
  );
}

/** Delete the account after confirming with the password. */
export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'deleting' | 'wrong' | 'error'>('idle');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('deleting');
    try {
      await api('/me/delete', { method: 'POST', body: { password: data.get('password') } });
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
      <div>
        <label htmlFor="del-pw" className="field-label">
          {t('currentPassword')}
        </label>
        <input id="del-pw" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-danger" disabled={state === 'deleting'}>
          {t('deleteForever')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          {t('cancel')}
        </button>
        <span role="status" className="text-[13px] font-bold text-danger">
          {state === 'wrong' ? t('wrongPassword') : state === 'error' ? t('saveError') : ''}
        </span>
      </div>
    </form>
  );
}
