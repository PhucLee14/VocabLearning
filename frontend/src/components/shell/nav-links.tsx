'use client';

import {
  BookCheck,
  BookOpen,
  ChartColumn,
  Ellipsis,
  GraduationCap,
  House,
  Layers,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

type NavKey = 'home' | 'learn' | 'flashcards' | 'learned' | 'unlearned' | 'topics' | 'progress';

type NavItem = {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Is this item the current screen? */
  match: (path: string, status: string | null) => boolean;
};

const words = (path: string) => path === '/words';

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', href: '/dashboard', icon: House, match: (p) => p === '/dashboard' },
  { key: 'learn', href: '/learn', icon: GraduationCap, match: (p) => p.startsWith('/learn') },
  { key: 'flashcards', href: '/flashcards', icon: Layers, match: (p) => p.startsWith('/flashcards') },
  {
    key: 'learned',
    href: '/words?status=learned',
    icon: BookCheck,
    match: (p, s) => words(p) && (s === 'learned' || s === 'due' || s === 'known' || s === 'learning'),
  },
  {
    key: 'unlearned',
    href: '/words?status=new',
    icon: BookOpen,
    match: (p, s) => words(p) && (s === 'new' || s === null || s === 'all'),
  },
  { key: 'topics', href: '/topics', icon: LayoutGrid, match: (p) => p.startsWith('/topics') },
  { key: 'progress', href: '/progress', icon: ChartColumn, match: (p) => p.startsWith('/progress') },
];

function useActive() {
  const pathname = usePathname();
  const status = useSearchParams().get('status');
  return (item: NavItem) => item.match(pathname, status);
}

/** Sidebar links (desktop). `badges` holds server-rendered counts, e.g. cards due. */
export function SidebarLinks({ badges = {} }: { badges?: Partial<Record<NavKey, ReactNode>> }) {
  const t = useTranslations('Nav');
  const isActive = useActive();
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold no-underline transition-colors ${
                active ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={2} aria-hidden className="flex-none" />
              <span className="flex-1">{t(item.key)}</span>
              {badges[item.key]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Static fallback while search params are not known yet (prerender): no active item. */
export function SidebarLinksFallback() {
  const t = useTranslations('Nav');
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ key, href, icon: Icon }) => (
        <li key={key}>
          <Link
            href={href}
            className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold text-muted no-underline"
          >
            <Icon size={20} strokeWidth={2} aria-hidden className="flex-none" />
            {t(key)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const BOTTOM: NavKey[] = ['home', 'learn', 'flashcards', 'unlearned'];

/** Bottom bar (phone and tablet): four destinations and "More". "Words" covers both word lists. */
export function BottomLinks({
  badges = {},
  more,
}: {
  badges?: Partial<Record<NavKey, ReactNode>>;
  more: ReactNode;
}) {
  const t = useTranslations('Nav');
  const pathname = usePathname();
  const isActive = useActive();
  return (
    <ul className="grid grid-cols-5">
      {BOTTOM.map((key) => {
        const item = NAV_ITEMS.find((i) => i.key === key) as NavItem;
        const active = key === 'unlearned' ? words(pathname) : isActive(item);
        const Icon = item.icon;
        return (
          <li key={key}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-bold no-underline ${
                active ? 'text-accent-ink' : 'text-muted'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {key === 'unlearned' ? t('words') : t(key)}
              {badges[key] ? <span className="absolute top-1 left-1/2 ml-2.5">{badges[key]}</span> : null}
            </Link>
          </li>
        );
      })}
      <li>{more}</li>
    </ul>
  );
}

export function MoreIcon() {
  return <Ellipsis size={22} strokeWidth={2} aria-hidden />;
}
