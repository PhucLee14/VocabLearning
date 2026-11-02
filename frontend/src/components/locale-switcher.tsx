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
    <div role="group" aria-label={t('label')} className="seg">
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          title={t(locale)}
          aria-pressed={locale === current}
          disabled={isPending}
          onClick={() => startTransition(() => router.replace(pathname, { locale }))}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
