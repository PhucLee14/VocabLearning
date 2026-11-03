import { useLocale } from 'next-intl';

/**
 * Reviews due per day for the next week. Today (which includes overdue cards)
 * is the one bar in the accent; the rest are neutral.
 */
export function ForecastBars({ days, todayLabel }: { days: { date: string; count: number }[]; todayLabel: string }) {
  const locale = useLocale();
  const max = Math.max(1, ...days.map((d) => d.count));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return (
    <ol className="grid h-44 grid-cols-7 items-end gap-2 sm:gap-3">
      {days.map((d, i) => {
        const pct = d.count === 0 ? 0 : Math.max(6, Math.round((d.count / max) * 100));
        return (
          <li key={d.date} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className={`num text-[13px] font-extrabold ${d.count === 0 ? 'text-muted' : 'text-ink'}`}>
              {d.count}
            </span>
            <span className="flex w-full flex-1 items-end">
              <span
                className={`block w-full rounded-t-[10px] rounded-b-[4px] ${i === 0 ? 'bg-accent' : 'bg-line-strong'}`}
                style={{ height: pct === 0 ? 3 : `${pct}%`, opacity: pct === 0 ? 0.6 : 1 }}
              />
            </span>
            <span className={`text-[12px] font-bold ${i === 0 ? 'text-accent-ink' : 'text-muted'}`}>
              {i === 0 ? todayLabel : weekday.format(new Date(`${d.date}T00:00:00Z`))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
