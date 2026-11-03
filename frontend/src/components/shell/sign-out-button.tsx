'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/client-api';

export function SignOutButton({ className = '' }: { className?: string }) {
  const t = useTranslations('Nav');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          router.replace('/login');
          router.refresh();
        })
      }
    >
      <LogOut size={20} strokeWidth={2} aria-hidden className="flex-none" />
      {t('signOut')}
    </button>
  );
}
