'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/client-api';
import type { Role } from '@/lib/admin-types';
import { AdminMessage } from './admin-message';
import { useAdminAction } from './use-action';

/** Role, disable / enable and "sign out everywhere" for one user. */
export function UserActions({
  user,
  isSelf,
}: {
  user: { id: string; email: string; role: Role; disabled: boolean };
  isSelf: boolean;
}) {
  const t = useTranslations('Admin');
  const { run, pending, error, notice } = useAdminAction();
  const patch = (body: { role?: Role; disabled?: boolean }) => () =>
    api(`/admin/users/${user.id}`, { method: 'PATCH', body });

  if (isSelf) return <p className="text-[14px] text-muted">{t('selfNote')}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {user.role === 'ADMIN' ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending}
            onClick={() => run(patch({ role: 'USER' }), { confirm: t('confirmMakeLearner', { email: user.email }) })}
          >
            {t('makeLearner')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending}
            onClick={() => run(patch({ role: 'ADMIN' }), { confirm: t('confirmMakeAdmin', { email: user.email }) })}
          >
            {t('makeAdmin')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending}
          onClick={() =>
            run(() => api<{ revoked: number }>(`/admin/users/${user.id}/revoke-sessions`, { method: 'POST' }), {
              confirm: t('confirmRevoke', { email: user.email }),
              done: (r) => t('revoked', { count: r.revoked }),
            })
          }
        >
          {t('revokeSessions')}
        </button>
        {user.disabled ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => run(patch({ disabled: false }), { confirm: t('confirmEnable', { email: user.email }) })}
          >
            {t('enable')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={() => run(patch({ disabled: true }), { confirm: t('confirmDisable', { email: user.email }) })}
          >
            {t('disable')}
          </button>
        )}
      </div>
      <AdminMessage error={error} notice={notice} />
    </div>
  );
}
