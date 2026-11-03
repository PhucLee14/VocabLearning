import { useLocale, useTranslations } from 'next-intl';

const FILL = ['var(--m0)', 'var(--m2)', 'var(--m3)', 'var(--m4)', 'var(--m5)'];

/**
 * A year of study, GitHub style: one square per day, columns are weeks
 * (Monday first), darker = more cards. Thresholds are relative to the
 * learner's own busiest day so a light year still shows its shape.
 */
export function Heatmap({ today, days }: { today: string; days: { date: string; count: number }[] }) {
  const t = useTranslations('Progress');
  const locale = useLocale();
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const max = Math.max(0, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : max <= 4 ? Math.min(4, n) : Math.min(4, Math.ceil((n / max) * 4)));

  // Start on the Monday 52 weeks before this week's Monday.
  const end = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (end.getUTCDay() + 6) % 7;
  const start = new Date(end.getTime() - (mondayOffset + 52 * 7) * 86_400_000);
  const weeks: { date: string; count: number; future: boolean }[][] = [];
  for (let w = 0; w < 53; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      col.push({ date: key, count: byDate.get(key) ?? 0, future: date > end });
    }
    weeks.push(col);
  }
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        {/* 53 equal week columns that fill the card (at least 11px, then it scrolls); square days.
            Month labels overflow into the next columns instead of widening theirs. */}
        <div className="grid min-w-[740px] grid-flow-col gap-[3px]" style={{ gridTemplateRows: '20px repeat(7, auto)', gridAutoColumns: 'minmax(11px, 1fr)' }}>
          {weeks.map((col, w) => {
            const first = new Date(`${col[0].date}T00:00:00Z`);
            const showMonth = w === 0 || first.getUTCDate() <= 7;
            return (
              <div key={col[0].date} className="contents">
                <span className="h-5 overflow-visible text-[11px] font-bold whitespace-nowrap text-muted">
                  {showMonth ? month.format(first) : ''}
                </span>
                {col.map((d) => (
                  <span
                    key={d.date}
                    title={d.future ? undefined : t('heatDay', { date: dayFmt.format(new Date(`${d.date}T00:00:00Z`)), count: d.count })}
                    className="aspect-square w-full rounded-[3px]"
                    style={{ background: d.future ? 'transparent' : FILL[level(d.count)] }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[12px] text-muted">
        {t('less')}
        {FILL.map((f) => (
          <span key={f} aria-hidden className="size-3 rounded-[3px]" style={{ background: f }} />
        ))}
        {t('more')}
      </div>
    </div>
  );
}
