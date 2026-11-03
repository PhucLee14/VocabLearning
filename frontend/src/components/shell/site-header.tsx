import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Logo } from '@/components/logo';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Link } from '@/i18n/navigation';

/** Header of the public pages (landing, sign in, sign up). */
export function SiteHeader() {
  const t = useTranslations('Nav');
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/topics" className="btn-ghost btn hidden sm:inline-flex">
            {t('topics')}
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
          <Link href="/login" className="btn btn-ghost">
            {t('signIn')}
          </Link>
          <Link href="/register" className="btn btn-primary btn-sm">
            {t('signUp')}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const t = useTranslations('Footer');
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
        <p>{t('note')}</p>
        <div className="flex items-center gap-2 md:hidden">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}
