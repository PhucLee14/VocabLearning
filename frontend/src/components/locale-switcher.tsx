'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex rounded-full border border-border bg-card p-0.5 text-sm"
    >
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            title={t(locale)}
            aria-pressed={active}
            disabled={isPending}
            onClick={() => startTransition(() => router.replace(pathname, { locale }))}
            className={`rounded-full px-3 py-1 font-medium transition-colors disabled:opacity-60 ${
              active ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
