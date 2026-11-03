import { useTranslations } from 'next-intl';

const FILL = ['bg-m1', 'bg-m2', 'bg-m3', 'bg-m4', 'bg-m5'];

/** Five segments filled up to the mastery level (0 New … 5 Long-term memory). */
export function MasteryMeter({ level, showLabel = false }: { level: number; showLabel?: boolean }) {
  const t = useTranslations('Mastery');
  const name = t(`level${level}` as 'level0');
  return (
    <span className="inline-flex items-center gap-2" title={name}>
      <span aria-hidden className="flex gap-[3px]">
        {FILL.map((fill, i) => (
          <span key={fill} className={`h-2 w-3.5 rounded-full ${i < level ? FILL[level - 1] : 'bg-m0'}`} />
        ))}
      </span>
      <span className={showLabel ? 'text-[13px] font-bold text-muted' : 'sr-only'}>{name}</span>
    </span>
  );
}
