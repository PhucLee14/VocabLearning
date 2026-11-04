'use client';

import { ChartColumn, LayoutGrid, Settings, UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { MoreIcon } from './nav-links';
import { SignOutButton } from './sign-out-button';

const LINKS = [
  { key: 'topics', href: '/topics', icon: LayoutGrid },
  { key: 'progress', href: '/progress', icon: ChartColumn },
  { key: 'profile', href: '/profile', icon: UserRound },
  { key: 'settings', href: '/settings', icon: Settings },
] as const;

/** "More" on the phone's bottom bar: a sheet with the other screens and sign out (theme and language are in Settings). */
export function MoreSheet() {
  const t = useTranslations('Nav');
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close when a link inside navigates.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const row =
    'flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-[16px] font-bold text-ink no-underline hover:bg-surface';

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => dialog.current?.showModal()}
        className="flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[12px] font-bold text-muted"
      >
        <MoreIcon />
        {t('more')}
      </button>
      <dialog
        ref={dialog}
        onToggle={(e) => setOpen((e.target as HTMLDialogElement).open)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-canvas p-0 text-ink shadow-[0_-8px_32px_rgba(0,0,0,0.18)] backdrop:bg-black/40"
      >
        <div className="px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-center justify-between">
            <p className="px-3 text-lg font-extrabold">{t('more')}</p>
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => dialog.current?.close()}
              className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface"
            >
              <X size={22} aria-hidden />
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {LINKS.map(({ key, href, icon: Icon }) => (
              <li key={key}>
                <Link href={href} className={row} onClick={() => dialog.current?.close()}>
                  <Icon size={20} strokeWidth={2} aria-hidden className="text-muted" />
                  {t(key)}
                </Link>
              </li>
            ))}
            <li>
              <SignOutButton className={`${row} text-left`} />
            </li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
