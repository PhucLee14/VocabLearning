import { Check } from 'lucide-react';
import { useLocale } from 'next-intl';

/** The last seven days: a filled dot for each day the goal was met, today outlined. */
export function WeekStrip({ days }: { days: { date: string; goalMet: boolean; isToday: boolean }[] }) {
  const locale = useLocale();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <ol className="flex justify-between gap-1">
      {days.map((d) => (
        <li key={d.date} className="flex flex-col items-center gap-1" title={long.format(new Date(`${d.date}T00:00:00Z`))}>
          <span
            className={`grid size-7 place-items-center rounded-full ${
              d.goalMet ? 'bg-streak text-white' : d.isToday ? 'border-2 border-dashed border-streak' : 'bg-sunken'
            }`}
          >
            {d.goalMet && <Check size={15} strokeWidth={3.2} aria-hidden />}
          </span>
          <span className={`text-[11px] font-bold ${d.isToday ? 'text-ink' : 'text-muted'}`}>
            {weekday.format(new Date(`${d.date}T00:00:00Z`))}
          </span>
        </li>
      ))}
    </ol>
  );
}
