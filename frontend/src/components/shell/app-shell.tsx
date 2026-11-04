import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import { Avatar } from '@/components/avatar';
import { Logo } from '@/components/logo';
import { Link } from '@/i18n/navigation';
import { getDueCount, getViewer } from '@/lib/server-api';
import { MoreSheet } from './more-sheet';
import { BottomLinks, SidebarLinks, SidebarLinksFallback } from './nav-links';
import { SignOutButton } from './sign-out-button';

/**
 * The signed-in app: a labelled sidebar on the page ground (desktop, ≥1024px),
 * or a top bar plus a bottom bar of five destinations (phone and tablet).
 * Everything that reads the session streams in behind <Suspense>.
 * Theme and language live on the Settings page (and in the public header).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Nav');
  const dueBadge = (
    <Suspense fallback={null}>
      <DueBadge />
    </Suspense>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line px-4 py-6 lg:flex">
        <div className="px-3 pb-6">
          <Logo href="/dashboard" />
        </div>
        <nav aria-label={t('label')} className="flex-1 overflow-y-auto">
          <Suspense fallback={<SidebarLinksFallback />}>
            <SidebarLinks badges={{ flashcards: dueBadge }} />
          </Suspense>
        </nav>
        <div className="flex flex-col gap-1 border-t border-line pt-4">
          <Suspense fallback={<div className="h-14" />}>
            <ViewerRow />
          </Suspense>
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold text-muted no-underline hover:bg-surface hover:text-ink"
          >
            <Settings size={20} strokeWidth={2} aria-hidden />
            {t('settings')}
          </Link>
          <SignOutButton className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-bold text-muted hover:bg-surface hover:text-ink" />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Phone / tablet top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
          <Logo href="/dashboard" />
          <Suspense fallback={<div className="size-9" />}>
            <ViewerAvatarLink />
          </Suspense>
        </header>

        <main className="flex-1 pb-24 lg:pb-0">{children}</main>

        {/* Phone / tablet bottom bar */}
        <nav
          aria-label={t('label')}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <Suspense fallback={<div className="h-16" />}>
            <BottomLinks badges={{ flashcards: dueBadge }} more={<MoreSheet />} />
          </Suspense>
        </nav>
      </div>
    </div>
  );
}

/** Page frame inside the shell: one centred 1100px column with equal margins. */
export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-9 ${narrow ? 'max-w-[760px]' : 'max-w-[1180px]'}`}>
      {children}
    </div>
  );
}

async function ViewerRow() {
  const viewer = await getViewer();
  if (!viewer) return <SignInLink />;
  return (
    <Link
      href="/profile"
      className="flex min-h-14 items-center gap-3 rounded-2xl px-3 text-ink no-underline hover:bg-surface"
    >
      <Avatar id={viewer.id} name={viewer.name} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-extrabold">{viewer.name}</span>
        <span className="block truncate text-[13px] text-muted">{viewer.email}</span>
      </span>
    </Link>
  );
}

async function ViewerAvatarLink() {
  const viewer = await getViewer();
  if (!viewer) return <SignInLink compact />;
  return (
    <Link href="/profile" aria-label={viewer.name} className="rounded-full">
      <Avatar id={viewer.id} name={viewer.name} size={34} />
    </Link>
  );
}

function SignInLink({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Nav');
  return (
    <Link href="/login" className={compact ? 'btn btn-primary btn-sm' : 'btn btn-primary mx-3'}>
      {t('signIn')}
    </Link>
  );
}

/** Cards due now, next to "Flashcards". Only shown when there is something to review. */
async function DueBadge() {
  const due = await getDueCount();
  if (due === 0) return null;
  return <span className="pill pill-streak">{due > 99 ? '99+' : due}</span>;
}
