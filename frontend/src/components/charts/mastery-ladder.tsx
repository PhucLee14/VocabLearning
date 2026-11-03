import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';

const FILL = ['bg-m0', 'bg-m1', 'bg-m2', 'bg-m3', 'bg-m4', 'bg-m5'];

/**
 * How many words sit at each mastery level: one stacked bar (the ramp goes
 * from pale "learning" to deep "long-term memory") and the counts as a list,
 * so every swatch is the mark it explains.
 */
export function MasteryLadder({
  counts,
  includeNew = true,
}: {
  counts: Record<string, number>;
  includeNew?: boolean;
}) {
  const t = useTranslations('Mastery');
  const locale = useLocale();
  const levels = includeNew ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
  const total = levels.reduce((n, l) => n + (counts[l] ?? 0), 0);

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-m0" aria-hidden>
        {total > 0 &&
          levels.map((l) =>
            counts[l] ? <span key={l} className={FILL[l]} style={{ width: `${(counts[l] / total) * 100}%` }} /> : null,
          )}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {levels.map((l) => (
          <li key={l} className="flex items-center gap-2.5 text-[14px]">
            <span aria-hidden className={`size-3 flex-none rounded-full ${FILL[l]}`} />
            <span className="flex-1 text-muted">{t(`level${l}` as 'level0')}</span>
            <span className={`num font-extrabold ${counts[l] ? 'text-ink' : 'text-muted'}`}>
              {formatNumber(counts[l] ?? 0, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
