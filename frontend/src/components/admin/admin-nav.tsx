'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const ITEMS = [
  { key: 'nav_dashboard', href: '/admin' },
  { key: 'nav_feedback', href: '/admin/feedback' },
  { key: 'nav_words', href: '/admin/words' },
  { key: 'nav_topics', href: '/admin/topics' },
  { key: 'nav_import', href: '/admin/import' },
  { key: 'nav_users', href: '/admin/users' },
  { key: 'nav_audit', href: '/admin/audit' },
] as const;

/** The admin sections as a segmented row (scrolls sideways on phones). */
export function AdminNav() {
  const t = useTranslations('Admin');
  const pathname = usePathname();
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));
  return (
    <nav aria-label={t('navLabel')} className="seg max-w-full overflow-x-auto">
      {ITEMS.map(({ key, href }) => (
        <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}>
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

/** Before the pathname is known (prerender): the same links, none marked. */
export function AdminNavFallback() {
  const t = useTranslations('Admin');
  return (
    <nav aria-label={t('navLabel')} className="seg max-w-full overflow-x-auto">
      {ITEMS.map(({ key, href }) => (
        <Link key={href} href={href}>
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
