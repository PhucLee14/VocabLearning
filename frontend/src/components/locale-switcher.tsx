'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/**
 * VI / EN switch. The current path is only known at request time on dynamic
 * routes (/words/[slug]), so the interactive part streams in behind <Suspense>;
 * the fallback shows the same buttons, inert.
 */
export function LocaleSwitcher() {
  return (
    <Suspense fallback={<Buttons disabled />}>
      <InteractiveSwitcher />
    </Suspense>
  );
}

function InteractiveSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  return (
    <Buttons
      disabled={isPending}
      onPick={(locale) =>
        startTransition(() => {
          // Keep the query string (e.g. /words?status=new) when switching language.
          const search = typeof window === 'undefined' ? '' : window.location.search;
          router.replace(`${pathname}${search}`, { locale });
        })
      }
    />
  );
}

function Buttons({ disabled, onPick }: { disabled?: boolean; onPick?: (locale: (typeof routing.locales)[number]) => void }) {
  const t = useTranslations('LocaleSwitcher');
  const current = useLocale();
  return (
    <div role="group" aria-label={t('label')} className="seg">
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          title={t(locale)}
          aria-pressed={locale === current}
          disabled={disabled}
          onClick={() => onPick?.(locale)}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
