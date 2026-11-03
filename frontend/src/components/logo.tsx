import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** The product mark: two stacked flashcards, the front one ticked. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="flex-none">
      <rect x="7" y="3" width="21" height="24" rx="6" fill="var(--accent-soft)" />
      <rect x="3" y="7" width="21" height="22" rx="6" fill="var(--accent)" />
      <path
        d="M8.5 17.5l3.5 3.5 7-8"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  const t = useTranslations('Metadata');
  return (
    <Link href={href} className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight text-ink no-underline">
      <LogoMark />
      {t('brand')}
    </Link>
  );
}
