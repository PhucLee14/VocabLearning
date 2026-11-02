import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';

export function SiteHeader() {
  const t = useTranslations('Header');

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-[15px] font-bold tracking-tight text-ink no-underline"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-md bg-accent text-sm text-on-accent"
          >
            V
          </span>
          {t('brand')}
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
